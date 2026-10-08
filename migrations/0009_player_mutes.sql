CREATE TABLE IF NOT EXISTS player_mutes(
  muter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(muter_id,target_id),
  CHECK(muter_id<>target_id)
);
CREATE INDEX IF NOT EXISTS player_mutes_expiry ON player_mutes(expires_at);
