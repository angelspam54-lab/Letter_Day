export const config = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? '',
  pgliteDir: process.env.PGLITE_DIR ?? './.data/pglite',
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:8787').replace(/\/$/, ''),
  /** Day #1 of Letter Day (game-day date). */
  launchDate: process.env.LAUNCH_DATE ?? '2026-11-20',
  appName: process.env.APP_NAME ?? 'Letter Day',
  clientDist: process.env.CLIENT_DIST ?? '../client/dist',
  trustProxy: process.env.TRUST_PROXY === '1',
};
