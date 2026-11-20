import type { SharePreview } from '../../../shared/types.js';
import { LABEL, TIER_LABEL } from '../../../shared/game.js';
import { CATEGORY_COLOR } from '../../../shared/palette.js';
import { config } from '../config.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BASE_CSS = `*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:#f2f3f6;color:#15171c;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:420px;display:flex;flex-direction:column;gap:18px;align-items:stretch}
.tile{width:132px;height:132px;border-radius:28px;background:#15171c;color:#fff;font:800 104px/132px system-ui,sans-serif;text-align:center;align-self:center;letter-spacing:-.04em}
h1{margin:0;font:800 26px/1.15 system-ui,sans-serif;letter-spacing:-.02em;text-align:center}
p{margin:0;color:#4b5060;text-align:center}
.rows{display:flex;flex-direction:column;gap:8px;background:#fff;border-radius:18px;padding:14px}
.row{display:flex;align-items:center;gap:10px;font-weight:700}.dot{width:12px;height:12px;border-radius:50%}
.pill{margin-left:auto;font-size:13px;padding:4px 10px;border-radius:999px;color:#fff}
.pill.off{background:none;color:#8a8f9c;box-shadow:inset 0 0 0 1.5px #dadde4}
a.cta{display:block;text-align:center;background:#15171c;color:#fff;text-decoration:none;font-weight:800;font-size:18px;padding:16px;border-radius:16px}`;

function head(title: string, desc: string, img: string, url: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(config.appName)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#f2f3f6"><link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<style>${BASE_CSS}</style></head>`;
}

/** /r/:id — someone's result (spoiler-free: how rare their answers were, not what they were). */
export function sharePageHtml(p: SharePreview): string {
  const title = `${p.nickname} scored ${p.score} on Letter Day #${p.number} (${p.letter})`;
  const desc = p.isToday ? `Same letter, sixty seconds. Can you beat ${p.score}?` : `Play today's letter.`;
  const rows = p.categories.map((c, i) => {
    const t = p.tiers[i];
    const strong = ['only', 'rare', 'uncommon', 'common'].includes(t);
    return `<div class="row"><span class="dot" style="background:${CATEGORY_COLOR[c]}"></span>${esc(LABEL[c])}<span class="pill ${strong ? '' : 'off'}" style="${strong ? `background:${CATEGORY_COLOR[c]}` : ''}">${t === 'only' ? '★ ' : ''}${TIER_LABEL[t]}</span></div>`;
  }).join('');
  return `${head(title, desc, `${config.publicUrl}/og/${p.shareId}.png`, `${config.publicUrl}/r/${p.shareId}`)}<body><main>
<div class="tile">${esc(p.letter)}</div><h1>${esc(p.nickname)} scored ${p.score} on Letter Day #${p.number}</h1>
<div class="rows">${rows}</div>
<a class="cta" href="/?from=${encodeURIComponent(p.shareId)}">${p.isToday ? `Play letter ${esc(p.letter)} →` : "Play today's letter →"}</a>
<p>One letter. Name, Animal, Place, Thing, Food and a bonus. Sixty seconds.</p></main></body></html>`;
}

/** /g/:code and /p/:code — invites to a friend group or a live party room. */
export function invitePageHtml(o: { kind: 'group' | 'party'; name: string; href: string }): string {
  const title = o.kind === 'group' ? `Join "${o.name}" on Letter Day` : `Join my Letter Day party (room ${o.name})`;
  const desc = o.kind === 'group' ? 'Play the daily letter and compare answers with the group.' : 'A live game of Name, Animal, Place, Thing. First to finish calls STOP!';
  return `${head(title, desc, `${config.publicUrl}/og/default.png`, `${config.publicUrl}${o.href}`)}<body><main>
<div class="tile">${o.kind === 'group' ? '✦' : '!'}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p>
<a class="cta" href="${esc(o.href)}">${o.kind === 'group' ? 'Join the group →' : 'Join the room →'}</a></main></body></html>`;
}
