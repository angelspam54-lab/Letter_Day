// The "expected answers" bank: for each category and letter, the answers most people give and roughly what share
// of players give them. Until there are many real players, rarity blends these in as if EXPECTED_PLAYERS people
// had already played, so obvious answers (Dog for D) don't score as if nobody else would think of them.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Category } from '../../../shared/game.js';
import { judge } from './words.js';

const here = dirname(fileURLToPath(import.meta.url));
let bank: Map<string, number> | null = null;

function load(): Map<string, number> {
  const m = new Map<string, number>();
  const file = process.env.EXPECTED_FILE ?? ['../data/expected.json', '../../../../src/data/expected.json'].map((p) => join(here, p)).find(existsSync);
  if (!file) return m;
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, Record<string, number>>>;
  for (const [cat, letters] of Object.entries(data)) {
    for (const [letter, answers] of Object.entries(letters)) {
      for (const [answer, pct] of Object.entries(answers)) {
        const j = judge(cat as Category, letter.toUpperCase(), answer);
        if (j.status === 'valid') m.set(`${cat}|${j.norm}`, (m.get(`${cat}|${j.norm}`) ?? 0) + pct / 100);
      }
    }
  }
  return m;
}

/** Share of players (0 to 1) expected to give this answer, from the bank; 0 if it isn't one of the obvious ones. */
export const expectedShare = (category: string, norm: string) => (bank ??= load()).get(`${category}|${norm}`) ?? 0;
