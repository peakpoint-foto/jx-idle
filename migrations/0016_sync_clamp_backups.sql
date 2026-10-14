-- Pre-clamp sync snapshots (staging/dev). Do not apply to production D1 until release gate.
CREATE TABLE IF NOT EXISTS sync_clamp_backups(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_clamp_backups_account ON sync_clamp_backups(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_clamp_backups_created ON sync_clamp_backups(created_at);
