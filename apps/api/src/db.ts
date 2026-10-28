import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7382261)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, role text NOT NULL CHECK(role IN ('superadmin','admin','editor','viewer')), password text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS sessions (hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS media (id uuid PRIMARY KEY, name text NOT NULL, mime text NOT NULL, size bigint NOT NULL, checksum text NOT NULL, path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS scenes (id uuid PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS programs (id uuid PRIMARY KEY, name text NOT NULL, items jsonb NOT NULL DEFAULT '[]', published_version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS program_versions (program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE, version integer NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(program_id,version));
      CREATE TABLE IF NOT EXISTS groups (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE IF NOT EXISTS screens (id uuid PRIMARY KEY, name text NOT NULL, group_id uuid REFERENCES groups(id) ON DELETE SET NULL, orientation text NOT NULL DEFAULT 'landscape', fallback_program_id uuid REFERENCES programs(id), token_hash text UNIQUE, last_seen timestamptz, current_program_id uuid, revision text);
      CREATE TABLE IF NOT EXISTS pair_requests (id uuid PRIMARY KEY, device_hash text NOT NULL, code text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, screen_id uuid REFERENCES screens(id) ON DELETE CASCADE, consumed boolean NOT NULL DEFAULT false);
      CREATE TABLE IF NOT EXISTS schedules (id uuid PRIMARY KEY, data jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (id uuid PRIMARY KEY, screen_id uuid NOT NULL REFERENCES screens(id) ON DELETE CASCADE, type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS events (id bigserial PRIMARY KEY, screen_id uuid, actor_id uuid, type text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS security_events (id bigserial PRIMARY KEY, actor_id uuid, type text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events(created_at DESC);
      CREATE TABLE IF NOT EXISTS pdf_imports(id uuid PRIMARY KEY,name text NOT NULL,path text NOT NULL,status text NOT NULL DEFAULT 'pending',error text,media_ids jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS video_imports(id uuid PRIMARY KEY,name text NOT NULL,path text NOT NULL,status text NOT NULL DEFAULT 'pending',error text,media_id uuid,duration double precision,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS events_screen_time_idx ON events(screen_id,created_at);
      CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at DESC);
      CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS screens_group_idx ON screens(group_id);
    `);
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
