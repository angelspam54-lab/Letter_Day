import type { Db, Queryable } from '../db/index.js';
import { config } from '../config.js';
import {
  CORE, DAILY_SECONDS, TIER_POINTS, addDays, bonusCandidates, daysBetween, lagosDate, letterFor, levelFromXp, nextLagosMidnight,
  speedBonus, tierFor, blendedShare, xpFor, type Category, type Status, type Tier,
} from '../../../shared/game.js';
import type {
  AnswerResult, BoardEntry, DailyResult, DayInfo, GroupDetail, GroupSummary, Player, Popular, SharePreview, Stats,
} from '../../../shared/types.js';
import { hashToken, newToken, shareId as makeShareId, uuid } from './ids.js';
import { COMBO, countFor, judge } from './words.js';
import { expectedShare } from './expected.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface PlayerRow { id: string; nickname: string | null; xp: number; current_streak: number; best_streak: number; last_played_date: string | null; games_played: number }
interface PlayRow {
  id: string; player_id: string; date: string; started_at: Date; deadline: Date; draft: Record<string, string>;
  submitted_at: Date | null; seconds_left: number; xp_earned: number; streak_after: number; share_id: string | null;
}
interface AnswerRow { play_id: string; player_id: string; date: string; category: Category; raw: string; norm: string; display: string; status: Status; reason: string | null }

/** Late answers (network delay after the timer) are accepted for this long. */
const SUBMIT_GRACE_MS = 10_000;
/** A "pending" answer counts as valid once this many different players gave it on the same day. */
const CROWD_ACCEPT = 3;
const MIN_BONUS_ANSWERS = 8;

export const dayNumber = (date: string) => daysBetween(config.launchDate, date) + 1;
export const shareUrl = (id: string) => `${config.publicUrl}/r/${id}`;

export function toPlayer(r: PlayerRow): Player {
  const lv = levelFromXp(r.xp);
  const alive = r.last_played_date && daysBetween(r.last_played_date, lagosDate()) <= 1;
  return {
    id: r.id, nickname: r.nickname, xp: r.xp, level: lv.level, levelTitle: lv.title, levelInto: lv.into, levelNeeded: lv.needed,
    currentStreak: alive ? r.current_streak : 0, bestStreak: r.best_streak, gamesPlayed: r.games_played, lastPlayedDate: r.last_played_date,
  };
}

export function anonName(id: string): string {
  const A = ['Swift', 'Clever', 'Brave', 'Quiet', 'Lucky', 'Bold', 'Sunny', 'Witty', 'Calm', 'Keen'];
  const B = ['Otter', 'Falcon', 'Heron', 'Fox', 'Panda', 'Lynx', 'Robin', 'Gecko', 'Koala', 'Bison'];
  let h = 0;
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  h >>>= 0;
  return `${A[h % 10]} ${B[(h >>> 4) % 10]}`;
}

// ---------- scoring for a whole day (cached) ----------
interface Scored { playerId: string; answers: AnswerResult[]; secondsLeft: number; speed: number; score: number; shareId: string | null }
interface DayScores { byPlayer: Map<string, Scored>; ranked: Scored[]; popular: Popular[]; counts: Map<string, number>; totals: Map<string, number> }

export class Game {
  private cache = new Map<string, { at: number; v: DayScores }>();
  constructor(private db: Db) {}

  // ---------- players ----------
  async session(token: string | undefined): Promise<{ token: string; player: PlayerRow }> {
    if (token) {
      const rows = await this.db.query<PlayerRow>(`UPDATE players SET last_seen_at = now() WHERE token_hash = $1 RETURNING *`, [hashToken(token)]);
      if (rows[0]) return { token, player: rows[0] };
    }
    const t = newToken();
    const rows = await this.db.query<PlayerRow>(`INSERT INTO players (id, token_hash) VALUES ($1, $2) RETURNING *`, [uuid(), hashToken(t)]);
    return { token: t, player: rows[0] };
  }

  async playerByToken(token: string | undefined): Promise<PlayerRow> {
    if (!token) throw new HttpError(401, 'Missing token');
    const rows = await this.db.query<PlayerRow>(`SELECT * FROM players WHERE token_hash = $1`, [hashToken(token)]);
    if (!rows[0]) throw new HttpError(401, 'Unknown player');
    return rows[0];
  }

  async setNickname(playerId: string, raw: string): Promise<PlayerRow> {
    const nickname = raw.normalize('NFKC').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (nickname.length < 2) throw new HttpError(400, 'Your name needs at least 2 characters');
    return (await this.db.query<PlayerRow>(`UPDATE players SET nickname = $2 WHERE id = $1 RETURNING *`, [playerId, nickname]))[0];
  }

  // ---------- the day's letter ----------
  async day(date: string): Promise<{ letter: string; bonus: Category; categories: Category[] }> {
    let row = (await this.db.query<{ letter: string; bonus: Category }>(`SELECT letter, bonus FROM days WHERE date = $1`, [date]))[0];
    if (!row) {
      const n = daysBetween(config.launchDate, date);
      const letter = letterFor(n);
      const bonus = bonusCandidates(n).find((b) => countFor(b, letter) >= MIN_BONUS_ANSWERS) ?? 'country';
      await this.db.query(`INSERT INTO days (date, letter, bonus) VALUES ($1, $2, $3) ON CONFLICT (date) DO NOTHING`, [date, letter, bonus]);
      row = (await this.db.query<{ letter: string; bonus: Category }>(`SELECT letter, bonus FROM days WHERE date = $1`, [date]))[0];
    }
    return { letter: row.letter, bonus: row.bonus, categories: [...CORE, row.bonus] };
  }

  async today(player: PlayerRow, now = new Date()): Promise<DayInfo> {
    const date = lagosDate(now);
    const d = await this.day(date);
    let play = await this.playRow(player.id, date);
    // The timer ran out while the app was closed: finish with what was typed before the deadline.
    if (play && !play.submitted_at && now.getTime() > new Date(play.deadline).getTime() + SUBMIT_GRACE_MS) {
      await this.submit(player, {}, now);
      play = await this.playRow(player.id, date);
    }
    return {
      date, number: dayNumber(date), letter: d.letter, bonus: d.bonus, categories: d.categories,
      serverNow: now.toISOString(), nextResetAt: nextLagosMidnight(now).toISOString(),
      status: !play ? null : play.submitted_at ? 'done' : 'started',
      deadline: play && !play.submitted_at ? new Date(play.deadline).toISOString() : null,
    };
  }

  private async playRow(playerId: string, date: string, q: Queryable = this.db) {
    return (await q.query<PlayRow>(`SELECT * FROM plays WHERE player_id = $1 AND date = $2`, [playerId, date]))[0] ?? null;
  }

  /** Starts today's 60 seconds (idempotent: a second call returns the same deadline). */
  async start(player: PlayerRow, now = new Date()): Promise<DayInfo> {
    const date = lagosDate(now);
    await this.day(date);
    await this.db.query(
      `INSERT INTO plays (id, player_id, date, started_at, deadline) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (player_id, date) DO NOTHING`,
      [uuid(), player.id, date, now, new Date(now.getTime() + DAILY_SECONDS * 1000)]);
    return this.today(player, now);
  }

  /** Saves typing as it happens, so closing the app mid-round doesn't lose answers made in time. */
  async draft(player: PlayerRow, answers: Record<string, string>, now = new Date()): Promise<void> {
    const play = await this.playRow(player.id, lagosDate(now));
    if (!play || play.submitted_at || now.getTime() > new Date(play.deadline).getTime() + 2000) return;
    await this.db.query(`UPDATE plays SET draft = $2::jsonb WHERE id = $1`, [play.id, JSON.stringify(clean(answers))]);
  }

  async submit(player: PlayerRow, answers: Record<string, string>, now = new Date()): Promise<{ result: DailyResult; player: Player }> {
    const date = lagosDate(now);
    // A round started just before midnight still belongs to the day it started.
    const play = (await this.playRow(player.id, date)) ?? (await this.playRow(player.id, addDays(date, -1)));
    if (!play) throw new HttpError(409, "You haven't started today's letter");
    if (play.submitted_at) throw new HttpError(409, "You've already played today's letter");
    const d = await this.day(play.date);
    const deadline = new Date(play.deadline).getTime();
    const late = now.getTime() > deadline + SUBMIT_GRACE_MS;
    // Too late: only what was saved before the deadline counts.
    const given = late ? play.draft : { ...play.draft, ...clean(answers) };
    const secondsLeft = late ? 0 : Math.max(0, Math.floor((deadline - now.getTime()) / 1000));

    const updated = await this.db.tx(async (q) => {
      const locked = (await q.query<PlayRow>(`SELECT * FROM plays WHERE id = $1 FOR UPDATE`, [play.id]))[0];
      if (locked.submitted_at) throw new HttpError(409, "You've already played today's letter");
      for (const c of d.categories) {
        const j = judge(c, d.letter, given[c] ?? '');
        await q.query(
          `INSERT INTO answers (play_id, player_id, date, category, raw, norm, display, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [play.id, player.id, play.date, c, (given[c] ?? '').slice(0, 40), j.norm, j.display, j.status, j.reason ?? null]);
      }
      const p = (await q.query<PlayerRow>(`SELECT * FROM players WHERE id = $1 FOR UPDATE`, [player.id]))[0];
      const gap = p.last_played_date ? daysBetween(p.last_played_date, play.date) : null;
      const streak = gap === 1 ? p.current_streak + 1 : gap === 0 ? p.current_streak : 1;
      let sid = makeShareId();
      for (let i = 0; i < 5 && (await q.query(`SELECT 1 FROM plays WHERE share_id = $1`, [sid]))[0]; i++) sid = makeShareId(10);
      await q.query(`UPDATE plays SET submitted_at = $2, seconds_left = $3, streak_after = $4, share_id = $5 WHERE id = $1`, [play.id, now, secondsLeft, streak, sid]);
      this.cache.delete(play.date);
      // XP uses the score as it stands now (it can still change as others play).
      const scored = (await this.scores(play.date, q)).byPlayer.get(player.id)!;
      const xp = xpFor(scored.score, streak);
      await q.query(`UPDATE plays SET xp_earned = $2 WHERE id = $1`, [play.id, xp]);
      const lastPlayed = p.last_played_date && p.last_played_date > play.date ? p.last_played_date : play.date;
      return (await q.query<PlayerRow>(
        `UPDATE players SET xp = xp + $2, current_streak = $3, best_streak = GREATEST(best_streak, $3), last_played_date = $4, games_played = games_played + 1
         WHERE id = $1 RETURNING *`, [player.id, xp, streak, lastPlayed]))[0];
    });
    this.cache.delete(play.date);
    return { result: (await this.result(updated, play.date))!, player: toPlayer(updated) };
  }

  /** Everyone's answers for a day, scored by rarity. Today's figures change as more people play. */
  async scores(date: string, q: Queryable = this.db): Promise<DayScores> {
    const hit = this.cache.get(date);
    const fresh = date < lagosDate() ? Infinity : 15_000;
    if (hit && Date.now() - hit.at < fresh) return hit.v;
    const rows = await q.query<AnswerRow & { seconds_left: number; share_id: string | null }>(
      `SELECT a.*, p.seconds_left, p.share_id FROM answers a JOIN plays p ON p.id = a.play_id WHERE a.date = $1 AND p.submitted_at IS NOT NULL`, [date]);
    // Crowd acceptance: unknown answers several people independently gave are treated as valid.
    const pendingCount = new Map<string, number>();
    for (const r of rows) if (r.status === 'pending') pendingCount.set(`${r.category}|${r.norm}`, (pendingCount.get(`${r.category}|${r.norm}`) ?? 0) + 1);
    const eff = (r: AnswerRow): Status => (r.status === 'pending' && (pendingCount.get(`${r.category}|${r.norm}`) ?? 0) >= CROWD_ACCEPT ? 'valid' : r.status);
    const counts = new Map<string, number>();
    const totals = new Map<string, number>();
    const displays = new Map<string, string>();
    for (const r of rows) {
      if (eff(r) !== 'valid') continue;
      const k = `${r.category}|${r.norm}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      totals.set(r.category, (totals.get(r.category) ?? 0) + 1);
      if (!displays.has(k)) displays.set(k, r.display);
    }
    const byPlayer = new Map<string, Scored>();
    for (const r of rows) {
      const s = byPlayer.get(r.player_id) ?? byPlayer.set(r.player_id, { playerId: r.player_id, answers: [], secondsLeft: r.seconds_left, speed: speedBonus(r.seconds_left), score: 0, shareId: r.share_id }).get(r.player_id)!;
      const status = eff(r);
      const same = status === 'valid' ? counts.get(`${r.category}|${r.norm}`) ?? 1 : 0;
      const total = totals.get(r.category) ?? 0;
      const expected = status === 'valid' ? expectedShare(r.category, r.norm) : 0;
      const tier = tierFor(status, same, total, expected, r.reason === COMBO);
      const pct = status === 'valid' ? Math.round(blendedShare(same, total, expected) * 100) : 0;
      s.answers.push({ category: r.category, raw: r.raw, display: r.display || r.raw, status, tier, points: TIER_POINTS[tier], same, pct, reason: r.reason ?? undefined });
    }
    for (const s of byPlayer.values()) s.score = s.answers.reduce((n, a) => n + a.points, 0) + (s.answers.some((a) => a.points > 0) ? s.speed : 0);
    const ranked = [...byPlayer.values()].sort((a, b) => b.score - a.score);
    const popular: Popular[] = [];
    const cats = [...new Set(rows.map((r) => r.category))];
    for (const c of cats) {
      const total = totals.get(c) ?? 0;
      const top = [...counts.entries()].filter(([k]) => k.startsWith(c + '|')).sort((a, b) => b[1] - a[1]).slice(0, 3);
      popular.push({ category: c, answers: top.map(([k, n]) => ({ display: displays.get(k)!, pct: total ? Math.round((n / total) * 100) : 0 })) });
    }
    const v = { byPlayer, ranked, popular, counts, totals };
    this.cache.set(date, { at: Date.now(), v });
    if (this.cache.size > 120) this.cache.delete(this.cache.keys().next().value!);
    return v;
  }

  async result(player: PlayerRow, date = lagosDate()): Promise<DailyResult | null> {
    const play = await this.playRow(player.id, date);
    if (!play?.submitted_at) return null;
    const d = await this.day(date);
    const s = await this.scores(date);
    const me = s.byPlayer.get(player.id);
    if (!me) return null;
    const order = new Map(d.categories.map((c, i) => [c, i]));
    me.answers.sort((a, b) => (order.get(a.category) ?? 9) - (order.get(b.category) ?? 9));
    const above = s.ranked.filter((x) => x.score > me.score).length;
    const below = s.ranked.filter((x) => x.score < me.score).length;
    const n = s.ranked.length;
    return {
      date, number: dayNumber(date), letter: d.letter, answers: me.answers, speedBonus: me.answers.some((a) => a.points > 0) ? me.speed : 0,
      secondsLeft: me.secondsLeft, score: me.score, rank: above + 1, players: n, percentile: n > 1 ? Math.round((below / (n - 1)) * 100) : null,
      streak: play.streak_after, xpEarned: play.xp_earned, shareId: play.share_id!,
      popular: d.categories.map((c) => s.popular.find((p) => p.category === c) ?? { category: c, answers: [] }),
    };
  }

  async board(playerId: string | null, date = lagosDate(), limit = 50): Promise<{ date: string; entries: BoardEntry[]; me: BoardEntry | null; players: number }> {
    const s = await this.scores(date);
    const ids = s.ranked.slice(0, limit).map((x) => x.playerId);
    if (playerId && !ids.includes(playerId) && s.byPlayer.has(playerId)) ids.push(playerId);
    const names = new Map((await this.db.query<{ id: string; nickname: string | null }>(`SELECT id, nickname FROM players WHERE id = ANY($1::uuid[])`, [ids])).map((r) => [r.id, r.nickname]));
    const rankOf = (score: number) => s.ranked.filter((x) => x.score > score).length + 1;
    const entry = (x: Scored): BoardEntry => ({ rank: rankOf(x.score), nickname: names.get(x.playerId) ?? anonName(x.playerId), score: x.score, me: x.playerId === playerId });
    const entries = s.ranked.slice(0, limit).map(entry);
    const mine = playerId ? s.byPlayer.get(playerId) : undefined;
    return { date, entries, me: mine ? entry(mine) : null, players: s.ranked.length };
  }

  // ---------- friend groups ----------
  async createGroup(player: PlayerRow, rawName: string): Promise<GroupSummary> {
    const name = rawName.normalize('NFKC').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (name.length < 2) throw new HttpError(400, 'Give your group a name');
    const count = (await this.db.query<{ n: string }>(`SELECT count(*) AS n FROM group_members WHERE player_id = $1`, [player.id]))[0];
    if (Number(count.n) >= 20) throw new HttpError(400, 'You can be in up to 20 groups');
    const id = uuid();
    let code = makeShareId(6);
    for (let i = 0; i < 5 && (await this.db.query(`SELECT 1 FROM groups WHERE code = $1`, [code]))[0]; i++) code = makeShareId(7);
    await this.db.tx(async (q) => {
      await q.query(`INSERT INTO groups (id, code, name, created_by) VALUES ($1,$2,$3,$4)`, [id, code, name, player.id]);
      await q.query(`INSERT INTO group_members (group_id, player_id) VALUES ($1,$2)`, [id, player.id]);
    });
    return (await this.groups(player)).find((g) => g.code === code)!;
  }

  private async groupByCode(code: string) {
    const g = (await this.db.query<{ id: string; code: string; name: string }>(`SELECT id, code, name FROM groups WHERE code = $1`, [code]))[0];
    if (!g) throw new HttpError(404, 'That group link is no longer valid');
    return g;
  }

  async joinGroup(player: PlayerRow, code: string): Promise<GroupSummary> {
    const g = await this.groupByCode(code);
    const n = Number((await this.db.query<{ n: string }>(`SELECT count(*) AS n FROM group_members WHERE group_id = $1`, [g.id]))[0].n);
    if (n >= 50) throw new HttpError(400, 'This group is full (50 players)');
    await this.db.query(`INSERT INTO group_members (group_id, player_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [g.id, player.id]);
    return (await this.groups(player)).find((x) => x.code === code)!;
  }

  async leaveGroup(player: PlayerRow, code: string): Promise<void> {
    const g = await this.groupByCode(code);
    await this.db.query(`DELETE FROM group_members WHERE group_id = $1 AND player_id = $2`, [g.id, player.id]);
  }

  async groups(player: PlayerRow): Promise<GroupSummary[]> {
    const date = lagosDate();
    const rows = await this.db.query<{ code: string; name: string; id: string; members: string; played: string }>(
      `SELECT g.id, g.code, g.name,
         (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS members,
         (SELECT count(*) FROM group_members m JOIN plays p ON p.player_id = m.player_id AND p.date = $2 AND p.submitted_at IS NOT NULL WHERE m.group_id = g.id) AS played
       FROM groups g JOIN group_members me ON me.group_id = g.id AND me.player_id = $1 ORDER BY me.joined_at`, [player.id, date]);
    const out: GroupSummary[] = [];
    for (const r of rows) {
      let myRank: number | null = null;
      if (Number(r.played) > 0) {
        const detail = await this.groupDetail(player, r.code);
        const me = detail.members.find((m) => m.me);
        if (me?.score != null) myRank = detail.members.filter((m) => (m.score ?? -1) > me.score!).length + 1;
      }
      out.push({ code: r.code, name: r.name, members: Number(r.members), playedToday: Number(r.played), myRank });
    }
    return out;
  }

  /** A group's day: everyone's answers side by side (once you've played), with votes on unknown answers. */
  async groupDetail(player: PlayerRow, code: string, date = lagosDate()): Promise<GroupDetail> {
    const g = await this.groupByCode(code);
    const members = await this.db.query<{ player_id: string; nickname: string | null }>(
      `SELECT m.player_id, p.nickname FROM group_members m JOIN players p ON p.id = m.player_id WHERE m.group_id = $1 ORDER BY m.joined_at`, [g.id]);
    if (!members.some((m) => m.player_id === player.id)) throw new HttpError(403, 'Join this group to see it');
    const d = await this.day(date);
    const s = await this.scores(date);
    const votes = await this.db.query<{ category: string; norm: string; voter_id: string; value: number }>(
      `SELECT category, norm, voter_id, value FROM group_votes WHERE group_id = $1 AND date = $2`, [g.id, date]);
    const answerNorms = new Map((await this.db.query<{ player_id: string; category: string; norm: string }>(
      `SELECT player_id, category, norm FROM answers WHERE date = $1 AND player_id = ANY($2::uuid[])`, [date, members.map((m) => m.player_id)])).map((r) => [`${r.player_id}|${r.category}`, r.norm]));
    const iPlayed = s.byPlayer.has(player.id);
    const memberDays = members.map((m) => {
      const sc = s.byPlayer.get(m.player_id);
      if (!sc) return { playerId: m.player_id, nickname: m.nickname ?? anonName(m.player_id), me: m.player_id === player.id, played: false, answers: null, score: null };
      let score = sc.score;
      const answers = sc.answers.map((a) => {
        const norm = answerNorms.get(`${m.player_id}|${a.category}`) ?? '';
        const vs = votes.filter((v) => v.category === a.category && v.norm === norm);
        const up = vs.filter((v) => v.value > 0).length;
        const down = vs.filter((v) => v.value < 0).length;
        const groupAccepted = a.status === 'pending' && up >= 1 && up > down;
        // A group-accepted answer scores like a common answer within the group.
        if (groupAccepted) score += TIER_POINTS.common;
        const mine = vs.find((v) => v.voter_id === player.id)?.value ?? 0;
        return { ...a, votesUp: up, votesDown: down, myVote: (mine > 0 ? 1 : mine < 0 ? -1 : 0) as -1 | 0 | 1, groupAccepted };
      });
      return { playerId: m.player_id, nickname: m.nickname ?? anonName(m.player_id), me: m.player_id === player.id, played: true, answers: iPlayed ? answers : null, score: iPlayed ? score : null };
    });
    memberDays.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    // All-time: sum of each member's daily scores since joining (cheap version: global daily scores).
    const totals = await this.db.query<{ player_id: string; days: string }>(
      `SELECT p.player_id, count(*) AS days FROM plays p WHERE p.submitted_at IS NOT NULL AND p.player_id = ANY($1::uuid[]) GROUP BY p.player_id`, [members.map((m) => m.player_id)]);
    const allTime: GroupDetail['allTime'] = [];
    const recent = await this.db.query<{ date: string }>(`SELECT DISTINCT date FROM plays WHERE submitted_at IS NOT NULL AND player_id = ANY($1::uuid[]) AND date >= $2 ORDER BY date DESC`, [members.map((m) => m.player_id), addDays(date, -60)]);
    const sums = new Map<string, number>();
    for (const { date: dd } of recent) {
      const ds = await this.scores(dd);
      for (const m of members) { const x = ds.byPlayer.get(m.player_id); if (x) sums.set(m.player_id, (sums.get(m.player_id) ?? 0) + x.score); }
    }
    for (const m of members) {
      const t = totals.find((x) => x.player_id === m.player_id);
      allTime.push({ nickname: m.nickname ?? anonName(m.player_id), total: sums.get(m.player_id) ?? 0, days: Number(t?.days ?? 0), me: m.player_id === player.id });
    }
    allTime.sort((a, b) => b.total - a.total);
    return { code: g.code, name: g.name, date, letter: d.letter, categories: d.categories, iPlayed, members: memberDays, allTime };
  }

  async vote(player: PlayerRow, code: string, input: { playerId: string; category: Category; value: -1 | 0 | 1 }): Promise<GroupDetail> {
    const date = lagosDate();
    const g = await this.groupByCode(code);
    const member = await this.db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND player_id = $2`, [g.id, player.id]);
    if (!member[0]) throw new HttpError(403, 'Join this group to vote');
    if (!(await this.playRow(player.id, date))?.submitted_at) throw new HttpError(409, 'Play today first, then vote');
    if (input.playerId === player.id) throw new HttpError(400, "You can't vote on your own answer");
    const target = (await this.db.query<{ norm: string; status: string }>(`SELECT norm, status FROM answers WHERE player_id = $1 AND date = $2 AND category = $3`, [input.playerId, date, input.category]))[0];
    if (!target || target.status !== 'pending') throw new HttpError(400, 'Only answers that are not in our lists can be voted on');
    const mine = await this.db.query(`SELECT 1 FROM answers WHERE player_id = $1 AND date = $2 AND category = $3 AND norm = $4`, [player.id, date, input.category, target.norm]);
    if (mine[0]) throw new HttpError(400, 'You gave the same answer, so someone else should judge it');
    if (input.value === 0) {
      await this.db.query(`DELETE FROM group_votes WHERE group_id = $1 AND date = $2 AND category = $3 AND norm = $4 AND voter_id = $5`, [g.id, date, input.category, target.norm, player.id]);
    } else {
      await this.db.query(
        `INSERT INTO group_votes (group_id, date, category, norm, voter_id, value) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (group_id, date, category, norm, voter_id) DO UPDATE SET value = EXCLUDED.value`,
        [g.id, date, input.category, target.norm, player.id, input.value]);
    }
    return this.groupDetail(player, code, date);
  }

  // ---------- stats & sharing ----------
  async stats(player: PlayerRow): Promise<Stats> {
    const plays = await this.db.query<{ date: string; share_id: string }>(
      `SELECT date, share_id FROM plays WHERE player_id = $1 AND submitted_at IS NOT NULL ORDER BY date DESC LIMIT 60`, [player.id]);
    const tiers: Record<Tier, number> = { only: 0, rare: 0, uncommon: 0, common: 0, pending: 0, miss: 0 };
    const history: Stats['history'] = [];
    const rare: Stats['rarest'] = [];
    for (const p of plays) {
      const s = await this.scores(p.date);
      const me = s.byPlayer.get(player.id);
      const d = await this.day(p.date);
      if (!me) continue;
      history.push({ date: p.date, number: dayNumber(p.date), letter: d.letter, score: me.score, shareId: p.share_id });
      for (const a of me.answers) {
        tiers[a.tier]++;
        if (a.status === 'valid') rare.push({ display: a.display, category: a.category, letter: d.letter, pct: a.pct, date: p.date });
      }
    }
    rare.sort((a, b) => a.pct - b.pct);
    return { player: toPlayer(player), history, tiers, rarest: rare.slice(0, 6) };
  }

  async sharePreview(id: string): Promise<SharePreview | null> {
    if (!/^[a-z0-9]{6,12}$/.test(id)) return null;
    const play = (await this.db.query<PlayRow & { nickname: string | null }>(
      `SELECT p.*, pl.nickname FROM plays p JOIN players pl ON pl.id = p.player_id WHERE p.share_id = $1`, [id]))[0];
    if (!play) return null;
    const d = await this.day(play.date);
    const me = (await this.scores(play.date)).byPlayer.get(play.player_id);
    if (!me) return null;
    const order = new Map(d.categories.map((c, i) => [c, i]));
    const answers = [...me.answers].sort((a, b) => (order.get(a.category) ?? 9) - (order.get(b.category) ?? 9));
    return {
      shareId: id, nickname: play.nickname ?? anonName(play.player_id), date: play.date, number: dayNumber(play.date), letter: d.letter,
      score: me.score, tiers: answers.map((a) => a.tier), categories: answers.map((a) => a.category), isToday: play.date === lagosDate(),
    };
  }
}

function clean(answers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) if (typeof v === 'string' && k.length < 20) out[k] = v.slice(0, 40);
  return out;
}
