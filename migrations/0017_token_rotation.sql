-- W1-5: token rotation + device tokens.
-- Grace period: khi xoay token chính, token cũ chuyển vào prev_token_hash và
-- còn hiệu lực 24h (prev_token_expires_at) để các tab/thiết bị khác không bị
-- khóa đột ngột. Hết 24h -> 401.
ALTER TABLE accounts ADD COLUMN prev_token_hash TEXT;
ALTER TABLE accounts ADD COLUMN prev_token_expires_at INTEGER;
CREATE TABLE IF NOT EXISTS account_devices(
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS account_devices_account ON account_devices(account_id, revoked_at);
