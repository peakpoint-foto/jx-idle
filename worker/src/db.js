// Lược đồ D1. Mọi câu lệnh đều idempotent (IF NOT EXISTS) và được chạy một lần mỗi isolate,
// nên deploy không cần bước "d1 migrations apply" riêng. Bản SQL tham chiếu: migrations/0001_init.sql.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS telemetry_events(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,event TEXT NOT NULL,install_week TEXT NOT NULL,active_days TEXT NOT NULL,mode TEXT NOT NULL DEFAULT '',value TEXT)`,
  `CREATE INDEX IF NOT EXISTS telemetry_event_at ON telemetry_events(event,at)`,
  `CREATE TABLE IF NOT EXISTS player_blocks(blocker_id TEXT NOT NULL,target_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(blocker_id,target_id),CHECK(blocker_id<>target_id))`,
  `CREATE TABLE IF NOT EXISTS player_mutes(muter_id TEXT NOT NULL,target_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(muter_id,target_id),CHECK(muter_id<>target_id))`,
  `CREATE INDEX IF NOT EXISTS player_mutes_expiry ON player_mutes(expires_at)`,
  `CREATE TABLE IF NOT EXISTS room_chat(id TEXT PRIMARY KEY,scope TEXT NOT NULL DEFAULT 'room',room_id TEXT NOT NULL,sender_id TEXT NOT NULL,client_id TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(sender_id,client_id))`,
  `CREATE INDEX IF NOT EXISTS room_chat_scope_room_time ON room_chat(scope,room_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS season_meta(season_idx INTEGER PRIMARY KEY,frozen_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS season_final(season_idx INTEGER NOT NULL,account_id TEXT NOT NULL,fac TEXT NOT NULL,bracket TEXT NOT NULL,points INTEGER NOT NULL,wins INTEGER NOT NULL,placement INTEGER NOT NULL,group_size INTEGER NOT NULL,title TEXT NOT NULL,claimed_at INTEGER,PRIMARY KEY(season_idx,account_id))`,
  `CREATE INDEX IF NOT EXISTS season_final_group ON season_final(season_idx,fac,bracket,placement)`,
  `CREATE TABLE IF NOT EXISTS trial_results(week INTEGER NOT NULL,length TEXT NOT NULL,account_id TEXT NOT NULL,rules TEXT NOT NULL,session_id TEXT NOT NULL,depth INTEGER NOT NULL,score REAL NOT NULL,ticks INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(week,length,account_id,rules))`,
  `CREATE INDEX IF NOT EXISTS trial_results_board ON trial_results(week,length,rules,score DESC,created_at)`,
  `CREATE TABLE IF NOT EXISTS trial_recorded(session_id TEXT PRIMARY KEY,recorded_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS quota_claims(account_id TEXT NOT NULL,scope TEXT NOT NULL,period TEXT NOT NULL,idem_key TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(account_id,scope,period,idem_key))`,
  `CREATE INDEX IF NOT EXISTS quota_claims_lookup ON quota_claims(account_id,scope,period)`,
  `CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,author_id TEXT NOT NULL,preset TEXT NOT NULL,version TEXT NOT NULL,spec TEXT NOT NULL,spec_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,UNIQUE(author_id,preset,version,spec_hash))`,
  `CREATE INDEX IF NOT EXISTS challenges_recent ON challenges(status,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS challenges_author ON challenges(author_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS challenge_attempts(session_id TEXT PRIMARY KEY,challenge_id TEXT NOT NULL,account_id TEXT NOT NULL,created_at INTEGER NOT NULL,recorded_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS challenge_attempts_account ON challenge_attempts(account_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS challenge_results(challenge_id TEXT NOT NULL,account_id TEXT NOT NULL,session_id TEXT NOT NULL,depth INTEGER NOT NULL,score REAL NOT NULL,ticks INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(challenge_id,account_id))`,
  `CREATE INDEX IF NOT EXISTS challenge_results_board ON challenge_results(challenge_id,score DESC,created_at)`,
  `CREATE INDEX IF NOT EXISTS player_blocks_target ON player_blocks(target_id,blocker_id)`,
  `CREATE TABLE IF NOT EXISTS player_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,reporter_id TEXT NOT NULL,target_id TEXT NOT NULL,reason TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open')`,
  `CREATE INDEX IF NOT EXISTS player_reports_status_created ON player_reports(status,created_at)`,
  `CREATE TABLE IF NOT EXISTS admin_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,created_at INTEGER NOT NULL,detail TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS combat_sessions(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,creator_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,ended_at INTEGER)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS combat_sessions_room_active ON combat_sessions(room_id) WHERE status='active'`,
  `CREATE TABLE IF NOT EXISTS session_members(session_id TEXT NOT NULL,account_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,withdrawn INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL,connected_from INTEGER NOT NULL,last_seq INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(session_id,account_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS session_members_active ON session_members(account_id) WHERE active=1`,
  `CREATE TABLE IF NOT EXISTS session_actions(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,account_id TEXT NOT NULL,seq INTEGER NOT NULL,scheduled_tick INTEGER NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 0,UNIQUE(session_id,account_id,seq),UNIQUE(session_id,account_id,scheduled_tick))`,
  `CREATE INDEX IF NOT EXISTS session_actions_pending ON session_actions(session_id,applied,scheduled_tick)`,
  `CREATE TABLE IF NOT EXISTS session_rewards(session_id TEXT NOT NULL,account_id TEXT NOT NULL,amount INTEGER NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(session_id,account_id))`,
  `CREATE TABLE IF NOT EXISTS resource_ledger(account_id TEXT NOT NULL,mode TEXT NOT NULL,asset TEXT NOT NULL,request_id TEXT NOT NULL,source TEXT NOT NULL,delta INTEGER NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,payload TEXT,guild_id TEXT,PRIMARY KEY(account_id,mode,asset,request_id))`,
  `CREATE INDEX IF NOT EXISTS resource_ledger_day ON resource_ledger(account_id,mode,asset,day)`,
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
  `CREATE TABLE IF NOT EXISTS activity_events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    event_key TEXT NOT NULL,
    activity TEXT NOT NULL,
    mode TEXT NOT NULL,
    period TEXT NOT NULL,
    contribution INTEGER NOT NULL DEFAULT 0,
    cleared INTEGER NOT NULL DEFAULT 0,
    won INTEGER NOT NULL DEFAULT 0,
    accepted_at INTEGER NOT NULL,
    UNIQUE(account_id, event_key)
  )`,
  `CREATE INDEX IF NOT EXISTS activity_quota ON activity_events(account_id, activity, period)`,
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
  `CREATE TABLE IF NOT EXISTS duel_meta(duel_id TEXT PRIMARY KEY,kind TEXT NOT NULL,rules_version TEXT NOT NULL,combat_version TEXT NOT NULL,challenger_rev INTEGER NOT NULL,defender_rev INTEGER NOT NULL)`,
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
  `CREATE TABLE IF NOT EXISTS guild_receipts(account_id TEXT NOT NULL,request_id TEXT NOT NULL,guild_id TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(account_id,request_id))`,
  `CREATE TABLE IF NOT EXISTS guild_logs(account_id TEXT NOT NULL,request_id TEXT NOT NULL,guild_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(account_id,request_id))`,
  `CREATE INDEX IF NOT EXISTS guild_logs_recent ON guild_logs(guild_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS mentorships(
    mentor_id TEXT NOT NULL,
    disciple_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(mentor_id, disciple_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mentorship_disciple ON mentorships(disciple_id)`,
  `CREATE TABLE IF NOT EXISTS mentor_codes(
    account_id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mentor_milestones(
    mentor_id TEXT NOT NULL,
    disciple_id TEXT NOT NULL,
    milestone INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(mentor_id, disciple_id, milestone)
  )`,
  `CREATE TABLE IF NOT EXISTS mentor_rewards(
    account_id TEXT NOT NULL,
    milestone INTEGER NOT NULL,
    disciple_id TEXT NOT NULL,
    gold INTEGER NOT NULL,
    claimed_at INTEGER,
    request_id TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(account_id, milestone, disciple_id)
  )`,
  `CREATE TABLE IF NOT EXISTS guild_calendar(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,title TEXT NOT NULL,activity TEXT NOT NULL,starts_at INTEGER NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS guild_calendar_next ON guild_calendar(guild_id,starts_at)`,
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
  `CREATE TABLE IF NOT EXISTS friendships(a TEXT NOT NULL,b TEXT NOT NULL,requester TEXT NOT NULL,status TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(a,b))`,
  `CREATE INDEX IF NOT EXISTS friendships_recipient ON friendships(b,status,expires_at)`,
  `CREATE TABLE IF NOT EXISTS room_invites(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS room_invites_recipient ON room_invites(recipient_id,status,expires_at)`,
  `CREATE TABLE IF NOT EXISTS lobby_rooms(room_id TEXT PRIMARY KEY,objective TEXT NOT NULL DEFAULT 'farm',revision INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS lobby_members(room_id TEXT NOT NULL,account_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'damage',ready INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_id,account_id))`,
  `CREATE TABLE IF NOT EXISTS boss_receipts(
    account_id TEXT NOT NULL,request_id TEXT NOT NULL,guild_id TEXT NOT NULL,
    week TEXT NOT NULL,day TEXT NOT NULL,damage INTEGER NOT NULL,created_at INTEGER NOT NULL,
    PRIMARY KEY(account_id,request_id)
  )`,
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
  "ALTER TABLE chars ADD COLUMN mode TEXT NOT NULL DEFAULT 'ctc'",
  "ALTER TABLE rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'ctc'",
];

const readyByDatabase = new WeakMap();

export function ensureSchema(db) {
  let ready = readyByDatabase.get(db);
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
        await db.prepare("CREATE INDEX IF NOT EXISTS chars_mode ON chars(mode, bracket, validation_status)").run();
      })
      .catch((e) => {
        readyByDatabase.delete(db);
        throw e;
      });
    readyByDatabase.set(db, ready);
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
