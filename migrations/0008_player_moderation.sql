CREATE TABLE IF NOT EXISTS player_blocks(
  blocker_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(blocker_id,target_id),
  CHECK(blocker_id<>target_id)
);
CREATE INDEX IF NOT EXISTS player_blocks_target ON player_blocks(target_id,blocker_id);
CREATE TABLE IF NOT EXISTS player_reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS player_reports_status_created ON player_reports(status,created_at);
CREATE TABLE IF NOT EXISTS admin_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  created_at INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
