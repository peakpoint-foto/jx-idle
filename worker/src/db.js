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
    sync_n INTEGER NOT NULL DEFAULT 0,
    character_id TEXT,
    validation_status TEXT NOT NULL DEFAULT 'verified',
    validation_note TEXT
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
  `CREATE TABLE IF NOT EXISTS duels(
    id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    challenger_id TEXT NOT NULL,
    defender_id TEXT NOT NULL,
    challenger_name TEXT NOT NULL,
    defender_name TEXT NOT NULL,
    challenger_power INTEGER NOT NULL,
    defender_power INTEGER NOT NULL,
    challenger_bracket TEXT,
    defender_bracket TEXT,
    challenger_snapshot TEXT NOT NULL,
    defender_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    winner_id TEXT,
    challenger_score REAL,
    defender_score REAL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    resolved_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS duels_challenger ON duels(challenger_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS duels_defender ON duels(defender_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS duel_scores(
    account_id TEXT NOT NULL,
    season TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(account_id, season)
  )`,
  `CREATE TABLE IF NOT EXISTS guilds(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    week TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    boss_hp INTEGER NOT NULL DEFAULT 1000000,
    boss_max_hp INTEGER NOT NULL DEFAULT 1000000,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS guild_name ON guilds(name COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS guild_members(
    guild_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    contrib INTEGER NOT NULL DEFAULT 0,
    weekly_damage INTEGER NOT NULL DEFAULT 0,
    attack_day TEXT,
    attack_count INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY(guild_id, account_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS guild_member_account ON guild_members(account_id)`,
  `CREATE TABLE IF NOT EXISTS rooms(
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS room_members(
    room_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    power INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    action_seq INTEGER NOT NULL DEFAULT 0,
    last_action TEXT,
    PRIMARY KEY(room_id, account_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS room_member_account ON room_members(account_id)`,
  `CREATE INDEX IF NOT EXISTS room_members_seen ON room_members(room_id, last_seen)`,
];

// Cột thêm sau lần phát hành đầu: ALTER chạy riêng, bỏ qua lỗi "duplicate column" khi đã có.
const COLUMNS = [
  "ALTER TABLE chars ADD COLUMN power INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE chars ADD COLUMN bracket TEXT",
  "ALTER TABLE chars ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE chars ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'verified'",
  "ALTER TABLE chars ADD COLUMN validation_note TEXT",
  "ALTER TABLE chars ADD COLUMN character_id TEXT",
  "ALTER TABLE chars ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 1",
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
        await db.prepare("CREATE INDEX IF NOT EXISTS chars_ladder ON chars(validation_status, bracket, flagged, power)").run();
        await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS chars_character_id ON chars(character_id) WHERE character_id IS NOT NULL").run();
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
