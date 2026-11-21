// "The Ladder": get from one word to another, one small change at a time; every rung must be a real word.
// Rules, moves, shortest routes and scoring, shared by the server and the phone.

/** Today's twist. classic: change one letter. moves: also add a letter, drop one, or shuffle them.
 *  locked: change one letter, but the letter at `index` never changes. */
export type Twist = { kind: 'classic' } | { kind: 'moves' } | { kind: 'locked'; index: number };
export type Move = 'change' | 'add' | 'drop' | 'shuffle';

export const MIN_LEN = 3;
export const MAX_LEN = 7;

/** Daily scoring: par is the shortest everyday-word route. Like golf, fewer steps is better. */
export const LADDER_BASE = 100;
export const PAR_STEP = 15; // per step under (+) or over (−) par
export const LADDER_MIN = 20;
export const GOLD_POINTS = 10; // per themed word on your route…
export const GOLD_MAX = 3; // …counting up to this many
export const WORD_CLUE_POINTS = 20; // solving the start or end clue (minus 5 per wrong guess)
export const WORD_CLUE_WRONG = 5;
export const LADDER_HINT_COST = 15;

/** Race: points by finishing place (1st, 2nd, …); everyone else who finishes gets the last value. */
export const RACE_POINTS = [10, 7, 5, 4, 3, 2];
export const RACE_SECONDS_OPTIONS = [90, 120, 180] as const;

export const twistLabel = (t: Twist) =>
  t.kind === 'classic' ? 'Classic' : t.kind === 'moves' ? 'Extra moves' : `Locked letter ${t.index + 1}`;
export const twistHelp = (t: Twist) =>
  t.kind === 'classic' ? 'Change one letter at a time.'
    : t.kind === 'moves' ? 'Change a letter, add one, drop one, or shuffle the letters.'
      : `Change one letter at a time, but letter ${t.index + 1} stays put.`;

const sortKey = (w: string) => [...w].sort().join('');

/** Looks up anagrams fast (for the shuffle move). */
export function anagramIndex(words: Iterable<string>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const w of words) { const k = sortKey(w); (m.get(k) ?? m.set(k, []).get(k)!).push(w); }
  return m;
}

/** Which move turns a into b under the twist, or null if none does. */
export function moveFor(a: string, b: string, twist: Twist): Move | null {
  if (a === b) return null;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return twist.kind === 'locked' && diff[0] === twist.index ? null : 'change';
    if (twist.kind === 'moves' && sortKey(a) === sortKey(b)) return 'shuffle';
    return null;
  }
  if (twist.kind !== 'moves') return null;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (long.length !== short.length + 1) return null;
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return a.length < b.length ? 'add' : 'drop';
  return null;
}

/** Why a rung isn't allowed (in plain words), or null if it's fine. */
export function stepError(a: string, b: string, twist: Twist, isWord: (w: string) => boolean): string | null {
  if (!/^[a-z]+$/.test(b)) return 'Letters only';
  if (a === b) return "That's the same word";
  if (b.length < MIN_LEN || b.length > MAX_LEN) return `Words of ${MIN_LEN} to ${MAX_LEN} letters`;
  if (!moveFor(a, b, twist)) {
    if (twist.kind === 'locked' && a.length === b.length && a[twist.index] !== b[twist.index]) return `Letter ${twist.index + 1} is locked today`;
    return twist.kind === 'moves' ? 'Change, add or drop one letter, or shuffle them' : 'Change exactly one letter';
  }
  if (!isWord(b)) return "That's not a word we know";
  return null;
}

/** Every word one move away from w. */
export function neighbours(w: string, isWord: (w: string) => boolean, twist: Twist, anagrams?: Map<string, string[]>): string[] {
  const out = new Set<string>();
  const AZ = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < w.length; i++) {
    if (twist.kind === 'locked' && i === twist.index) continue;
    for (const c of AZ) if (c !== w[i]) { const x = w.slice(0, i) + c + w.slice(i + 1); if (isWord(x)) out.add(x); }
  }
  if (twist.kind === 'moves') {
    if (w.length < MAX_LEN) for (let i = 0; i <= w.length; i++) for (const c of AZ) { const x = w.slice(0, i) + c + w.slice(i); if (isWord(x)) out.add(x); }
    if (w.length > MIN_LEN) for (let i = 0; i < w.length; i++) { const x = w.slice(0, i) + w.slice(i + 1); if (isWord(x)) out.add(x); }
    for (const x of anagrams?.get(sortKey(w)) ?? []) if (x !== w) out.add(x);
  }
  out.delete(w);
  return [...out];
}

/** Steps from `start` to every word within `maxDepth` moves. */
export function distances(start: string, isWord: (w: string) => boolean, twist: Twist, maxDepth: number, anagrams?: Map<string, string[]>): Map<string, number> {
  const dist = new Map([[start, 0]]);
  let frontier = [start];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const w of frontier) for (const x of neighbours(w, isWord, twist, anagrams)) if (!dist.has(x)) { dist.set(x, d); next.push(x); }
    frontier = next;
  }
  return dist;
}

/** One shortest route from a to b (both ends included), or null within maxDepth. */
export function shortestRoute(a: string, b: string, isWord: (w: string) => boolean, twist: Twist, maxDepth = 8, anagrams?: Map<string, string[]>): string[] | null {
  if (a === b) return [a];
  const prev = new Map<string, string>([[a, '']]);
  let frontier = [a];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const w of frontier) {
      for (const x of neighbours(w, isWord, twist, anagrams)) {
        if (prev.has(x)) continue;
        prev.set(x, w);
        if (x === b) { const route = [b]; let c = w; while (c) { route.unshift(c); c = prev.get(c)!; } return route; }
        next.push(x);
      }
    }
    frontier = next;
  }
  return null;
}

/** Points for the climb itself: par = 100, each step under par +15, each step over −15, each hint −15. */
export const climbPoints = (steps: number, par: number, hints: number) =>
  Math.max(LADDER_MIN, LADDER_BASE + PAR_STEP * (par - steps) - LADDER_HINT_COST * hints);

/** Points for solving a start/end clue yourself (0 if you revealed it). */
export const wordCluePoints = (solved: boolean, wrong: number) => (solved ? Math.max(0, WORD_CLUE_POINTS - WORD_CLUE_WRONG * wrong) : 0);

/** Golf words for steps relative to par. */
export function parWord(steps: number, par: number): string {
  const d = steps - par;
  return d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : `${d} over par`;
}

/** Letters of `word` that differ from `prev` at the same position (for highlighting a rung). */
export const changedAt = (prev: string, word: string): number[] => [...word].map((_, i) => i).filter((i) => prev[i] !== word[i]);

/** Small seeded random numbers (the same seed always builds the same puzzle). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
