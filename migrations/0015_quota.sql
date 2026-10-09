-- 0.3 DEPTH_ROADMAP: sổ lượt (quota) nguyên tử dùng chung cho mọi tính năng online.
-- Một lượt được trừ bằng một câu INSERT...SELECT duy nhất (xem worker/src/quota.js).
CREATE TABLE IF NOT EXISTS quota_claims(
  account_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  period TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,scope,period,idem_key));
CREATE INDEX IF NOT EXISTS quota_claims_lookup ON quota_claims(account_id,scope,period);
