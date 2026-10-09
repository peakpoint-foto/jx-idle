-- P06: server-simulated weekly trial results. Additive only. One best result per account, week, length and rules tag;
-- trial_recorded makes each finished session count exactly once.
CREATE TABLE IF NOT EXISTS trial_results(
  week INTEGER NOT NULL,
  length TEXT NOT NULL,
  account_id TEXT NOT NULL,
  rules TEXT NOT NULL,
  session_id TEXT NOT NULL,
  depth INTEGER NOT NULL,
  score REAL NOT NULL,
  ticks INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(week,length,account_id,rules)
);
CREATE INDEX IF NOT EXISTS trial_results_board ON trial_results(week,length,rules,score DESC,created_at);
CREATE TABLE IF NOT EXISTS trial_recorded(session_id TEXT PRIMARY KEY,recorded_at INTEGER NOT NULL);
