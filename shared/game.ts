// Letter Day rules, shared by the server (authoritative) and the app (display only). Dependency-free.

export const TIMEZONE = 'Africa/Lagos';
export const DAILY_SECONDS = 60;
export const PARTY_SECONDS_OPTIONS = [60, 90, 120] as const;
export const PARTY_ROUND_OPTIONS = [3, 5, 8] as const;
/** After someone calls STOP, everyone else gets this long for their last keystrokes to arrive. */
export const STOP_GRACE_MS = 2500;

export const CORE = ['name', 'animal', 'place', 'thing', 'food'] as const;
export type CoreCategory = (typeof CORE)[number];
export const BONUS = ['colour', 'job', 'sport', 'instrument', 'bodypart', 'clothing', 'vehicle', 'drink', 'plant', 'bird', 'tool', 'furniture', 'country'] as const;
export type BonusCategory = (typeof BONUS)[number];
export type Category = CoreCategory | BonusCategory;

export const LABEL: Record<Category, string> = {
  name: 'Name', animal: 'Animal', place: 'Place', thing: 'Thing', food: 'Food',
  colour: 'Colour', job: 'Job', sport: 'Sport', instrument: 'Instrument', bodypart: 'Body part', clothing: 'Clothing',
  vehicle: 'Vehicle', drink: 'Drink', plant: 'Plant or flower', bird: 'Bird', tool: 'Tool', furniture: 'Furniture', country: 'Country',
};

/** Letters with enough answers in every category to be fair (no Q, U, X, Y, Z). */
export const LETTERS = 'ABCDEFGHIJKLMNOPRSTVW'.split('');

/** Answer verdicts. "pending" = not in our lists yet; other players or a group vote can accept it. */
export type Status = 'valid' | 'pending' | 'invalid' | 'blank';
/** Daily rarity tiers, from how many of today's players gave the same answer. */
export type Tier = 'only' | 'rare' | 'uncommon' | 'common' | 'pending' | 'miss';

export const TIER_POINTS: Record<Tier, number> = { only: 30, rare: 20, uncommon: 15, common: 10, pending: 0, miss: 0 };
export const TIER_LABEL: Record<Tier, string> = { only: 'Only you', rare: 'Rare', uncommon: 'Uncommon', common: 'Common', pending: 'Pending', miss: 'Miss' };

/** Imaginary players blended into rarity: the expected-answers bank counts as this many people having played... */
export const EXPECTED_PLAYERS = 20;
/** ...fading away as real answers come in, gone once a category has this many. */
export const EXPECTED_FADE = 200;
const bankWeight = (total: number) => EXPECTED_PLAYERS * Math.max(0, 1 - total / EXPECTED_FADE);

/** Share of players (real plus expected) giving an answer. `expected` is the bank's share for it (0 to 1). */
export const blendedShare = (same: number, total: number, expected = 0) =>
  (same + bankWeight(total) * expected) / Math.max(1, total + bankWeight(total));

/** Tier from the share of answers matching yours (you included), counting today's players plus the expected-answers bank.
 *  `combo` answers ("Goat meat") count but score at most "uncommon", so stringing words together isn't a shortcut to top points. */
export function tierFor(status: Status, same: number, total: number, expected = 0, combo = false): Tier {
  if (status === 'pending') return 'pending';
  if (status !== 'valid') return 'miss';
  const share = blendedShare(same, total, expected);
  let tier: Tier = same <= 1 && bankWeight(total) * expected < 1 ? 'only' : share <= 0.1 ? 'rare' : share <= 0.3 ? 'uncommon' : 'common';
  if (combo && (tier === 'only' || tier === 'rare')) tier = 'uncommon';
  return tier;
}

/** Up to 15 bonus points for finishing early. */
export const speedBonus = (secondsLeft: number) => Math.round(Math.max(0, Math.min(DAILY_SECONDS, secondsLeft)) / 4);

/** Party scoring (classic rules): unique valid answer 10, shared valid answer 5, otherwise 0. */
export const PARTY_POINTS = { unique: 10, shared: 5 } as const;

/** XP for a finished daily. */
export function xpFor(score: number, streak: number): number {
  return 20 + Math.round(score / 6) + Math.min(streak, 10) * 5;
}

export function xpForLevel(level: number): number { return (100 * (level - 1) * level) / 2; }
const TITLES = ['Scribbler', 'Speller', 'Wordsmith', 'Quick Pen', 'Lexicon', 'Encyclopedia', 'Polymath', 'Oracle', 'Grand Master', 'Legend'];
export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  return { level, into: xp - floor, needed: xpForLevel(level + 1) - floor, title: TITLES[Math.min(level, TITLES.length) - 1] };
}

/** Small deterministic hash for daily choices (identical on server and client). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

function shuffled<T>(items: readonly T[], seed: string): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = hash32(`${seed}:${i}`) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The day's letter: every letter once per cycle, in a fresh order each cycle, never twice in a row. */
export function letterFor(dayIndex: number): string {
  const n = LETTERS.length;
  const cycle = Math.floor(dayIndex / n);
  const order = (c: number) => shuffled(LETTERS, `letters:${c}`);
  const cur = order(cycle);
  const prev = order(cycle - 1);
  if (cur[0] === prev[n - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return cur[((dayIndex % n) + n) % n];
}

/** Bonus categories for a day in preference order: a fresh rotation each cycle (the server takes the first with enough answers). */
export function bonusCandidates(dayIndex: number): BonusCategory[] {
  const n = BONUS.length;
  const order = shuffled(BONUS, `bonus:${Math.floor(dayIndex / n)}`);
  const i = ((dayIndex % n) + n) % n;
  return [...order.slice(i), ...order.slice(0, i)];
}

// ---------- dates (game day = Africa/Lagos calendar day) ----------
export function lagosDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}
export function nextLagosMidnight(at: Date = new Date()): Date {
  const tomorrow = addDays(lagosDate(at), 1);
  const guess = new Date(tomorrow + 'T00:00:00Z');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
