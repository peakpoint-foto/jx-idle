CREATE TABLE IF NOT EXISTS resource_ledger(
  account_id TEXT NOT NULL,mode TEXT NOT NULL,asset TEXT NOT NULL,request_id TEXT NOT NULL,
  source TEXT NOT NULL,delta INTEGER NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,
  payload TEXT,guild_id TEXT,
  PRIMARY KEY(account_id,mode,asset,request_id)
);
CREATE INDEX IF NOT EXISTS resource_ledger_day ON resource_ledger(account_id,mode,asset,day);
