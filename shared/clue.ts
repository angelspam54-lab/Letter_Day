// "The Clue": six riddles that share the day's letter and a hidden theme. Rules + typed-answer matching.

export const CLUE_TRIES = 4;
export const THEME_TRIES = 4;
/** Points for solving on try 1 / 2 / 3 / 4; each letter you pay to reveal costs HINT_COST (never below CLUE_MIN). */
export const CLUE_POINTS = [100, 80, 60, 40];
export const HINT_COST = 10;
export const CLUE_MIN = 10;
export const THEME_POINTS = [150, 110, 70, 40];
export const NUDGE_COST = 15;
/** After this many wrong theme guesses the nudge shows for free. */
export const FREE_NUDGE_AFTER = 2;

/** Letters shown before any guess: the first, plus one more for every 6 letters (long answers get a head start). */
export const freeLetters = (answer: string) => 1 + Math.floor(letterCount(answer) / 6);
/** Letters shown now: the head start, every paid hint, and one free letter per wrong guess; never the whole word. */
export const shownLetters = (answer: string, hints: number, wrong: number) =>
  Math.min(letterCount(answer) - 1, freeLetters(answer) + hints + wrong);
/** A paid hint is possible while at least two letters are still hidden. */
export const canHint = (answer: string, hints: number, wrong: number) => shownLetters(answer, hints, wrong) < letterCount(answer) - 1;

export function cluePoints(tries: number, hints: number): number {
  return Math.max(CLUE_MIN, CLUE_POINTS[Math.min(tries, CLUE_TRIES) - 1] - hints * HINT_COST);
}

export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '');
}
const squash = (s: string) => normalize(s).replace(/ /g, '');

/** Edit distance where swapping two neighbouring letters counts as one typo (common on phone keyboards). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const tolerance = (t: string) => (t.length <= 4 ? 0 : t.length <= 8 ? 1 : 2);

export type ClueCheck = 'correct' | 'close' | 'wrong';

export function checkAnswer(guess: string, answer: string, accept: string[] = []): ClueCheck {
  const g = squash(guess);
  if (!g) return 'wrong';
  let bestGap = Infinity;
  for (const t of [answer, ...accept].map(squash).filter(Boolean)) {
    if (g === t) return 'correct';
    const d = levenshtein(g, t);
    if (d <= tolerance(t)) return 'correct';
    bestGap = Math.min(bestGap, d - tolerance(t));
  }
  return bestGap <= 2 && g.length >= 3 ? 'close' : 'wrong';
}

/** Theme guesses: right if any accepted keyword/phrase appears as whole words (one typo allowed on long words). */
export function checkTheme(guess: string, accept: string[]): boolean {
  const words = normalize(guess).split(' ').filter(Boolean);
  if (!words.length) return false;
  for (const phrase of accept.map(normalize).filter(Boolean)) {
    const p = phrase.split(' ');
    for (let i = 0; i + p.length <= words.length; i++) {
      if (p.every((w, k) => w === words[i + k] || (w.length >= 6 && levenshtein(w, words[i + k]) <= 1))) return true;
    }
  }
  return false;
}

/** Letter blanks with the first `revealed` letters shown (the first letter is always shown: it's the day's letter). */
export function revealMask(answer: string, revealed: number): string {
  let n = 0;
  return answer.replace(/[\p{L}\p{N}]/gu, (ch) => (n++ < Math.max(1, revealed) ? ch.toUpperCase() : '_'));
}
export const letterCount = (answer: string) => (answer.match(/[\p{L}\p{N}]/gu) ?? []).length;
