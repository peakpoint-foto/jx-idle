-- G04: community challenges for mode 2.0. Additive only. A challenge is a validated build (no free text) plus a preset; results come only
-- from the server simulating a run (challenge_attempts links a combat session to its challenge and is recorded exactly once).
CREATE TABLE IF NOT EXISTS challenges(
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  preset TEXT NOT NULL,
  version TEXT NOT NULL,
  spec TEXT NOT NULL,
  spec_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  UNIQUE(author_id,preset,version,spec_hash)
);
CREATE INDEX IF NOT EXISTS challenges_recent ON challenges(status,created_at DESC);
CREATE INDEX IF NOT EXISTS challenges_author ON challenges(author_id,created_at);
CREATE TABLE IF NOT EXISTS challenge_attempts(
  session_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  recorded_at INTEGER
);
CREATE INDEX IF NOT EXISTS challenge_attempts_account ON challenge_attempts(account_id,created_at);
CREATE TABLE IF NOT EXISTS challenge_results(
  challenge_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  depth INTEGER NOT NULL,
  score REAL NOT NULL,
  ticks INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(challenge_id,account_id)
);
CREATE INDEX IF NOT EXISTS challenge_results_board ON challenge_results(challenge_id,score DESC,created_at);
