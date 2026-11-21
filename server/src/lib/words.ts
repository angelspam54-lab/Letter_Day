// Answer checking: normalise what was typed, check the starting letter, then look it up in the category's
// lists (with plural and one-typo tolerance). Unknown-but-plausible answers are "pending", never rejected.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Category, Status } from '../../../shared/game.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.WORDS_DIR
  ?? ['../data/words', '../../../../src/data/words'].map((p) => join(here, p)).find((p) => existsSync(p))!;

/** Which lists each category accepts (a "thing" can be any object; a place can be a country, etc.). */
const SOURCES: Record<Category, string[]> = {
  name: ['name'], animal: ['animal', 'bird'], place: ['place', 'country'],
  thing: ['thing', 'tool', 'furniture', 'clothing', 'vehicle', 'instrument'], food: ['food', 'drink'],
  colour: ['colour'], job: ['job'], sport: ['sport'], instrument: ['instrument'], bodypart: ['bodypart'],
  clothing: ['clothing'], vehicle: ['vehicle'], drink: ['drink'], plant: ['plant'], bird: ['bird'],
  tool: ['tool'], furniture: ['furniture'], country: ['country'],
};

export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '');
}
const squash = (s: string) => s.replace(/ /g, '');

/** True when a and b differ by at most one typo: a missing, extra or wrong letter, or two letters swapped ("Veitnam"). */
function levenshtein1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; continue; }
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Index { exact: Map<string, string>; byLetter: Map<string, string[]> }
const lists = new Map<string, Index>();

function loadList(name: string): Index {
  let idx = lists.get(name);
  if (idx) return idx;
  idx = { exact: new Map(), byLetter: new Map() };
  // words/<name>.txt is generated (tools/build-words.mjs); words/extra/<name>.txt holds hand-added words (Naija food, states, names...).
  // Also extra/<name>-*.txt (e.g. name-nicknames.txt). Lines starting with # are notes.
  const extraDir = join(DIR, 'extra');
  const extras = existsSync(extraDir) ? readdirSync(extraDir).filter((f) => f === `${name}.txt` || (f.startsWith(`${name}-`) && f.endsWith('.txt'))) : [];
  const text = [readFileSync(join(DIR, `${name}.txt`), 'utf8'), ...extras.map((f) => readFileSync(join(extraDir, f), 'utf8'))].join('\n');
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue;
    const display = line.trim();
    if (!display) continue;
    const key = squash(normalize(display));
    if (!key) continue;
    if (!idx.exact.has(key)) {
      idx.exact.set(key, display);
      const l = key[0];
      (idx.byLetter.get(l) ?? idx.byLetter.set(l, []).get(l)!).push(key);
    }
  }
  lists.set(name, idx);
  return idx;
}

/** True if a list (e.g. 'animal') has this word exactly (lowercase, no spaces). */
export const listHas = (name: string, key: string) => loadList(name).exact.has(key);

/** How many accepted answers a category has for a letter (used to pick fair bonus categories). */
export function countFor(category: Category, letter: string): number {
  const l = letter.toLowerCase();
  return SOURCES[category].reduce((n, src) => n + (loadList(src).byLetter.get(l)?.length ?? 0), 0);
}

/** Every word we know, in any category: the first part of a combo answer ("Goat" in "Goat meat") can come from anywhere. */
let everyList: string[] | null = null;
const knownWord = (key: string) => (everyList ??= readdirSync(DIR).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)))
  .some((src) => loadList(src).exact.has(key));
const plurals = (key: string) => [key, key.replace(/ies$/, 'y'), key.replace(/es$/, ''), key.replace(/s$/, '')];

/** Reason stored on combo answers: a known word plus a word from the category ("Goat meat", "Van tyre"). They count, but score at most "uncommon". */
export const COMBO = 'combo';

export interface Judgement { status: Status; norm: string; display: string; reason?: string }

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function judge(category: Category, letter: string, raw: string): Judgement {
  const text = (raw ?? '').trim().slice(0, 40);
  const n = normalize(text);
  if (!n) return { status: 'blank', norm: '', display: '' };
  const key = squash(n);
  if (key[0] !== letter.toLowerCase()) {
    return { status: 'invalid', norm: key, display: text, reason: `Doesn't start with ${letter.toUpperCase()}` };
  }
  if (key.length < 2) return { status: 'invalid', norm: key, display: text, reason: 'Too short' };
  const candidates = plurals(key);
  for (const src of SOURCES[category]) {
    const idx = loadList(src);
    for (const c of candidates) {
      const hit = idx.exact.get(c);
      if (hit) return { status: 'valid', norm: squash(normalize(hit)), display: /^[a-z]/.test(hit) ? title(hit) : hit };
    }
  }
  // One typo allowed on longer words ("Kangaroo" for "Kangeroo").
  if (key.length >= 5) {
    for (const src of SOURCES[category]) {
      const idx = loadList(src);
      const near = idx.byLetter.get(key[0])?.find((w) => levenshtein1(w, key));
      if (near) { const hit = idx.exact.get(near)!; return { status: 'valid', norm: near, display: /^[a-z]/.test(hit) ? title(hit) : hit }; }
    }
  }
  const words = n.split(' ');
  if (words.length >= 2) {
    // Full names: a known first name plus any surname ("Victor Osimhen").
    if (category === 'name' && loadList('name').exact.has(words[0])) return { status: 'valid', norm: key, display: title(text) };
    // Combos: something we know + a word from this category ("Goat meat", "Duck egg", "Van tyre", "Victoria Island").
    const head = plurals(words[words.length - 1]).reverse(); // singular first
    const modifier = words.slice(0, -1).join('');
    const hit = head.find((h) => SOURCES[category].some((src) => loadList(src).exact.has(h)));
    if (hit && modifier.length >= 2 && plurals(modifier).some(knownWord)) {
      return { status: 'valid', norm: modifier + hit, display: title(text), reason: COMBO }; // "Duck eggs" and "Duck egg" are one answer
    }
  }
  return { status: 'pending', norm: key, display: title(text), reason: 'Not in our lists yet' };
}
