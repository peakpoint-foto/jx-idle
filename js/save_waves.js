"use strict";
// Khung migration nhỏ (1.4): các wave migration có version, áp dụng theo thứ tự
// tăng dần, idempotent (chạy lại không đổi gì), mỗi wave chạm một vùng extensions
// duy nhất. Dùng cho dữ liệu mở rộng của tính năng (khác migrateCore trong save.js
// vốn xử lý toàn bộ save cũ). Được gọi từ migrateSaveSchema — save mới lẫn save
// cũ nhiều version đều đi qua đây nên không mất dữ liệu.
const SAVE_WAVES = [];
function registerSaveWave(version, id, up) {
  if (!Number.isInteger(version) || version < 1) throw new Error("Wave version không hợp lệ: " + version);
  if (typeof id !== "string" || !id) throw new Error("Wave id không hợp lệ");
  if (SAVE_WAVES.some(w => w.version === version)) throw new Error("Trùng wave version: " + version);
  if (SAVE_WAVES.some(w => w.id === id)) throw new Error("Trùng wave id: " + id);
  if (typeof up !== "function") throw new Error("Wave thiếu hàm up: " + id);
  SAVE_WAVES.push({version, id, up});
}
function saveWaveVersion(ext) {
  return ext && Number.isInteger(ext.wv) && ext.wv >= 0 ? ext.wv : 0;
}
function runSaveWaves(state) {
  if (!state || typeof state !== "object") throw new Error("runSaveWaves cần state object");
  const ext = state.extensions && typeof state.extensions === "object" && !Array.isArray(state.extensions)
    ? state.extensions : (state.extensions = {});
  const cur = saveWaveVersion(ext);
  const pending = SAVE_WAVES.filter(w => w.version > cur).sort((a, b) => a.version - b.version);
  for (const w of pending) {
    w.up(state); // up chỉ được chạm vùng extensions của wave mình
    ext.wv = w.version;
  }
  return state;
}
const utcDayIndex = (now = Date.now()) => Math.floor(now / 864e5);

// Wave 1: codex theo đợt — mở khóa đợt nội dung bách khoa.
registerSaveWave(1, "codex_waves", state => {
  const ext = state.extensions;
  ext.codex = ext.codex && typeof ext.codex === "object" ? ext.codex : {};
  if (!Array.isArray(ext.codex.unlocked)) ext.codex.unlocked = [1];
});
// Wave 2: mục tiêu 7 ngày cho người mới — khởi tạo mốc bắt đầu.
registerSaveWave(2, "onboarding_goals", state => {
  const ext = state.extensions;
  if (!ext.goals7 || typeof ext.goals7 !== "object") ext.goals7 = {start: utcDayIndex(), done: {}};
  if (!ext.goals7.done || typeof ext.goals7.done !== "object") ext.goals7.done = {};
});
