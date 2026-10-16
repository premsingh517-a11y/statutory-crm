// PostgreSQL connection + schema
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('\nDATABASE_URL is not set. Example:\n  DATABASE_URL=postgres://user:pass@localhost:5432/neusource_crm\n');
  process.exit(1);
}

// Render / most cloud Postgres need SSL; local Postgres does not.
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' || isLocal ? false : { rejectUnauthorized: false },
  max: 10,
});

const query = (text, params) => pool.query(text, params);

async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'executive' CHECK (role IN ('admin','executive')),
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS clients (
      id          SERIAL PRIMARY KEY,
      data        JSONB NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cas (
      id          SERIAL PRIMARY KEY,
      data        JSONB NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS filings (
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      case_type   TEXT NOT NULL CHECK (case_type IN ('first','agm','casual')),
      data        JSONB NOT NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, case_type)
    );
    CREATE TABLE IF NOT EXISTS activity (
      id        SERIAL PRIMARY KEY,
      user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action    TEXT NOT NULL,
      detail    TEXT,
      at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS activity_at_idx ON activity (at DESC);
  `);
}

async function log(userId, action, detail) {
  try { await query('INSERT INTO activity (user_id, action, detail) VALUES ($1,$2,$3)', [userId || null, action, detail || null]); }
  catch (e) { console.error('activity log failed', e.message); }
}

module.exports = { pool, query, init, log };
