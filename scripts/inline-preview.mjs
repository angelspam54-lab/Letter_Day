// Folds the preview build's JS and CSS into one HTML file.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2], out = process.argv[3];
let html = readFileSync(join(dir, 'preview.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync(join(dir, f), 'utf8')}</style>`);
html = html.replace(/<script type="module" crossorigin src="\/?([^"]+)"><\/script>/g, (_, f) => `<script type="module">${readFileSync(join(dir, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
