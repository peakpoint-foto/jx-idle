-- Reference for the additive table also created by ensureSchema.
-- Never apply to production as part of automated local verification.
CREATE TABLE IF NOT EXISTS boss_receipts(
  account_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  week TEXT NOT NULL,
  day TEXT NOT NULL,
  damage INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,request_id)
);
