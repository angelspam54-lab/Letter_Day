// Builds The Ladder's word data in server/src/data/ladder/:
//   words.txt   every word a player may use on a rung (3-7 letters; SCOWL size <= 60, plus Naija words)
//   common.txt  everyday words the puzzle maker builds routes, pars and hints from (SCOWL size <= 20)
//   candidates.txt  everyday 4-5 letter words with many neighbours: the pool start/end words (and their
//                   hand-written clues in clues.json) are chosen from
// Run: cd tools && npm i && node build-ladder.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const WL = (n) => require(`wordlist-english/${n}.json`);
const OUT = new URL('../server/src/data/ladder/', import.meta.url).pathname;
const EXTRA = new URL('../server/src/data/words/extra/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Not in the game, ever (kept short and obvious; the lists are otherwise everyday English).
const BLOCK = new Set(('anal anus arse arses bitch bitchy bonk boob boobs bum bums butt cock cocks coon crap cum cunt dago dick dicks dildo dyke fag fags fanny fart fatso fuck fucks gay gook homo horny jap jizz kike knob lesbo milf nazi nigga nigger nob paki pecker penis perv piss poof poop porn porno prick pube pubes queer rape raped raper rapes randy retard scrot semen sex sexy shag shit shits slag slut sluts smut spaz sperm spic tit tits titty turd twat vagina wank wanks whore wog').split(' '));
const ok = (w) => /^[a-z]{3,7}$/.test(w) && !BLOCK.has(w);
const collect = (sizes) => {
  const s = new Set();
  for (const k of sizes) for (const v of ['english', 'american', 'british']) for (const w of WL(`${v}-words-${k}`)) if (ok(w)) s.add(w);
  return s;
};
const common = collect([10, 20]);
const words = collect([10, 20, 35, 40, 50, 55, 60]);
// Naija words from Letter Day's hand-added lists (single words only).
for (const f of ['food.txt', 'drink.txt', 'clothing.txt', 'vehicle.txt', 'thing.txt', 'instrument.txt']) {
  if (!existsSync(join(EXTRA, f))) continue;
  for (const line of readFileSync(join(EXTRA, f), 'utf8').split('\n')) { const w = line.trim().toLowerCase(); if (ok(w)) words.add(w); }
}
for (const w of ['naira', 'kobo', 'ankara', 'jollof', 'fufu', 'garri', 'egusi', 'suya', 'zobo', 'danfo', 'okada', 'keke', 'gele', 'wahala', 'abeg', 'oga', 'chop', 'jara']) if (ok(w)) words.add(w);

// ---- Start/end candidates: everyday 4-5 letter words with many one-letter neighbours (clues are hand-written in clues.json) ----
const easy = collect([10, 20]);
const neighbours = (w) => { let n = 0; for (let i = 0; i < w.length; i++) for (const c of 'abcdefghijklmnopqrstuvwxyz') if (c !== w[i] && common.has(w.slice(0, i) + c + w.slice(i + 1))) n++; return n; };
const cands = [...easy].filter((w) => (w.length === 4 || w.length === 5) && !/(s|ed)$/.test(w) || /ss$/.test(w))
  .filter((w) => w.length === 4 || w.length === 5).map((w) => [w, neighbours(w)]).filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);
writeFileSync(join(OUT, 'candidates.txt'), cands.map(([w, n]) => `${w} ${n}`).join('\n') + '\n');
writeFileSync(join(OUT, 'words.txt'), [...words].sort().join('\n') + '\n');
writeFileSync(join(OUT, 'common.txt'), [...common].filter((w) => words.has(w)).sort().join('\n') + '\n');
console.log({ words: words.size, common: common.size, candidates: cands.length });
