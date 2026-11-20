// Writes .br and .gz siblings for text assets so the server can send them without compressing per request.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = process.argv[2] ?? 'dist';
const exts = /\.(js|css|html|svg|json|webmanifest|txt)$/;
let n = 0;
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!exts.test(f) || f === 'sw.js') continue;
    const buf = readFileSync(p);
    if (buf.length < 1024) continue;
    writeFileSync(p + '.br', brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
    writeFileSync(p + '.gz', gzipSync(buf, { level: 9 }));
    n++;
  }
})(root);
console.log(`precompressed ${n} files`);
