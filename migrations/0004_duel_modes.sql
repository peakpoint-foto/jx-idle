-- Additive metadata; rows without metadata retain their original power-v1 rule.
CREATE TABLE IF NOT EXISTS duel_meta(duel_id TEXT PRIMARY KEY,kind TEXT NOT NULL,rules_version TEXT NOT NULL,combat_version TEXT NOT NULL,challenger_rev INTEGER NOT NULL,defender_rev INTEGER NOT NULL);
