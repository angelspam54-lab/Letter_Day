// Builds a single self-contained HTML preview of The Clue (no server): `CLUES=path/to/clues.json npx vite build -c vite.preview.config.ts`
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  resolve: { alias: { '@clues': resolve(process.env.CLUES ?? '../server/src/data/clues.json') } },
  build: {
    outDir: 'dist-preview', emptyOutDir: true, target: 'es2019', cssCodeSplit: false,
    assetsInlineLimit: 1e9, modulePreload: { polyfill: false },
    rollupOptions: { input: 'preview.html', output: { inlineDynamicImports: true } },
  },
});
