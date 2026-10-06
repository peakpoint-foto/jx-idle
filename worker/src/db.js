// Lược đồ D1. Mọi câu lệnh đều idempotent (IF NOT EXISTS) và được chạy một lần mỗi isolate,
// nên deploy không cần bước "d1 migrations apply" riêng. Bản SQL tham chiếu: migrations/0001_init.sql.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts(
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ip_hash TEXT,
    play_sec REAL NOT NULL DEFAULT 0,
    last_hb INTEGER,
    off_t0 INTEGER,
    off_sec REAL NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS accounts_name ON accounts(name COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS chars(
    account_id TEXT PRIMARY KEY,
    fac TEXT,
    sex INTEGER,
    lvl INTEGER NOT NULL DEFAULT 1,
    xp REAL NOT NULL DEFAULT 0,
    snapshot TEXT,
    updated_at INTEGER,
    sync_n INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS rate(k TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL)`,
];

let ready = null;

export function ensureSchema(db) {
  if (!ready) {
    ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

// Giới hạn tốc độ đơn giản theo cửa sổ cố định, lưu trong D1.
export async function rateLimit(db, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const t0 = now - (now % windowSec);
  const row = await db
    .prepare(
      `INSERT INTO rate(k,n,t) VALUES(?1,1,?2)
       ON CONFLICT(k) DO UPDATE SET n=CASE WHEN rate.t=?2 THEN rate.n+1 ELSE 1 END, t=?2
       RETURNING n`
    )
    .bind(key, t0)
    .first();
  return row.n <= max;
}
