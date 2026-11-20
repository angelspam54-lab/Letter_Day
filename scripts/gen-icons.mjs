// Generates PWA icons: the ink letter tile with an "L", rendered in Bricolage Grotesque. Run: npm run icons
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { Resvg } = require('@resvg/resvg-js');
const font = new URL('../server/assets/fonts/BricolageGrotesque_800ExtraBold.ttf', import.meta.url).pathname;
const tile = (rx, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${rx}" fill="#15171c"/><text x="50" y="${50 + 26 * scale}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${74 * scale}" fill="#f2f3f6">L</text>${[['#e9573f', 0], ['#3f9152', 1], ['#2f7fc8', 2], ['#7a5bd0', 3], ['#e38a1d', 4]].map(([c, i]) => `<circle cx="${30 + i * 10}" cy="${88 - (1 - scale) * 30}" r="${2.6 * scale}" fill="${c}"/>`).join('')}</svg>`;
const out = new URL('../client/public/icons/', import.meta.url);
const png = (svg, w, name) => writeFileSync(new URL(name, out), new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { fontFiles: [font], loadSystemFonts: false } }).render().asPng());
png(tile(22), 192, 'icon-192.png');
png(tile(22), 512, 'icon-512.png');
png(tile(0, 0.72), 512, 'maskable-512.png');
png(tile(0), 180, 'apple-touch-icon.png');
console.log('icons written');
