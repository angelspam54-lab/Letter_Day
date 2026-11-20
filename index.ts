import { config } from '../config.js';

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Production: real PostgreSQL via DATABASE_URL. Dev/test: embedded PGlite (same SQL dialect). */
export async function createDb(opts: { url?: string; pgliteDir?: string } = {}): Promise<Db> {
  const url = opts.url ?? config.databaseUrl;
  if (url) {
    const { default: pg } = await import('pg');
    pg.types.setTypeParser(1082, (v: string) => v); // DATE -> 'YYYY-MM-DD' string
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
      idleTimeoutMillis: 30_000,
    });
    // Hosted databases (e.g. Neon) close idle connections when they sleep; don't let that crash the server.
    pool.on('error', (e) => console.warn('database connection dropped:', e.message));
    return {
      async query(sql, params) { return (await pool.query(sql, params as any[])).rows; },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const res = await fn({ query: async (s, p) => (await client.query(s, p as any[])).rows });
          await client.query('COMMIT');
          return res;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite, types } = await import('@electric-sql/pglite');
  const dir = opts.pgliteDir ?? config.pgliteDir;
  if (!dir.startsWith('memory://')) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dir, { recursive: true });
  }
  const db = new PGlite(dir, { parsers: { [types.DATE]: (v: string) => v } });
  // PGlite is single-connection: serialise transactions so they don't interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
  return {
    query: (sql, params) => run(async () => (await db.query<any>(sql, params as any[])).rows),
    tx: (fn) => run(() => db.transaction(async (t) => fn({ query: async (s, p) => (await t.query<any>(s, p as any[])).rows }))),
    close: () => db.close(),
  };
}
