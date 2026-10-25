-- 0014 (BẢN NHÁP Bước 2, CHƯA NỐI ensureSchema, CHƯA NỐI ROUTE, CHƯA MỞ THƯỞNG).
-- Bảng mốc thưởng chung thử thách cộng đồng (g2, nghĩa Phụ lục F v2.3) + snapshot kiểm định
-- + claim một lần. Ngưỡng mốc (required_total) KHÔNG seed ở đây: Bước 3 chốt số rồi mới
-- insert định nghĩa mốc; seed số minh họa trong migration sẽ là bịa số.
-- KHÔNG dùng cho thưởng mùa CTC bằng tài nguyên: thưởng CTC cần cổng riêng
-- (shared calc + validator mở rộng + D1 + claim runId do server cấp) — xem worker/src/season_snapshot.js.
CREATE TABLE IF NOT EXISTS season_milestones (
  milestone_id TEXT NOT NULL PRIMARY KEY,
  mode TEXT NOT NULL,
  required_total INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS season_milestone_snapshots (
  snapshot_id TEXT NOT NULL PRIMARY KEY,
  milestone_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  source TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  payload TEXT
);
CREATE TABLE IF NOT EXISTS season_milestone_claims (
  account_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  server_run_id TEXT NOT NULL UNIQUE,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, milestone_id)
);
CREATE INDEX IF NOT EXISTS season_milestone_claims_snapshot ON season_milestone_claims (snapshot_id);
