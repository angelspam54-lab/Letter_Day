import { Hono, type Context } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db } from './db/index.js';
import { Game, HttpError, toPlayer } from './lib/game.js';
import { Parties } from './lib/party.js';
import { Clues, loadClueSets, type ClueSet } from './lib/clue.js';
import { PngCache, defaultSvg, renderPng, resultSvg } from './lib/card.js';
import { invitePageHtml, sharePageHtml } from './lib/sharePage.js';
import { RateLimiter } from './lib/rateLimit.js';
import { config } from './config.js';
import { lagosDate } from '../../shared/game.js';
import type { BootstrapResponse } from '../../shared/types.js';

export function createApp(db: Db, opts: { clientDist?: string; clueSets?: ClueSet[] } = {}) {
  const game = new Game(db);
  const clues = new Clues(db, opts.clueSets ?? loadClueSets());
  const parties = new Parties(async () => { const d = await game.day(lagosDate()); return { letter: d.letter, bonus: d.bonus }; });
  const app = new Hono();
  const pngCache = new PngCache();
  const newPlayerLimiter = new RateLimiter(30, 60 * 60_000);
  const apiLimiter = new RateLimiter(300, 60_000);

  const ip = (c: Context) =>
    (config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined) ?? (c.env as any)?.incoming?.socket?.remoteAddress ?? 'unknown';
  const bearer = (c: Context) => c.req.header('authorization')?.replace(/^Bearer\s+/i, '') || undefined;
  const me = (c: Context) => game.playerByToken(bearer(c));

  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'", 'ws:', 'wss:'], manifestSrc: ["'self'"], workerSrc: ["'self'"],
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: 'cross-origin',
  }));
  app.use('*', compress());
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
    console.error(err);
    return c.json({ error: 'Something went wrong' }, 500);
  });

  const api = new Hono();
  api.use('*', async (c, next) => {
    if (!apiLimiter.allow(ip(c))) return c.json({ error: 'Too many requests' }, 429);
    c.header('Cache-Control', 'no-store');
    await next();
  });
  api.get('/health', async (c) => { await db.query('SELECT 1'); return c.json({ ok: true }); });

  api.post('/bootstrap', async (c) => {
    const body = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
    const token = bearer(c) ?? body.token;
    const known = token ? await game.playerByToken(token).then(() => true, () => false) : false;
    if (!known && !newPlayerLimiter.allow(ip(c))) throw new HttpError(429, 'Too many new players from this network');
    const s = await game.session(token);
    const res: BootstrapResponse = { token: s.token, player: toPlayer(s.player), today: await game.today(s.player), groups: await game.groups(s.player) };
    return c.json(res);
  });

  api.post('/daily/start', async (c) => c.json({ today: await game.start(await me(c)) }));
  api.post('/daily/draft', async (c) => {
    const b = await c.req.json<{ answers: Record<string, string> }>().catch(() => ({ answers: {} }));
    await game.draft(await me(c), b.answers ?? {});
    return c.json({ ok: true });
  });
  api.post('/daily/submit', async (c) => {
    const b = await c.req.json<{ answers: Record<string, string> }>().catch(() => ({ answers: {} }));
    return c.json(await game.submit(await me(c), b.answers ?? {}));
  });
  api.get('/daily/result', async (c) => {
    const r = await game.result(await me(c));
    if (!r) throw new HttpError(404, "You haven't played today's letter yet");
    return c.json(r);
  });
  api.get('/daily/board', async (c) => {
    const token = bearer(c);
    const p = token ? await game.playerByToken(token).catch(() => null) : null;
    return c.json(await game.board(p?.id ?? null));
  });

  api.get('/me', async (c) => c.json(await game.stats(await me(c))));
  api.patch('/me', async (c) => {
    const b = await c.req.json<{ nickname?: string }>();
    return c.json({ player: toPlayer(await game.setNickname((await me(c)).id, String(b.nickname ?? ''))) });
  });

  api.get('/groups', async (c) => c.json({ groups: await game.groups(await me(c)) }));
  api.post('/groups', async (c) => {
    const b = await c.req.json<{ name?: string }>();
    return c.json({ group: await game.createGroup(await me(c), String(b.name ?? '')) });
  });
  api.post('/groups/:code/join', async (c) => c.json({ group: await game.joinGroup(await me(c), c.req.param('code')) }));
  api.post('/groups/:code/leave', async (c) => { await game.leaveGroup(await me(c), c.req.param('code')); return c.json({ ok: true }); });
  api.get('/groups/:code', async (c) => c.json(await game.groupDetail(await me(c), c.req.param('code'))));
  api.post('/groups/:code/vote', async (c) => {
    const b = await c.req.json<{ playerId: string; category: any; value: -1 | 0 | 1 }>();
    if (![-1, 0, 1].includes(b.value)) throw new HttpError(400, 'Bad vote');
    return c.json(await game.vote(await me(c), c.req.param('code'), b));
  });

  api.get('/clue', async (c) => c.json(await clues.day((await me(c)).id)));
  api.post('/clue/guess', async (c) => {
    const b = await c.req.json<{ index: number; guess: string }>();
    if (!Number.isInteger(b.index)) throw new HttpError(400, 'Bad request');
    return c.json(await clues.guess((await me(c)).id, b.index, String(b.guess ?? '')));
  });
  api.post('/clue/hint', async (c) => {
    const b = await c.req.json<{ index: number }>();
    if (!Number.isInteger(b.index)) throw new HttpError(400, 'Bad request');
    return c.json(await clues.hint((await me(c)).id, b.index));
  });
  api.post('/clue/theme', async (c) => {
    const b = await c.req.json<{ guess: string }>();
    return c.json(await clues.theme((await me(c)).id, String(b.guess ?? '')));
  });
  api.post('/clue/giveup', async (c) => {
    const b = await c.req.json<{ index: number }>();
    if (!Number.isInteger(b.index)) throw new HttpError(400, 'Bad request');
    return c.json(await clues.giveUp((await me(c)).id, b.index));
  });
  api.post('/clue/nudge', async (c) => c.json(await clues.nudge((await me(c)).id)));

  api.post('/party', async (c) => { await me(c); return c.json({ code: parties.create() }); });
  api.get('/party/:code', (c) => c.json({ exists: parties.exists(c.req.param('code')) }));
  api.get('/share/:id', async (c) => {
    const s = await game.sharePreview(c.req.param('id'));
    if (!s) throw new HttpError(404, 'Not found');
    return c.json(s);
  });
  app.route('/api', api);

  // ---------- link previews (WhatsApp reads these server-rendered tags) ----------
  app.get('/r/:id', async (c) => {
    const s = await game.sharePreview(c.req.param('id'));
    if (!s) return c.redirect('/', 302);
    c.header('Cache-Control', 'public, max-age=300');
    return c.html(sharePageHtml(s));
  });
  app.get('/g/:code', async (c) => {
    const g = (await db.query<{ name: string }>(`SELECT name FROM groups WHERE code = $1`, [c.req.param('code')]))[0];
    if (!g) return c.redirect('/', 302);
    return c.html(invitePageHtml({ kind: 'group', name: g.name, href: `/?g=${encodeURIComponent(c.req.param('code'))}` }));
  });
  app.get('/p/:code', (c) => {
    const code = c.req.param('code').toUpperCase();
    if (!parties.exists(code)) return c.redirect('/?p=closed', 302);
    return c.html(invitePageHtml({ kind: 'party', name: code, href: `/?p=${encodeURIComponent(code)}` }));
  });
  const png = (c: Context, buf: Buffer, maxAge: number) => {
    c.header('Content-Type', 'image/png');
    c.header('Cache-Control', `public, max-age=${maxAge}`);
    return c.body(new Uint8Array(buf));
  };
  app.get('/og/default.png', (c) => {
    let b = pngCache.get('default');
    if (!b) pngCache.set('default', (b = renderPng(defaultSvg(), 1200)));
    return png(c, b, 86400);
  });
  app.get('/og/:file{[a-z0-9]{6,12}\\.png}', async (c) => {
    const id = c.req.param('file').replace(/\.png$/, '');
    const format = c.req.query('format') === 'story' ? 'story' : 'og';
    const s = await game.sharePreview(id);
    if (!s) return c.notFound();
    // Scores settle at the end of the day, so cache past days for long and today briefly.
    const key = `${id}:${format}:${s.score}`;
    let b = pngCache.get(key);
    if (!b) pngCache.set(key, (b = renderPng(resultSvg(s, format), format === 'story' ? 1080 : 1200)));
    return png(c, b, s.isToday ? 300 : 31_536_000);
  });

  const dist = resolve(opts.clientDist ?? config.clientDist);
  if (existsSync(join(dist, 'index.html'))) {
    const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
    app.use('/assets/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=31536000, immutable'); });
    app.use('/sw.js', async (c, next) => { await next(); c.header('Cache-Control', 'no-cache'); });
    app.get('/', (c) => { c.header('Cache-Control', 'no-cache'); return c.html(indexHtml); });
    app.use('/*', serveStatic({ root: dist, precompressed: true }));
    app.get('*', (c) => { c.header('Cache-Control', 'no-cache'); return c.html(indexHtml); });
  }
  return { app, game, parties, clues };
}
