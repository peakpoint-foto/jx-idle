-- C08: frozen ranked-season standings and title receipts. Additive only; scores stay in duel_scores.
CREATE TABLE IF NOT EXISTS season_meta(
  season_idx INTEGER PRIMARY KEY,
  frozen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS season_final(
  season_idx INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  fac TEXT NOT NULL,
  bracket TEXT NOT NULL,
  points INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  placement INTEGER NOT NULL,
  group_size INTEGER NOT NULL,
  title TEXT NOT NULL,
  claimed_at INTEGER,
  PRIMARY KEY(season_idx,account_id)
);
CREATE INDEX IF NOT EXISTS season_final_group ON season_final(season_idx,fac,bracket,placement);
