// Database connection + schema
// • DATABASE_URL set  → real PostgreSQL (Render / Neon / your own server)
// • DATABASE_URL empty → built-in local database saved in the ./data folder (no install needed)
const path = require('path');
const { Pool } = require('pg');

let pool = null, local = null, ready;

if (process.env.DATABASE_URL) {
  // Render / most cloud Postgres need SSL; local Postgres does not.
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(process.env.DATABASE_URL);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' || isLocal ? false : { rejectUnauthorized: false },
    max: 10,
  });
  ready = Promise.resolve();
} else {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'pgdata');
  console.log('No DATABASE_URL — using the built-in local database in ' + dir);
  require('fs').mkdirSync(dir, { recursive: true });
  ready = import('@electric-sql/pglite').then(({ PGlite }) => { local = new PGlite(dir); return local.waitReady; });
}

async function query(text, params) {
  if (pool) return pool.query(text, params);
  await ready;
  // the local database expects JSON values as text
  const p = (params || []).map(x => (x && typeof x === 'object' && !(x instanceof Date)) ? JSON.stringify(x) : x);
  return local.query(text, p);
}
async function exec(sql) { if (pool) return pool.query(sql); await ready; return local.exec(sql); }

async function init() {
  await exec(`
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
      case_type   TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS files (
      owner_type  TEXT NOT NULL,
      owner_id    INTEGER NOT NULL,
      name        TEXT NOT NULL,
      data        TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_type, owner_id)
    );
    ALTER TABLE filings DROP CONSTRAINT IF EXISTS filings_case_type_check;
    CREATE TABLE IF NOT EXISTS templates (
      case_type   TEXT NOT NULL,
      variant     TEXT NOT NULL DEFAULT '',
      doc_id      TEXT NOT NULL,
      body        TEXT NOT NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (case_type, variant, doc_id)
    );
  `);
}

async function log(userId, action, detail) {
  try { await query('INSERT INTO activity (user_id, action, detail) VALUES ($1,$2,$3)', [userId || null, action, detail || null]); }
  catch (e) { console.error('activity log failed', e.message); }
}

module.exports = { get pool() { return pool; }, isLocal: !pool, query, init, log };
