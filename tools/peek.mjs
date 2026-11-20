import { readFileSync } from 'node:fs';
const D = new URL('./node_modules/wordnet-db/dict/', import.meta.url);
const gl = new Map();
for (const l of readFileSync(new URL('data.noun', D), 'utf8').split('\n')) { if (!l || l.startsWith(' ')) continue; const [h, g] = l.split(' | '); gl.set(h.split(' ')[0], g); }
const idx = new Map();
for (const l of readFileSync(new URL('index.noun', D), 'utf8').split('\n')) { if (!l || l.startsWith(' ')) continue; const t = l.trim().split(' '); idx.set(t[0], t.slice(t.length - parseInt(t[2]))); }
for (const w of process.argv.slice(2)) (idx.get(w) || []).forEach((o, i) => console.log(w, i + 1, (gl.get(o) || '').slice(0, 80)));
