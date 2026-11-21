// The Ladder: a daily word ladder (start and end hidden behind clues, a twist of the day, gold themed words)
// and the puzzle maker that ladder races in Party Rooms use too.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Db } from '../db/index.js';
import { config } from '../config.js';
import { daysBetween, hash32, lagosDate } from '../../../shared/game.js';
import { checkAnswer, revealMask } from '../../../shared/clue.js';
import {
  GOLD_MAX, GOLD_POINTS, anagramIndex, climbPoints, distances, rng, shortestRoute, stepError, wordCluePoints, type Twist,
} from '../../../shared/ladder.js';
import type { LadderDay, LadderGuessResponse, LadderWordClue } from '../../../shared/types.js';
import { HttpError } from './game.js';
import { listHas } from './words.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.LADDER_DIR ?? ['../data/ladder', '../../../../src/data/ladder'].map((p) => join(here, p)).find(existsSync)!;
const lines = (f: string) => readFileSync(join(DIR, f), 'utf8').split('\n').map((l) => l.trim().split(' ')[0]).filter(Boolean);

/** Gold-word themes, drawn from Letter Day's category lists. */
export const THEMES = [
  { key: 'animal', label: 'Animals', lists: ['animal', 'bird'] },
  { key: 'food', label: 'Food and drink', lists: ['food', 'drink'] },
  { key: 'colour', label: 'Colours', lists: ['colour'] },
  { key: 'bodypart', label: 'Body parts', lists: ['bodypart'] },
  { key: 'clothing', label: 'Clothes', lists: ['clothing'] },
  { key: 'plant', label: 'Plants', lists: ['plant'] },
  { key: 'job', label: 'Jobs', lists: ['job'] },
  { key: 'sport', label: 'Sports and games', lists: ['sport'] },
  { key: 'vehicle', label: 'Ways to travel', lists: ['vehicle'] },
  { key: 'tool', label: 'Tools', lists: ['tool'] },
] as const;
const TWISTS = ['classic', 'moves', 'locked'] as const;

export interface LadderPuzzle { start: string; end: string; par: number; twist: Twist; theme: { key: string; label: string }; best: string[] }

/** The word data, loaded once. */
class Words {
  all = new Set(lines('words.txt'));
  common = new Set(lines('common.txt'));
  clues: Record<string, string> = existsSync(join(DIR, 'clues.json')) ? JSON.parse(readFileSync(join(DIR, 'clues.json'), 'utf8')) : {};
  candidates = lines('candidates.txt');
  anagramsAll = anagramIndex(this.all);
  anagramsCommon = anagramIndex(this.common);
  isWord = (w: string) => this.all.has(w);
  isCommon = (w: string) => this.common.has(w);
  private goldCache = new Map<string, Set<string>>();
  gold(theme: string): Set<string> {
    let s = this.goldCache.get(theme);
    if (!s) {
      const t = THEMES.find((x) => x.key === theme);
      s = new Set([...this.all].filter((w) => t?.lists.some((l) => listHas(l, w))));
      this.goldCache.set(theme, s);
    }
    return s;
  }
}
let words: Words | null = null;
export const ladderWords = () => (words ??= new Words());

/**
 * Builds a puzzle from a seed: a start word, an end word `lo`–`hi` steps away through everyday words, today's twist,
 * and (daily) a gold theme with at least one themed word on a route no more than 2 steps over par.
 */
export function makePuzzle(seed: number, opts: { kind: Twist['kind']; daily: boolean }): LadderPuzzle {
  const W = ladderWords();
  const R = rng(seed);
  const pick = <T>(a: readonly T[]) => a[Math.floor(R() * a.length)];
  const pool = opts.daily && Object.keys(W.clues).length >= 50 ? Object.keys(W.clues) : W.candidates;
  const [lo, hi] = opts.daily ? [4, 6] : [3, 5];
  let fallback: LadderPuzzle | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const len = opts.kind === 'moves' ? 4 : R() < 0.65 ? 4 : 5;
    const starts = pool.filter((w) => w.length === len);
    const start = pick(starts);
    const twist: Twist = opts.kind === 'locked' ? { kind: 'locked', index: Math.floor(R() * len) } : { kind: opts.kind };
    const anagrams = twist.kind === 'moves' ? W.anagramsCommon : undefined;
    const dS = distances(start, W.isCommon, twist, hi, anagrams);
    const ends = pool.filter((w) => w !== start && (dS.get(w) ?? 99) >= lo && (dS.get(w) ?? 99) <= hi && (twist.kind === 'moves' || w.length === len));
    if (!ends.length) continue;
    // Prefer the middle of the range: long enough to be interesting, short enough to finish.
    const mid = ends.filter((w) => dS.get(w) === lo + 1);
    const end = pick(mid.length ? mid : ends);
    const par = dS.get(end)!;
    const best = shortestRoute(start, end, W.isCommon, twist, par, anagrams)!;
    if (!opts.daily) return { start, end, par, twist, theme: { key: '', label: '' }, best };
    const dE = distances(end, W.isCommon, twist, par + 2, anagrams);
    const themes = [...THEMES].sort(() => R() - 0.5);
    for (const t of themes) {
      const gold = W.gold(t.key);
      const reachable = [...dS.keys()].filter((w) => w !== start && w !== end && gold.has(w) && dS.get(w)! + (dE.get(w) ?? 99) <= par + 2);
      if (reachable.length >= 2) return { start, end, par, twist, theme: { key: t.key, label: t.label }, best };
      if (reachable.length === 1 && !fallback) fallback = { start, end, par, twist, theme: { key: t.key, label: t.label }, best };
    }
  }
  if (fallback) return fallback;
  throw new Error('Could not build a ladder');
}

interface WordState { guesses: string[]; solved: boolean; revealed: boolean }
interface LadderState { start: WordState; end: WordState; path: string[]; hints: number; finished: boolean }
const fresh = (): LadderState => ({ start: { guesses: [], solved: false, revealed: false }, end: { guesses: [], solved: false, revealed: false }, path: [], hints: 0, finished: false });

export class Ladders {
  constructor(private db: Db) {}

  /** Today's puzzle, built once per day and kept, so later word-list changes never alter a day in progress. */
  async puzzle(date: string): Promise<LadderPuzzle> {
    const row = (await this.db.query<{ puzzle: LadderPuzzle }>(`SELECT puzzle FROM ladder_days WHERE date = $1`, [date]))[0];
    if (row) return row.puzzle;
    const n = daysBetween(config.launchDate, date);
    const p = makePuzzle(hash32(`ladder:${date}`), { kind: TWISTS[((n % 3) + 3) % 3], daily: true });
    await this.db.query(`INSERT INTO ladder_days (date, puzzle) VALUES ($1, $2::jsonb) ON CONFLICT (date) DO NOTHING`, [date, JSON.stringify(p)]);
    return (await this.db.query<{ puzzle: LadderPuzzle }>(`SELECT puzzle FROM ladder_days WHERE date = $1`, [date]))[0].puzzle;
  }

  private async load(playerId: string, date: string): Promise<LadderState> {
    const row = (await this.db.query<{ state: LadderState }>(`SELECT state FROM ladder_plays WHERE player_id = $1 AND date = $2`, [playerId, date]))[0];
    return row?.state ?? fresh();
  }

  private async save(playerId: string, date: string, p: LadderPuzzle, st: LadderState) {
    const score = this.breakdown(p, st);
    const total = score.clues + score.climb + score.gold;
    await this.db.query(
      `INSERT INTO ladder_plays (player_id, date, state, score, steps, finished_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       ON CONFLICT (player_id, date) DO UPDATE SET state = EXCLUDED.state, score = EXCLUDED.score, steps = EXCLUDED.steps,
         finished_at = COALESCE(ladder_plays.finished_at, EXCLUDED.finished_at)`,
      [playerId, date, JSON.stringify(st), total, st.finished ? st.path.length - 1 : null, st.finished ? new Date() : null]);
  }

  private goldOn(p: LadderPuzzle, path: string[]) {
    const gold = ladderWords().gold(p.theme.key);
    return new Set(path.slice(1, -1).filter((w) => w !== p.start && w !== p.end && gold.has(w)));
  }

  private breakdown(p: LadderPuzzle, st: LadderState) {
    const clues = wordCluePoints(st.start.solved, st.start.guesses.length - (st.start.solved ? 1 : 0))
      + wordCluePoints(st.end.solved, st.end.guesses.length - (st.end.solved ? 1 : 0));
    if (!st.finished) return { clues, climb: 0, gold: 0 };
    return { clues, climb: climbPoints(st.path.length - 1, p.par, st.hints), gold: Math.min(GOLD_MAX, this.goldOn(p, st.path).size) * GOLD_POINTS };
  }

  private wordView(word: string, s: WordState): LadderWordClue {
    const known = s.solved || s.revealed;
    const wrong = s.guesses.length - (s.solved ? 1 : 0);
    return {
      clue: ladderWords().clues[word] ?? `A ${word.length}-letter word`, length: word.length,
      mask: revealMask(word, known ? word.length : Math.min(word.length - 1, 1 + wrong)), guesses: s.guesses,
      solved: s.solved, revealed: s.revealed, ...(known ? { word } : {}),
    };
  }

  private async view(date: string, p: LadderPuzzle, st: LadderState): Promise<LadderDay> {
    const stats = (await this.db.query<{ players: string; finished: string; avg: string | null }>(
      `SELECT count(*) AS players, count(finished_at) AS finished, avg(steps) AS avg FROM ladder_plays WHERE date = $1`, [date]))[0];
    const players = Number(stats.players);
    const ready = (st.start.solved || st.start.revealed) && (st.end.solved || st.end.revealed);
    const gold = ladderWords().gold(p.theme.key);
    const b = this.breakdown(p, st);
    return {
      date, number: daysBetween(config.launchDate, date) + 1, twist: p.twist, theme: p.theme, par: p.par,
      start: this.wordView(p.start, st.start), end: this.wordView(p.end, st.end), ready,
      rungs: ready ? (st.path.length ? st.path : [p.start]).map((w, i, a) => ({ word: w, gold: i > 0 && i < a.length - 1 && gold.has(w) })) : [],
      hints: st.hints, finished: st.finished, steps: st.finished ? st.path.length - 1 : null,
      score: b.clues + b.climb + b.gold, breakdown: b, players,
      ...(st.finished ? {
        best: p.best, finishedPct: players ? Math.round((Number(stats.finished) / players) * 100) : 0,
        avgSteps: stats.avg ? Math.round(Number(stats.avg) * 10) / 10 : undefined,
      } : {}),
    };
  }

  async day(playerId: string, now = new Date()): Promise<LadderDay> {
    const date = lagosDate(now);
    const p = await this.puzzle(date);
    return this.view(date, p, await this.load(playerId, date));
  }

  /** Guess the start or end word from its clue. Each wrong guess shows another letter. */
  async guess(playerId: string, which: 'start' | 'end', raw: string, now = new Date()): Promise<LadderGuessResponse> {
    const date = lagosDate(now);
    const p = await this.puzzle(date);
    const st = await this.load(playerId, date);
    const s = st[which];
    if (s.solved || s.revealed) throw new HttpError(409, 'Already solved');
    const text = String(raw ?? '').trim().slice(0, 20);
    if (!text) throw new HttpError(400, 'Type a guess');
    const result = checkAnswer(text, p[which], []);
    s.guesses.push(text);
    if (result === 'correct') s.solved = true;
    await this.save(playerId, date, p, st);
    return { result, day: await this.view(date, p, st) };
  }

  async reveal(playerId: string, which: 'start' | 'end', now = new Date()): Promise<LadderDay> {
    const date = lagosDate(now);
    const p = await this.puzzle(date);
    const st = await this.load(playerId, date);
    if (!st[which].solved) st[which].revealed = true;
    await this.save(playerId, date, p, st);
    return this.view(date, p, st);
  }

  /** Saves your route (start first). Reaching the end word finishes the ladder. */
  async path(playerId: string, raw: unknown, now = new Date()): Promise<LadderDay> {
    const date = lagosDate(now);
    const p = await this.puzzle(date);
    const st = await this.load(playerId, date);
    const ready = (st.start.solved || st.start.revealed) && (st.end.solved || st.end.revealed);
    if (!ready) throw new HttpError(409, 'Solve or reveal both words first');
    if (st.finished) throw new HttpError(409, "You've already finished today's ladder");
    const path = checkPath(p, raw);
    st.path = path;
    if (path[path.length - 1] === p.end) st.finished = true;
    await this.save(playerId, date, p, st);
    return this.view(date, p, st);
  }

  /** Adds the next word on a shortest route from where you are (costs points). */
  async hint(playerId: string, now = new Date()): Promise<LadderDay> {
    const date = lagosDate(now);
    const p = await this.puzzle(date);
    const st = await this.load(playerId, date);
    if (st.finished) throw new HttpError(409, "You've already finished today's ladder");
    if (!((st.start.solved || st.start.revealed) && (st.end.solved || st.end.revealed))) throw new HttpError(409, 'Solve or reveal both words first');
    const W = ladderWords();
    const path = st.path.length ? st.path : [p.start];
    const here = path[path.length - 1];
    const route = shortestRoute(here, p.end, W.isCommon, p.twist, 8, p.twist.kind === 'moves' ? W.anagramsCommon : undefined)
      ?? shortestRoute(here, p.end, W.isWord, p.twist, 8, p.twist.kind === 'moves' ? W.anagramsAll : undefined);
    if (!route || route.length < 2) throw new HttpError(400, 'No hint from here. Try going back a step.');
    st.path = [...path, route[1]];
    st.hints++;
    if (route[1] === p.end) st.finished = true;
    await this.save(playerId, date, p, st);
    return this.view(date, p, st);
  }
}

/** Validates a route for a puzzle: starts at the start word, every step allowed and a real word. Throws a friendly error. */
export function checkPath(p: { start: string; end: string; twist: Twist }, raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) throw new HttpError(400, 'Bad route');
  const path = raw.map((w) => String(w).toLowerCase().trim());
  if (path[0] !== p.start) throw new HttpError(400, 'Your route must begin with the start word');
  const W = ladderWords();
  for (let i = 1; i < path.length; i++) {
    const err = stepError(path[i - 1], path[i], p.twist, W.isWord);
    if (err) throw new HttpError(400, `${path[i].toUpperCase()}: ${err}`);
    if (path.indexOf(path[i]) < i && path[i] !== p.end) throw new HttpError(400, `${path[i].toUpperCase()} is already on your ladder`);
  }
  const endAt = path.indexOf(p.end);
  if (endAt > 0 && endAt < path.length - 1) throw new HttpError(400, 'Your route already reached the end word');
  return path;
}
