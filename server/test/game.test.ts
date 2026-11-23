import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createDb, type Db } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { Game } from '../src/lib/game.js';
import { Parties } from '../src/lib/party.js';
import { judge, COMBO } from '../src/lib/words.js';
import { createApp } from '../src/app.js';
import { LETTERS, letterFor, tierFor, bonusCandidates } from '../../shared/game.js';
import type { PartyState } from '../../shared/types.js';

let db: Db;
let game: Game;
beforeEach(async () => {
  const url = process.env.TEST_DATABASE_URL ?? '';
  db = await createDb({ url, pgliteDir: 'memory://' });
  if (url) await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  game = new Game(db);
});
afterEach(async () => { vi.useRealTimers(); await db.close(); });

const T0 = new Date('2026-11-20T09:00:00Z'); // day #1
const at = (s: number, base = T0) => new Date(base.getTime() + s * 1000);

/** Answers that are valid for any letter in our lists, keyed by letter. */
async function answersFor(letter: string, pick = 0) {
  const { readFileSync } = await import('node:fs');
  const out: Record<string, string> = {};
  for (const [cat, file] of [['name', 'name'], ['animal', 'animal'], ['place', 'country'], ['thing', 'thing'], ['food', 'food']] as const) {
    const words = readFileSync(new URL(`../src/data/words/${file}.txt`, import.meta.url), 'utf8').split('\n').filter((w) => w.toUpperCase().startsWith(letter) && /^[A-Za-z]+$/.test(w));
    out[cat] = words[pick % words.length];
  }
  return out;
}

describe('rules', () => {
  it('accepts swapped letters, full names and combo answers', () => {
    expect(judge('country', 'V', 'Veit Nam')).toMatchObject({ status: 'valid', norm: 'vietnam' });
    expect(judge('place', 'V', 'Viet Nam').status).toBe('valid');
    expect(judge('name', 'V', 'Victor Osimhen').status).toBe('valid');
    expect(judge('name', 'V', 'Victor Osimhen').reason).toBeUndefined();
    for (const [cat, letter, text] of [['food', 'D', 'Duck eggs'], ['food', 'C', 'Camel milk'], ['thing', 'V', 'Van tyre'], ['thing', 'V', 'Van tire']] as const) {
      expect(judge(cat, letter, text), text).toMatchObject({ status: 'valid', reason: COMBO });
    }
    expect(judge('food', 'D', 'Duck eggs').norm).toBe(judge('food', 'D', 'Duck egg').norm);
    expect(judge('food', 'G', 'Goat meat').status).toBe('valid');
    expect(judge('food', 'V', 'Very meat').status).toBe('pending'); // "very" isn't a thing we know
  });

  it('blends the expected-answers bank into rarity and caps combos', () => {
    expect(tierFor('valid', 1, 1, 0)).toBe('only');           // nobody expected it
    expect(tierFor('valid', 1, 1, 0.35)).toBe('common');      // e.g. Dog: most people say it
    expect(tierFor('valid', 1, 1, 0.08)).toBe('uncommon');
    expect(tierFor('valid', 1, 1, 0, true)).toBe('uncommon'); // combos top out at uncommon
    expect(tierFor('valid', 400, 1000, 0.35)).toBe('common');  // with many real players, real shares rule
    expect(tierFor('valid', 1, 1000, 0.35)).toBe('only');
  });

  it('cycles through every letter before repeating, never twice in a row', () => {
    const first = Array.from({ length: LETTERS.length }, (_, i) => letterFor(i));
    expect(new Set(first).size).toBe(LETTERS.length);
    for (let i = 1; i < 200; i++) expect(letterFor(i)).not.toBe(letterFor(i - 1));
  });
  it('rotates bonus categories', () => {
    expect(new Set(Array.from({ length: 13 }, (_, i) => bonusCandidates(i)[0])).size).toBe(13);
  });
  it('tiers answers by how many players gave them', () => {
    expect(tierFor('valid', 1, 50)).toBe('only');
    expect(tierFor('valid', 4, 50)).toBe('rare');
    expect(tierFor('valid', 12, 50)).toBe('uncommon');
    expect(tierFor('valid', 30, 50)).toBe('common');
    expect(tierFor('pending', 1, 50)).toBe('pending');
    expect(tierFor('invalid', 0, 50)).toBe('miss');
  });
  it('judges answers: letter, lists, plurals, typos, unknowns', () => {
    expect(judge('animal', 'K', 'Kangeroo')).toMatchObject({ status: 'valid', display: 'Kangaroo' });
    expect(judge('food', 'J', 'jollof rice').status).toBe('valid');
    expect(judge('place', 'G', 'The Gambia').status).toBe('valid');
    expect(judge('thing', 'K', 'zebra')).toMatchObject({ status: 'invalid' });
    expect(judge('food', 'K', 'kwanta')).toMatchObject({ status: 'pending' });
    expect(judge('name', 'K', '  ').status).toBe('blank');
  });
});

describe('daily', () => {
  it('runs the 60-second round on the server clock, scores rarity, and builds streaks', async () => {
    // Streaks are judged against "today", so pin the clock to the test's days.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const a = await game.session(undefined);
    const b = await game.session(undefined);
    const day = await game.today(a.player, T0);
    expect(day.letter).toBe(letterFor(0));
    expect(day.categories).toHaveLength(6);
    expect(day.status).toBeNull();
    const started = await game.start(a.player, T0);
    expect(started.status).toBe('started');
    expect(Date.parse(started.deadline!) - T0.getTime()).toBe(60_000);
    // Starting again doesn't reset the clock.
    expect((await game.start(a.player, at(20))).deadline).toBe(started.deadline);

    const ans = await answersFor(day.letter, 0);
    const r1 = await game.submit(a.player, ans, at(20));
    expect(r1.result.secondsLeft).toBe(40);
    expect(r1.result.answers.filter((x) => x.status === 'valid').length).toBeGreaterThanOrEqual(5);
    expect(r1.result.answers[0].tier).toBe('only');
    await expect(game.submit(a.player, ans, at(25))).rejects.toThrow(/already played/);

    // Player B gives the same answers: both drop from "only". With only two real players the expected-answers
    // bank still counts for a lot, so a shared but unusual answer is "rare" rather than "common".
    await game.start(b.player, at(30));
    await game.submit(b.player, ans, at(50));
    const again = (await game.result((await game.playerByToken(a.token)), day.date))!;
    expect(again.answers[0].same).toBe(2);
    expect(again.answers[0].tier).not.toBe('only');
    expect(again.players).toBe(2);

    // Next day: streak 2.
    const d2 = new Date(T0.getTime() + 86400_000);
    vi.setSystemTime(d2);
    await game.start(a.player, d2);
    const next = await game.submit(a.player, await answersFor((await game.today(a.player, d2)).letter, 1), at(10, d2));
    expect(next.player.currentStreak).toBe(2);
    vi.useRealTimers();
  });

  it('enforces the timer: late answers fall back to what was saved before the deadline', async () => {
    const a = await game.session(undefined);
    const day = await game.today(a.player, T0);
    await game.start(a.player, T0);
    const ans = await answersFor(day.letter, 2);
    await game.draft(a.player, { name: ans.name }, at(30));
    await game.draft(a.player, { name: ans.name, animal: ans.animal }, at(90)); // after deadline: ignored
    const r = await game.submit(a.player, ans, at(120)); // way too late
    expect(r.result.secondsLeft).toBe(0);
    const statuses = r.result.answers.map((x) => x.status);
    expect(statuses[0]).toBe('valid');
    expect(statuses.slice(1).every((s) => s === 'blank')).toBe(true);
  });

  it('auto-finishes a round whose timer ran out while the app was closed', async () => {
    const a = await game.session(undefined);
    const day = await game.today(a.player, T0);
    await game.start(a.player, T0);
    await game.draft(a.player, { name: (await answersFor(day.letter)).name }, at(5));
    const later = await game.today(a.player, at(300));
    expect(later.status).toBe('done');
    expect((await game.result(a.player, day.date))!.answers[0].status).toBe('valid');
  });

  it('accepts unknown answers once three players independently give them', async () => {
    const day = await game.today((await game.session(undefined)).player, T0);
    const odd = `${day.letter}zzqx`;
    const results = [];
    for (let i = 0; i < 3; i++) {
      const p = (await game.session(undefined)).player;
      await game.start(p, at(i));
      results.push((await game.submit(p, { food: odd }, at(i + 5))).result);
    }
    expect(results[0].answers.find((a) => a.category === 'food')!.status).toBe('pending');
    const last = results[2].answers.find((a) => a.category === 'food')!;
    expect(last.status).toBe('valid');
  });
});

describe('groups', () => {
  it('hides answers until you play, then lets members vote on unknown answers', async () => {
    const a = await game.session(undefined);
    const b = await game.session(undefined);
    await game.setNickname(a.player.id, 'Ada');
    const g = await game.createGroup(a.player, 'Family');
    await game.joinGroup(b.player, g.code);
    const day = await game.today(a.player, new Date());
    const ans = await answersFor(day.letter, 3);
    const now = new Date();
    await game.start(a.player, now);
    await game.submit(a.player, { ...ans, food: `${day.letter}qqzv` }, new Date(now.getTime() + 5000));
    // B hasn't played: no peeking.
    let detail = await game.groupDetail(b.player, g.code);
    expect(detail.iPlayed).toBe(false);
    expect(detail.members.every((m) => m.answers === null)).toBe(true);
    await expect(game.vote(b.player, g.code, { playerId: a.player.id, category: 'food', value: 1 })).rejects.toThrow(/Play today first/);
    await game.start(b.player, now);
    await game.submit(b.player, ans, new Date(now.getTime() + 8000));
    detail = await game.groupDetail(b.player, g.code);
    const ada = detail.members.find((m) => m.nickname === 'Ada')!;
    const before = ada.score!;
    expect(ada.answers!.find((x) => x.category === 'food')!.status).toBe('pending');
    detail = await game.vote(b.player, g.code, { playerId: a.player.id, category: 'food', value: 1 });
    const after = detail.members.find((m) => m.nickname === 'Ada')!;
    expect(after.answers!.find((x) => x.category === 'food')!.groupAccepted).toBe(true);
    expect(after.score).toBe(before + 10);
    await expect(game.vote(a.player, g.code, { playerId: a.player.id, category: 'food', value: 1 })).rejects.toThrow(/own answer/);
    expect((await game.groups(a.player))[0]).toMatchObject({ name: 'Family', members: 2, playedToday: 2 });
  });
});

class FakeSocket extends EventEmitter {
  states: PartyState[] = [];
  errors: string[] = [];
  send(raw: string) { const m = JSON.parse(raw); if (m.t === 'state') this.states.push(m.state); if (m.t === 'error') this.errors.push(m.message); }
  say(msg: object) { this.emit('message', Buffer.from(JSON.stringify(msg))); }
  get last() { return this.states[this.states.length - 1]; }
}

describe('party rooms', () => {
  it('plays rounds: reveal, STOP, review with votes, classic scoring, final', async () => {
    vi.useFakeTimers();
    const parties = new Parties(async () => ({ letter: 'K', bonus: 'colour' }));
    const code = parties.create();
    const host = new FakeSocket(), guest = new FakeSocket();
    parties.connect(host as any, 'p-host');
    parties.connect(guest as any, 'p-guest');
    host.say({ t: 'join', code, token: 'x', name: 'Ada' });
    guest.say({ t: 'join', code: code.toLowerCase(), token: 'y', name: 'Bayo' });
    expect(host.last.players.map((p) => p.name)).toEqual(['Ada', 'Bayo']);
    expect(host.last.players[0].host).toBe(true);
    guest.say({ t: 'start' }); // only the host can start
    expect(host.last.phase).toBe('lobby');
    host.say({ t: 'settings', rounds: 3, seconds: 60 });
    host.say({ t: 'start' });
    await vi.advanceTimersByTimeAsync(10);
    expect(host.last.phase).toBe('reveal');
    expect(host.last.letter).toBe('K'); // round 1 uses today's letter
    await vi.advanceTimersByTimeAsync(3000);
    expect(host.last.phase).toBe('playing');

    guest.say({ t: 'draft', answers: { name: 'Kemi', animal: 'Kangaroo', place: 'Kano' } });
    expect(host.last.players.find((p) => p.name === 'Bayo')!.filled).toBe(3);
    expect(host.last.review).toBeNull(); // nobody sees answers mid-round
    host.say({ t: 'stop', answers: { name: 'Kemi' } });
    expect(host.errors.at(-1)).toMatch(/Fill every box/);
    host.say({ t: 'stop', answers: { name: 'Kunle', animal: 'Kangaroo', place: 'Kenya', thing: 'Kite', food: 'Kwankwazo', colour: 'Khaki' } });
    expect(host.last.phase).toBe('stopping');
    expect(host.last.stoppedBy).toBe('p-host');
    await vi.advanceTimersByTimeAsync(3000);
    expect(guest.last.phase).toBe('review');
    const food = guest.last.review!.food!;
    expect(food.find((j) => j.playerId === 'p-host')!.status).toBe('pending');
    guest.say({ t: 'vote', category: 'food', playerId: 'p-host', value: 1 });
    host.say({ t: 'vote', category: 'food', playerId: 'p-host', value: 1 }); // can't vote on own answer
    expect(guest.last.review!.food!.find((j) => j.playerId === 'p-host')!.votesUp).toBe(1);
    host.say({ t: 'score' });
    const s = host.last;
    expect(s.phase).toBe('scores');
    // Host: Kunle 10, Kangaroo shared 5, Kenya 10, Kite 10, voted food 10, Khaki 10 = 55. Guest: Kemi 10, Kangaroo 5, Kano 10 = 25.
    expect(s.roundPoints).toEqual({ 'p-host': 55, 'p-guest': 25 });
    host.say({ t: 'next' });
    await vi.advanceTimersByTimeAsync(10);
    expect(host.last.round).toBe(2);
    expect(host.last.letter).not.toBe('K');
    // Timer runs out with no STOP.
    await vi.advanceTimersByTimeAsync(3000 + 60_000 + 3000);
    expect(host.last.phase).toBe('review');
    host.say({ t: 'score' }); host.say({ t: 'next' });
    await vi.advanceTimersByTimeAsync(3000 + 60_000 + 3000);
    host.say({ t: 'score' }); host.say({ t: 'next' });
    expect(host.last.phase).toBe('final');
    expect(host.last.players.find((p) => p.name === 'Ada')!.total).toBe(55);
    // Reconnect keeps the seat and score; host passes on if the host leaves.
    host.emit('close');
    expect(guest.last.players.find((p) => p.name === 'Bayo')!.host).toBe(true);
    const again = new FakeSocket();
    parties.connect(again as any, 'p-host');
    again.say({ t: 'join', code, token: 'x', name: 'Ada' });
    expect(again.last.players.find((p) => p.me)!.total).toBe(55);
  });
});

describe('http', () => {
  it('serves the daily flow, groups, share page and images', async () => {
    const { app } = createApp(db, { clientDist: '/nonexistent' });
    const boot = await (await app.request('/api/bootstrap', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).json();
    expect(boot.today.letter).toMatch(/^[A-Z]$/);
    const auth = { authorization: `Bearer ${boot.token}`, 'content-type': 'application/json' };
    await app.request('/api/daily/start', { method: 'POST', headers: auth });
    const ans = await answersFor(boot.today.letter, 4);
    const sub = await (await app.request('/api/daily/submit', { method: 'POST', headers: auth, body: JSON.stringify({ answers: ans }) })).json();
    expect(sub.result.score).toBeGreaterThan(0);
    const g = await (await app.request('/api/groups', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Office' }) })).json();
    expect(g.group.code).toMatch(/^[a-z0-9]{6,7}$/);
    expect((await app.request(`/g/${g.group.code}`)).status).toBe(200);
    const id = sub.result.shareId;
    expect(await (await app.request(`/r/${id}`)).text()).toContain(`/og/${id}.png`);
    for (const q of ['', '?format=story']) {
      const img = await app.request(`/og/${id}.png${q}`);
      expect(img.headers.get('content-type')).toBe('image/png');
    }
    expect((await app.request('/og/default.png')).status).toBe(200);
    const party = await (await app.request('/api/party', { method: 'POST', headers: auth })).json();
    expect(party.code).toMatch(/^[A-Z0-9]{5}$/);
    expect((await app.request(`/p/${party.code}`)).status).toBe(200);
  });
});

describe('the clue', () => {
  it('runs six riddles and a theme: hidden answers, hints, tries, scoring', async () => {
    const { Clues } = await import('../src/lib/clue.js');
    const { checkTheme, revealMask } = await import('../../shared/clue.js');
    const L = letterFor(0);
    const clue = (category: string, answer: string, difficulty: 1 | 2 | 3) => ({ category, label: category, difficulty, clue: `clue for ${category}`, answer, accept: [], fact: `fact ${answer}` });
    const set = {
      id: `${L}1`, letter: L, theme: 'Outer Space', themeAccept: ['space', 'outer space', 'astronomy'], themeHint: 'Look up',
      clues: [clue('name', `${L}lpha`, 1), clue('animal', `${L}ardvark`, 1), clue('place', `${L}msterdam`, 2), clue('thing', `${L}nchor`, 2), clue('food', `${L}pple pie`, 3), clue('wildcard', `${L}mber`, 3)],
    };
    const clues = new Clues(db, [set as any]);
    const p = (await game.session(undefined)).player;
    let d = await clues.day(p.id, T0);
    expect(d.letter).toBe(L);
    expect(d.clues[0].mask).toBe(revealMask(`${L}lpha`, 1));
    expect(JSON.stringify(d)).not.toContain('lpha');
    expect(d.theme.unlocked).toBe(false);
    // Clue 0: one wrong, then a typo that still counts.
    const miss = await clues.guess(p.id, 0, 'nope', T0);
    expect(miss.result).toBe('wrong');
    expect(miss.day.clues[0].mask.replace(/_/g, '').length).toBe(2); // a wrong guess shows another letter
    const r = await clues.guess(p.id, 0, `${L}lpah`, T0);
    expect(r.result).toBe('correct');
    expect(r.day.clues[0]).toMatchObject({ solved: true, points: 80, answer: `${L}lpha` });
    // Clue 1: 8 letters start with 2 showing; a hint shows a 3rd; solve first try = 100 - 10.
    expect(d.clues[1].mask.replace(/_/g, '').length).toBe(2);
    d = await clues.hint(p.id, 1, T0);
    expect(d.clues[1].mask.replace(/_/g, '').length).toBe(3);
    expect((await clues.guess(p.id, 1, `${L}ardvark`, T0)).day.clues[1].points).toBe(90);
    // Clue 2: close guess, then out of tries.
    expect((await clues.guess(p.id, 2, `${L}msterdan`, T0)).result).toBe('correct');
    for (let i = 0; i < 4; i++) await clues.guess(p.id, 3, 'zzzzz', T0);
    d = await clues.day(p.id, T0);
    expect(d.clues[3]).toMatchObject({ done: true, solved: false, points: 0, answer: `${L}nchor` });
    await expect(clues.guess(p.id, 3, 'x', T0)).rejects.toThrow(/already done/);
    await expect(clues.theme(p.id, 'space', T0)).rejects.toThrow(/Finish all six/);
    await clues.guess(p.id, 4, `${L}pple pie`, T0);
    await clues.guess(p.id, 5, `${L}mber`, T0);
    // Theme: natural phrasing counts.
    const wrong = await clues.theme(p.id, 'planets?', T0);
    expect(wrong.result).toBe('wrong');
    expect(wrong.day.theme.nudge).toBeNull(); // the free nudge comes after two wrong guesses
    const t = await clues.theme(p.id, "it's all about outer space", T0);
    expect(t.result).toBe('correct');
    expect(t.day.theme).toMatchObject({ solved: true, points: 110, answer: 'Outer Space' });
    expect(t.day.finished).toBe(true);
    expect(t.day.score).toBe(80 + 90 + 100 + 0 + 100 + 100 + 110);
    expect(checkTheme('Astronomy!', set.themeAccept)).toBe(true);
    // Giving up shows the answer for 0 points and unlocks the theme.
    const q = (await game.session(undefined)).player;
    for (let i = 0; i < 6; i++) d = await clues.giveUp(q.id, i, T0);
    expect(d.clues[2]).toMatchObject({ done: true, solved: false, points: 0, answer: `${L}msterdam` });
    expect(d.theme.unlocked).toBe(true);
    expect(checkTheme('spaceships', set.themeAccept)).toBe(false);
  });
});

describe('the ladder', () => {
  it('knows the moves for each twist', async () => {
    const { moveFor, stepError, shortestRoute, climbPoints, parWord } = await import('../../shared/ladder.js');
    const dict = new Set(['slap', 'flap', 'flag', 'pals', 'lap', 'clap', 'cold', 'cord', 'card', 'ward', 'warm', 'word', 'worm', 'wold']);
    const isWord = (w: string) => dict.has(w);
    expect(moveFor('slap', 'flap', { kind: 'classic' })).toBe('change');
    expect(moveFor('slap', 'pals', { kind: 'classic' })).toBeNull();
    expect(moveFor('slap', 'pals', { kind: 'moves' })).toBe('shuffle');
    expect(moveFor('lap', 'clap', { kind: 'moves' })).toBe('add');
    expect(moveFor('clap', 'lap', { kind: 'moves' })).toBe('drop');
    expect(moveFor('slap', 'flap', { kind: 'locked', index: 0 })).toBeNull();
    expect(stepError('slap', 'flap', { kind: 'locked', index: 0 }, isWord)).toMatch(/Letter 1 is locked/);
    expect(stepError('slap', 'slop', { kind: 'classic' }, isWord)).toMatch(/not a word/);
    expect(stepError('flap', 'flog', { kind: 'classic' }, isWord)).toMatch(/exactly one letter/);
    const route = shortestRoute('cold', 'warm', isWord, { kind: 'classic' })!;
    expect(route).toHaveLength(5);
    expect([route[0], route[4]]).toEqual(['cold', 'warm']);
    expect(climbPoints(4, 4, 0)).toBe(100);
    expect(climbPoints(3, 4, 0)).toBe(115);
    expect(climbPoints(6, 4, 1)).toBe(55);
    expect(parWord(3, 4)).toBe('Birdie!');
  });

  it('builds a daily ladder; clues, rules, hints, gold and scoring', async () => {
    const { Ladders, ladderWords } = await import('../src/lib/ladder.js');
    const { wordCluePoints, climbPoints } = await import('../../shared/ladder.js');
    const ladders = new Ladders(db);
    const p = (await game.session(undefined)).player;
    let d = await ladders.day(p.id, T0);
    const again = await ladders.day(p.id, T0);
    expect(again.par).toBe(d.par); // the same puzzle all day
    expect(d.ready).toBe(false);
    expect(d.start.word).toBeUndefined();
    expect(d.start.mask).toMatch(/^[A-Z]_+$/);
    const puzzle = await ladders.puzzle(d.date);
    expect(ladderWords().clues[puzzle.start]).toBeTruthy();
    // Path before solving the words is refused.
    await expect(ladders.path(p.id, [puzzle.start], T0)).rejects.toThrow(/Solve or reveal/);
    // One wrong guess, then solve the start; reveal the end.
    const w1 = await ladders.guess(p.id, 'start', 'zzzz', T0);
    expect(w1.result).toBe('wrong');
    expect(w1.day.start.mask.replace(/_/g, '').length).toBe(2);
    expect((await ladders.guess(p.id, 'start', puzzle.start, T0)).result).toBe('correct');
    d = await ladders.reveal(p.id, 'end', T0);
    expect(d.ready).toBe(true);
    expect(d.breakdown.clues).toBe(wordCluePoints(true, 1));
    // Bad steps are refused with a reason.
    await expect(ladders.path(p.id, [puzzle.start, 'zzzz'], T0)).rejects.toThrow(/ZZZZ/);
    await expect(ladders.path(p.id, ['nope'], T0)).rejects.toThrow(/start word/);
    // A hint adds the next step of a shortest route; then climb the rest of a best route.
    d = await ladders.hint(p.id, T0);
    expect(d.rungs).toHaveLength(2);
    expect(d.hints).toBe(1);
    const { shortestRoute } = await import('../../shared/ladder.js');
    const W = ladderWords();
    const rest = shortestRoute(d.rungs[1].word, puzzle.end, W.isCommon, puzzle.twist, 8, W.anagramsCommon)!;
    d = await ladders.path(p.id, [puzzle.start, ...rest], T0);
    expect(d.finished).toBe(true);
    expect(d.steps).toBe(rest.length);
    expect(d.best).toEqual(puzzle.best);
    const gold = d.rungs.filter((r) => r.gold).length;
    expect(d.breakdown).toEqual({ clues: wordCluePoints(true, 1), climb: climbPoints(d.steps!, d.par, 1), gold: Math.min(3, gold) * 10 });
    expect(d.score).toBe(d.breakdown.clues + d.breakdown.climb + d.breakdown.gold);
    await expect(ladders.path(p.id, [puzzle.start], T0)).rejects.toThrow(/already finished/);
  });

  it('makes every twist, with a reachable gold word on daily puzzles', async () => {
    const { makePuzzle, ladderWords } = await import('../src/lib/ladder.js');
    const { distances } = await import('../../shared/ladder.js');
    const W = ladderWords();
    for (const kind of ['classic', 'moves', 'locked'] as const) {
      for (let i = 0; i < 3; i++) {
        const p = makePuzzle(777 + i, { kind, daily: true });
        expect(p.twist.kind).toBe(kind);
        expect(p.best[0]).toBe(p.start);
        expect(p.best[p.best.length - 1]).toBe(p.end);
        expect(p.best.length - 1).toBe(p.par);
        expect(p.par).toBeGreaterThanOrEqual(4);
        const a = kind === 'moves' ? W.anagramsCommon : undefined;
        const dS = distances(p.start, W.isCommon, p.twist, p.par + 2, a), dE = distances(p.end, W.isCommon, p.twist, p.par + 2, a);
        const gold = [...W.gold(p.theme.key)].filter((w) => w !== p.start && w !== p.end && (dS.get(w) ?? 99) + (dE.get(w) ?? 99) <= p.par + 2);
        expect(gold.length, `${p.start}->${p.end} ${p.theme.key}`).toBeGreaterThan(0);
      }
    }
  });

  it('races in a party room: same ladder, places score 10 then 7', async () => {
    vi.useFakeTimers();
    const parties = new Parties(async () => ({ letter: 'K', bonus: 'colour' }));
    const code = parties.create();
    const host = new FakeSocket(), guest = new FakeSocket();
    parties.connect(host as any, 'r-host');
    parties.connect(guest as any, 'r-guest');
    host.say({ t: 'join', code, token: 'x', name: 'Ada' });
    guest.say({ t: 'join', code, token: 'y', name: 'Bayo' });
    host.say({ t: 'settings', game: 'ladder', rounds: 3 });
    expect(host.last.settings).toMatchObject({ game: 'ladder', seconds: 120, rounds: 3 });
    host.say({ t: 'start' });
    await vi.advanceTimersByTimeAsync(10);
    expect(host.last.phase).toBe('reveal');
    const L = host.last.ladder!;
    expect(guest.last.ladder!.start).toBe(L.start);
    await vi.advanceTimersByTimeAsync(3000);
    expect(host.last.phase).toBe('playing');
    // A bad step is refused; the route survives.
    guest.say({ t: 'ladder', path: [L.start, 'qqqq'] });
    expect(guest.errors.at(-1)).toMatch(/QQQQ/);
    const room = parties.peek(code)!;
    const best = room.ladder!.puzzle.best;
    guest.say({ t: 'ladder', path: best.slice(0, 2) });
    expect(host.last.ladder!.progress.find((p) => p.playerId === 'r-guest')!.steps).toBe(1);
    expect(host.last.ladder!.progress.find((p) => p.playerId === 'r-guest')!.path).toBeNull(); // no peeking mid-race
    guest.say({ t: 'ladder', path: best });
    host.say({ t: 'ladder', path: best });
    await vi.advanceTimersByTimeAsync(1500);
    expect(host.last.phase).toBe('scores');
    expect(host.last.roundPoints).toEqual({ 'r-guest': 10, 'r-host': 7 });
    expect(host.last.ladder!.best).toEqual(best);
    host.say({ t: 'next' });
    await vi.advanceTimersByTimeAsync(10);
    expect(host.last.round).toBe(2);
    // Nobody finishes: time runs out, no points.
    await vi.advanceTimersByTimeAsync(3000 + 120_000);
    expect(host.last.phase).toBe('scores');
    expect(host.last.roundPoints).toEqual({ 'r-guest': 0, 'r-host': 0 });
    vi.useRealTimers();
  });
});
