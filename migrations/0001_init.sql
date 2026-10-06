-- Bản tham chiếu. Worker tự chạy các lệnh này (IF NOT EXISTS) khi nhận request đầu tiên,
-- xem worker/src/db.js. Có thể chạy tay: npx wrangler d1 migrations apply DB --remote
CREATE TABLE IF NOT EXISTS accounts(
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT,
  play_sec REAL NOT NULL DEFAULT 0,
  last_hb INTEGER,
  off_t0 INTEGER,
  off_sec REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_name ON accounts(name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS chars(
  account_id TEXT PRIMARY KEY,
  fac TEXT,
  sex INTEGER,
  lvl INTEGER NOT NULL DEFAULT 1,
  xp REAL NOT NULL DEFAULT 0,
  snapshot TEXT,
  updated_at INTEGER,
  sync_n INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rate(k TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  cat TEXT NOT NULL,
  text TEXT NOT NULL,
  contact TEXT,
  ctx TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS feedback_at ON feedback(status, at);
