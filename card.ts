import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { SharePreview } from '../../../shared/types.js';
import { LABEL, TIER_LABEL, type Tier } from '../../../shared/game.js';
import { CATEGORY_COLOR } from '../../../shared/palette.js';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = process.env.FONT_DIR
  ?? ['../../assets/fonts', '../../../../assets/fonts'].map((p) => join(here, p)).find((p) => existsSync(p))
  ?? join(here, '../../assets/fonts');
const FONTS = ['BricolageGrotesque_800ExtraBold.ttf', 'BricolageGrotesque_700Bold.ttf', 'Figtree_500Medium.ttf', 'Figtree_700Bold.ttf'].map((f) => join(FONT_DIR, f));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const C = { bg: '#f2f3f6', surface: '#ffffff', ink: '#15171c', ink2: '#4b5060', muted: '#8a8f9c', line: '#dadde4' };
const DISPLAY = `font-family="Bricolage Grotesque" font-weight="800"`;
const DISPLAY7 = `font-family="Bricolage Grotesque" font-weight="700"`;
const BODY = `font-family="Figtree" font-weight="500"`;
const BODYB = `font-family="Figtree" font-weight="700"`;

/** The letter tile: the game's mark. */
export function tileSvg(x: number, y: number, size: number, letter: string, fill = C.ink, fg = C.surface): string {
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.2}" fill="${fill}"/>
    <text x="${x + size / 2}" y="${y + size * 0.77}" text-anchor="middle" ${DISPLAY} font-size="${size * 0.78}" fill="${fg}">${esc(letter)}</text>`;
}

/** One category row: colour chip, label, tier pill. Tier strength shows as fill weight, not just text. */
function tierRow(x: number, y: number, w: number, h: number, label: string, color: string, tier: Tier): string {
  const strength: Record<Tier, number> = { only: 1, rare: 0.85, uncommon: 0.6, common: 0.38, pending: 0, miss: 0 };
  const s = strength[tier];
  const pillW = 170;
  const pill = s > 0
    ? `<rect x="${x + w - pillW}" y="${y + 6}" width="${pillW}" height="${h - 12}" rx="${(h - 12) / 2}" fill="${color}" fill-opacity="${s}"/>
       <text x="${x + w - pillW / 2}" y="${y + h / 2 + 9}" text-anchor="middle" ${BODYB} font-size="24" fill="${s > 0.5 ? '#fff' : C.ink}">${tier === 'only' ? '★ ' : ''}${TIER_LABEL[tier]}</text>`
    : `<rect x="${x + w - pillW}" y="${y + 6}" width="${pillW}" height="${h - 12}" rx="${(h - 12) / 2}" fill="none" stroke="${C.line}" stroke-width="3" ${tier === 'pending' ? 'stroke-dasharray="8 6"' : ''}/>
       <text x="${x + w - pillW / 2}" y="${y + h / 2 + 9}" text-anchor="middle" ${BODYB} font-size="24" fill="${C.muted}">${TIER_LABEL[tier]}</text>`;
  return `<circle cx="${x + 14}" cy="${y + h / 2}" r="11" fill="${color}"/>
    <text x="${x + 38}" y="${y + h / 2 + 10}" ${BODYB} font-size="28" fill="${C.ink}">${esc(label)}</text>${pill}`;
}

export function resultSvg(p: SharePreview, format: 'og' | 'story'): string {
  const site = esc(config.publicUrl.replace(/^https?:\/\//, ''));
  const name = esc(p.nickname.slice(0, 20));
  if (format === 'story') {
    const w = 1080, h = 1920;
    const rows = p.categories.map((c, i) => tierRow(140, 1030 + i * 96, 800, 80, LABEL[c], CATEGORY_COLOR[c], p.tiers[i])).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${C.bg}"/>
      <text x="${w / 2}" y="190" text-anchor="middle" ${DISPLAY7} font-size="60" fill="${C.ink}">Letter Day #${p.number}</text>
      ${tileSvg(w / 2 - 230, 260, 460, p.letter)}
      <text x="${w / 2}" y="880" text-anchor="middle" ${DISPLAY} font-size="150" fill="${C.ink}">${p.score}</text>
      <text x="${w / 2}" y="940" text-anchor="middle" ${BODY} font-size="36" fill="${C.muted}">points · ${name}</text>
      ${rows}
      <rect x="0" y="${h - 230}" width="${w}" height="230" fill="${C.ink}"/>
      <text x="${w / 2}" y="${h - 130}" text-anchor="middle" ${DISPLAY7} font-size="58" fill="#fff">Same letter. Can you beat me?</text>
      <text x="${w / 2}" y="${h - 70}" text-anchor="middle" ${BODY} font-size="34" fill="#c9cdd6">${site}</text>
    </svg>`;
  }
  const w = 1200, h = 630;
  const rows = p.categories.map((c, i) => tierRow(560, 150 + i * 66, 580, 58, LABEL[c], CATEGORY_COLOR[c], p.tiers[i])).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${tileSvg(60, 60, 400, p.letter)}
    <text x="60" y="540" ${DISPLAY} font-size="84" fill="${C.ink}">${p.score}<tspan ${BODY} font-size="30" fill="${C.muted}" dx="14">points</tspan></text>
    <text x="60" y="586" ${BODY} font-size="28" fill="${C.ink2}">${name}</text>
    <text x="560" y="104" ${DISPLAY7} font-size="44" fill="${C.ink}">Letter Day #${p.number}</text>
    ${rows}
    <text x="${w - 60}" y="${h - 30}" text-anchor="end" ${BODY} font-size="24" fill="${C.muted}">Same letter for everyone · ${site}</text>
  </svg>`;
}

export function defaultSvg(): string {
  const w = 1200, h = 630;
  const cats = ['name', 'animal', 'place', 'thing', 'food'] as const;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${tileSvg(80, 115, 400, 'K')}
    <text x="560" y="230" ${DISPLAY} font-size="96" fill="${C.ink}">Letter Day</text>
    <text x="562" y="292" ${BODY} font-size="34" fill="${C.ink2}">One letter. Sixty seconds.</text>
    ${cats.map((c, i) => `<rect x="${562 + i * 110}" y="350" width="96" height="40" rx="20" fill="${CATEGORY_COLOR[c]}"/><text x="${610 + i * 110}" y="378" text-anchor="middle" ${BODYB} font-size="19" fill="#fff">${LABEL[c]}</text>`).join('')}
    <text x="562" y="456" ${BODY} font-size="28" fill="${C.ink2}">Rarer answers score more. Play daily,</text>
    <text x="562" y="494" ${BODY} font-size="28" fill="${C.ink2}">or start a party with friends.</text>
  </svg>`;
}

export function renderPng(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Figtree' }, shapeRendering: 2, textRendering: 1 }).render().asPng();
}

export class PngCache {
  private m = new Map<string, Buffer>();
  constructor(private max = 300) {}
  get(k: string) { const v = this.m.get(k); if (v) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k: string, v: Buffer) { this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!); }
}
