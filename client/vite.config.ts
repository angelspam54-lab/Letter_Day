import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const api = 'http://localhost:8787';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: ['es2019', 'safari13', 'chrome70'],
    cssCodeSplit: false,
    assetsInlineLimit: 2048,
    modulePreload: { polyfill: false },
  },
  server: { host: true, proxy: { '/api': api, '/r/': api, '/og/': api, '/g/': api, '/p/': api, '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
