CREATE TABLE IF NOT EXISTS season_titles(
  account_id TEXT NOT NULL,
  season TEXT NOT NULL,
  title TEXT NOT NULL,
  rank INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,season)
);
CREATE INDEX IF NOT EXISTS season_titles_season ON season_titles(season,rank);
CREATE TABLE IF NOT EXISTS guild_weekly_tasks(
  guild_id TEXT NOT NULL,
  week TEXT NOT NULL,
  task_id TEXT NOT NULL,
  target INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id,week,task_id)
);
CREATE TABLE IF NOT EXISTS guild_weekly_task_members(
  guild_id TEXT NOT NULL,
  week TEXT NOT NULL,
  task_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id,week,task_id,account_id)
);
CREATE TABLE IF NOT EXISTS guild_weekly_task_receipts(
  session_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  week TEXT NOT NULL,
  task_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(session_id,account_id)
);
