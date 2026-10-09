-- 0014: Telemetry ẩn danh tối thiểu (mục 0.4 DEPTH_ROADMAP).
-- Không định danh bền: chỉ lưu cohort (install_week, active_days bucket) + bucket tổng hợp.
-- Dữ liệu giữ tối đa 90 ngày (worker tự purge mỗi lần ghi).
CREATE TABLE IF NOT EXISTS telemetry_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  event TEXT NOT NULL,
  install_week TEXT NOT NULL,
  active_days TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '',
  value TEXT
);
CREATE INDEX IF NOT EXISTS telemetry_event_at ON telemetry_events(event, at);
