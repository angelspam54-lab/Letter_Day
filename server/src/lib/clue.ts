// The Clue: six riddles on the day's letter + a hidden theme. Answers never leave the server until a clue is done.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Db } from '../db/index.js';
import { config } from '../config.js';
import { LETTERS, daysBetween, lagosDate, letterFor } from '../../../shared/game.js';
import { CLUE_TRIES, NUDGE_COST, THEME_POINTS, THEME_TRIES, checkAnswer, checkTheme, cluePoints, letterCount, revealMask, shownLetters, canHint, FREE_NUDGE_AFTER } from '../../../shared/clue.js';
import type { ClueDay, ClueGuessResponse } from '../../../shared/types.js';
import { HttpError } from './game.js';

export interface ClueSet {
  id: string; letter: string; theme: string; themeAccept: string[]; themeHint: string;
  clues: { category: string; label: string; difficulty: 1 | 2 | 3; clue: string; answer: string; accept: string[]; fact: string }[];
}
interface ClueState {
  clues: { guesses: string[]; hints: number; solved: boolean; done: boolean; points: number }[];
  theme: { guesses: string[]; nudge: boolean; solved: boolean; done: boolean; points: number };
}

export function loadClueSets(): ClueSet[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = process.env.CLUES_FILE ?? ['../data/clues.json', '../../../../src/data/clues.json'].map((p) => join(here, p)).find(existsSync);
  return file ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export class Clues {
  private byLetter = new Map<string, ClueSet[]>();
  constructor(private db: Db, sets: ClueSet[]) {
    for (const s of sets) (this.byLetter.get(s.letter) ?? this.byLetter.set(s.letter, []).get(s.letter)!).push(s);
    for (const list of this.byLetter.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Day n uses the day's letter; each pass through the alphabet uses that letter's next set. */
  setFor(date: string): ClueSet | null {
    const n = daysBetween(config.launchDate, date);
    const list = this.byLetter.get(letterFor(n));
    if (!list?.length) return null;
    return list[Math.floor(n / LETTERS.length) % list.length];
  }

  private async load(playerId: string, date: string, set: ClueSet): Promise<ClueState> {
    const row = (await this.db.query<{ state: ClueState }>(`SELECT state FROM clue_plays WHERE player_id = $1 AND date = $2`, [playerId, date]))[0];
    return row?.state ?? {
      clues: set.clues.map(() => ({ guesses: [], hints: 0, solved: false, done: false, points: 0 })),
      theme: { guesses: [], nudge: false, solved: false, done: false, points: 0 },
    };
  }

  private async save(playerId: string, date: string, set: ClueSet, st: ClueState) {
    const score = st.clues.reduce((n, c) => n + c.points, 0) + st.theme.points;
    await this.db.query(
      `INSERT INTO clue_plays (player_id, date, set_id, state, score, finished_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
       ON CONFLICT (player_id, date) DO UPDATE SET state = EXCLUDED.state, score = EXCLUDED.score, finished_at = COALESCE(clue_plays.finished_at, EXCLUDED.finished_at)`,
      [playerId, date, set.id, JSON.stringify(st), score, st.theme.done ? new Date() : null]);
  }

  private async view(playerId: string, date: string, set: ClueSet, st: ClueState): Promise<ClueDay> {
    const others = await this.db.query<{ state: ClueState }>(`SELECT state FROM clue_plays WHERE date = $1`, [date]);
    const players = others.length;
    const pct = (f: (s: ClueState) => boolean) => (players ? Math.round((others.filter((o) => f(o.state)).length / players) * 100) : 0);
    const allDone = st.clues.every((c) => c.done);
    return {
      date, number: daysBetween(config.launchDate, date) + 1, letter: set.letter, players,
      clues: set.clues.map((c, i) => {
        const s = st.clues[i];
        return {
          index: i, category: c.category, label: c.label, difficulty: c.difficulty, clue: c.clue,
          mask: revealMask(c.answer, s.done ? letterCount(c.answer) : shownLetters(c.answer, s.hints, s.guesses.length)),
          guesses: s.guesses, hints: s.hints, solved: s.solved, done: s.done, points: s.points,
          ...(s.done ? { answer: c.answer, fact: c.fact, solvedPct: pct((o) => o.clues[i]?.solved) } : {}),
        };
      }),
      theme: {
        unlocked: allDone, guesses: st.theme.guesses, nudge: st.theme.nudge || st.theme.guesses.length >= FREE_NUDGE_AFTER ? set.themeHint : null, solved: st.theme.solved, done: st.theme.done,
        points: st.theme.points, ...(st.theme.done ? { answer: set.theme, solvedPct: pct((o) => o.theme.solved) } : {}),
      },
      score: st.clues.reduce((n, c) => n + c.points, 0) + st.theme.points,
      finished: st.theme.done,
    };
  }

  private today(now: Date) {
    const date = lagosDate(now);
    const set = this.setFor(date);
    if (!set) throw new HttpError(404, "Today's clues aren't ready yet");
    return { date, set };
  }

  async day(playerId: string, now = new Date()): Promise<ClueDay> {
    const { date, set } = this.today(now);
    return this.view(playerId, date, set, await this.load(playerId, date, set));
  }

  async guess(playerId: string, index: number, raw: string, now = new Date()): Promise<ClueGuessResponse> {
    const { date, set } = this.today(now);
    const st = await this.load(playerId, date, set);
    const c = set.clues[index];
    const s = st.clues[index];
    if (!c || !s) throw new HttpError(400, 'No such clue');
    if (s.done) throw new HttpError(409, 'That clue is already done');
    const text = String(raw ?? '').trim().slice(0, 40);
    if (!text) throw new HttpError(400, 'Type a guess');
    const result = checkAnswer(text, c.answer, c.accept);
    s.guesses.push(text);
    if (result === 'correct') { s.solved = true; s.done = true; s.points = cluePoints(s.guesses.length, s.hints); }
    else if (s.guesses.length >= CLUE_TRIES) s.done = true;
    await this.save(playerId, date, set, st);
    return { result, day: await this.view(playerId, date, set, st) };
  }

  /** Reveals the next letter of a clue's answer (costs points if solved later). */
  async hint(playerId: string, index: number, now = new Date()): Promise<ClueDay> {
    const { date, set } = this.today(now);
    const st = await this.load(playerId, date, set);
    const c = set.clues[index];
    const s = st.clues[index];
    if (!c || !s) throw new HttpError(400, 'No such clue');
    if (s.done) throw new HttpError(409, 'That clue is already done');
    if (!canHint(c.answer, s.hints, s.guesses.length)) throw new HttpError(400, "That's every hint for this one");
    s.hints++;
    await this.save(playerId, date, set, st);
    return this.view(playerId, date, set, st);
  }

  async theme(playerId: string, raw: string, now = new Date()): Promise<ClueGuessResponse> {
    const { date, set } = this.today(now);
    const st = await this.load(playerId, date, set);
    if (!st.clues.every((c) => c.done)) throw new HttpError(409, 'Finish all six clues to unlock the theme');
    if (st.theme.done) throw new HttpError(409, 'You already guessed the theme');
    const text = String(raw ?? '').trim().slice(0, 60);
    if (!text) throw new HttpError(400, 'Type a guess');
    st.theme.guesses.push(text);
    const ok = checkTheme(text, set.themeAccept);
    if (ok) { st.theme.solved = true; st.theme.done = true; st.theme.points = Math.max(20, THEME_POINTS[st.theme.guesses.length - 1] - (st.theme.nudge ? NUDGE_COST : 0)); }
    else if (st.theme.guesses.length >= THEME_TRIES) st.theme.done = true;
    await this.save(playerId, date, set, st);
    return { result: ok ? 'correct' : 'wrong', day: await this.view(playerId, date, set, st) };
  }

  async nudge(playerId: string, now = new Date()): Promise<ClueDay> {
    const { date, set } = this.today(now);
    const st = await this.load(playerId, date, set);
    if (!st.clues.every((c) => c.done)) throw new HttpError(409, 'Finish all six clues first');
    st.theme.nudge = true;
    await this.save(playerId, date, set, st);
    return this.view(playerId, date, set, st);
  }
}
