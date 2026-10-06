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
  `CREATE TABLE IF NOT EXISTS flags(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    code TEXT NOT NULL,
    detail TEXT,
    at INTEGER NOT NULL,
    cleared_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS flags_acc ON flags(account_id, cleared_at)`,
  `CREATE INDEX IF NOT EXISTS flags_at ON flags(at)`,
  `CREATE TABLE IF NOT EXISTS feedback(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    cat TEXT NOT NULL,
    text TEXT NOT NULL,
    contact TEXT,
    ctx TEXT,
    ip_hash TEXT,
    status TEXT NOT NULL DEFAULT 'open'
  )`,
  `CREATE INDEX IF NOT EXISTS feedback_at ON feedback(status, at)`,
];

// Cột thêm sau lần phát hành đầu: ALTER chạy riêng, bỏ qua lỗi "duplicate column" khi đã có.
const COLUMNS = [
  "ALTER TABLE chars ADD COLUMN power INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE chars ADD COLUMN bracket TEXT",
  "ALTER TABLE chars ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0",
];

let ready = null;

export function ensureSchema(db) {
  if (!ready) {
    ready = db
      .batch(SCHEMA.map((s) => db.prepare(s)))
      .then(async () => {
        for (const sql of COLUMNS)
          await db.prepare(sql).run().catch((e) => {
            if (!/duplicate column/i.test(String(e && e.message))) throw e;
          });
        await db.prepare("CREATE INDEX IF NOT EXISTS chars_ladder ON chars(bracket, flagged, power)").run();
      })
      .catch((e) => {
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
