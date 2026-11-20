import type { Db } from './index.js';

const MIGRATIONS: string[] = [
  `CREATE TABLE players (
     id UUID PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, nickname TEXT,
     xp INTEGER NOT NULL DEFAULT 0, current_streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
     last_played_date DATE, games_played INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE days (date DATE PRIMARY KEY, letter TEXT NOT NULL, bonus TEXT NOT NULL);
   CREATE TABLE plays (
     id UUID PRIMARY KEY, player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE, date DATE NOT NULL,
     started_at TIMESTAMPTZ NOT NULL, deadline TIMESTAMPTZ NOT NULL, draft JSONB NOT NULL DEFAULT '{}'::jsonb,
     submitted_at TIMESTAMPTZ, seconds_left INTEGER NOT NULL DEFAULT 0, xp_earned INTEGER NOT NULL DEFAULT 0,
     streak_after INTEGER NOT NULL DEFAULT 0, share_id TEXT UNIQUE, UNIQUE (player_id, date)
   );
   CREATE TABLE answers (
     play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE, player_id UUID NOT NULL, date DATE NOT NULL,
     category TEXT NOT NULL, raw TEXT NOT NULL, norm TEXT NOT NULL, display TEXT NOT NULL, status TEXT NOT NULL, reason TEXT,
     PRIMARY KEY (play_id, category)
   );
   CREATE INDEX answers_date ON answers (date, category, norm);
   CREATE TABLE groups (id UUID PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
   CREATE TABLE group_members (group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE, player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE, joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (group_id, player_id));
   CREATE INDEX group_members_player ON group_members (player_id);
   CREATE TABLE group_votes (
     group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE, date DATE NOT NULL, category TEXT NOT NULL, norm TEXT NOT NULL,
     voter_id UUID NOT NULL, value SMALLINT NOT NULL, PRIMARY KEY (group_id, date, category, norm, voter_id)
   );`,
  // The Clue: one row per player per day; the round-by-round state lives in JSON.
  `CREATE TABLE clue_plays (
     player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE, date DATE NOT NULL, set_id TEXT NOT NULL,
     state JSONB NOT NULL, score INTEGER NOT NULL DEFAULT 0, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
     PRIMARY KEY (player_id, date)
   );
   CREATE INDEX clue_plays_date ON clue_plays (date)`,
];

export async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const rows = await db.query<{ v: number | null }>(`SELECT max(version) AS v FROM schema_migrations`);
  for (let i = rows[0]?.v ?? 0; i < MIGRATIONS.length; i++) {
    await db.tx(async (q) => {
      for (const stmt of MIGRATIONS[i].split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.query(stmt);
      await q.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [i + 1]);
    });
  }
}
