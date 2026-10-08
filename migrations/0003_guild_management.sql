-- Additive management metadata; existing guild/member rows are unchanged.
CREATE TABLE IF NOT EXISTS guild_receipts(account_id TEXT NOT NULL,request_id TEXT NOT NULL,guild_id TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(account_id,request_id));
CREATE TABLE IF NOT EXISTS guild_logs(account_id TEXT NOT NULL,request_id TEXT NOT NULL,guild_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(account_id,request_id));
CREATE INDEX IF NOT EXISTS guild_logs_recent ON guild_logs(guild_id,created_at);
CREATE TABLE IF NOT EXISTS guild_calendar(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,title TEXT NOT NULL,activity TEXT NOT NULL,starts_at INTEGER NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS guild_calendar_next ON guild_calendar(guild_id,starts_at);
