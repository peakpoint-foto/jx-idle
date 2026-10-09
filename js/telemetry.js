"use strict";
/* Telemetry ẩn danh tối thiểu — mục 0.4 của DEPTH_ROADMAP.
   Nguyên tắc: KHÔNG định danh bền, KHÔNG PII. Client tự tính cohort
   (tuần cài đặt, số ngày đã hoạt động) và chỉ gửi bucket tổng hợp lên server.
   Mặc định BẬT (đề xuất, cần duyệt theo tài liệu), tắt được trong Cài đặt;
   thông báo một lần sau cập nhật nêu rõ 3 loại dữ liệu thu thập. */
const TELE_OPT_KEY = "jxidle_tele_opt";      // "0" = tắt; vắng mặt = bật
const TELE_META_KEY = "jxidle_tele_meta";     // {iw: "2026-W41", days: n, last: "2026-10-09"}
const TELE_Q_KEY = "jxidle_tele_q";           // hàng đợi sự kiện chưa gửi
const TELE_NOTICE_KEY = "jxidle_tele_notice_v1";
const TELE_MAX_Q = 200, TELE_BATCH = 50;

// Bucket tuần ISO "YYYY-Www" — dùng cho cohort install_week.
function teleWeekBucket(ts) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7; // Thứ 2 = 0
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const firstThu = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((thu - firstThu) / (7 * 864e5));
  return thu.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
function teleDayKey(ts) {
  const d = new Date(ts);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
// Bucket số ngày hoạt động — đủ để tính D7/D30 mà không cần nối hành vi.
function teleActiveDaysBucket(n) {
  n = Math.max(0, n | 0);
  if (n <= 1) return "1";
  if (n <= 6) return "2-6";
  if (n <= 13) return "7-13";
  if (n <= 29) return "14-29";
  return "30+";
}
function teleSessionBucket(sec) {
  sec = Math.max(0, +sec || 0);
  if (sec < 300) return "<5m";
  if (sec < 900) return "5-15m";
  if (sec < 3600) return "15-60m";
  return "60m+";
}
function teleGoldBucket(gold) {
  gold = Math.max(0, +gold || 0);
  if (gold < 1e3) return "<1k";
  if (gold < 1e4) return "1k-10k";
  if (gold < 1e5) return "10k-100k";
  if (gold < 1e6) return "100k-1M";
  return "1M+";
}

// Danh mục sự kiện cho phép + kiểm tra giá trị (không chuỗi tự do, không PII).
const TELE_FEATURES = ["build_advice", "trial", "event_calendar", "codex", "goals_7d", "gold_sink", "story", "rift", "lab", "boss", "season", "other"];
const TELE_SINKS = ["reroll_affix", "stash_expand", "loadout_fee"];
const TELE_FACTIONS = ["shaolin", "wudang", "emei", "tangmen", "kunlun", "cuiyan", "tianwang", "wudu", "tianren", "xiaoyao"];
const TELE_EVENTS = {
  active_day: v => v && (v.weekend === 0 || v.weekend === 1),
  session_length: v => ["<5m", "5-15m", "15-60m", "60m+"].includes(v),
  feature_used: v => TELE_FEATURES.includes(v),
  report_detail_opened: v => v == null,
  advisor_suggestion_applied: v => ["gear", "skill", "attrs"].includes(v),
  trial_started: v => typeof v === "string" && /^[a-z0-9_]{1,24}$/.test(v),
  gold_sink_spent: v => v && TELE_SINKS.includes(v.sink) && typeof v.amount === "string",
  gold_total: v => ["<1k", "1k-10k", "10k-100k", "100k-1M", "1M+"].includes(v),
  story_read: v => TELE_FACTIONS.includes(v),
};

function teleMeta() {
  let m = null;
  try { m = JSON.parse(localStorage.getItem(TELE_META_KEY) || "null"); } catch (e) { m = null; }
  if (!m || typeof m !== "object") {
    m = { iw: teleWeekBucket(Date.now()), days: 0, last: "" };
    try { localStorage.setItem(TELE_META_KEY, JSON.stringify(m)); } catch (e) {}
  }
  return m;
}
function teleSaveMeta(m) {
  try { localStorage.setItem(TELE_META_KEY, JSON.stringify(m)); } catch (e) {}
}
function teleIsEnabled() {
  try { return localStorage.getItem(TELE_OPT_KEY) !== "0"; } catch (e) { return true; }
}
function teleSetEnabled(on) {
  try {
    if (on) localStorage.removeItem(TELE_OPT_KEY);
    else localStorage.setItem(TELE_OPT_KEY, "0");
  } catch (e) {}
}
function teleReadQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(TELE_Q_KEY) || "[]");
    return Array.isArray(q) ? q.filter(e => e && TELE_EVENTS[e.e]) : [];
  } catch (e) { return []; }
}
function teleWriteQueue(q) {
  try { localStorage.setItem(TELE_Q_KEY, JSON.stringify(q.slice(-TELE_MAX_Q))); } catch (e) {}
}
// Ghi nhận một sự kiện (đã kiểm tra tên + giá trị). Không ném lỗi ra ngoài.
function teleTrack(event, value) {
  try {
    if (!teleIsEnabled()) return false;
    const check = TELE_EVENTS[event];
    if (!check || !check(value === undefined ? null : value)) return false;
    const m = teleMeta();
    const q = teleReadQueue();
    q.push({
      e: event,
      v: value === undefined ? null : value,
      iw: m.iw,
      ad: teleActiveDaysBucket(m.days),
      mode: (typeof S !== "undefined" && S && S.mode) || "",
      at: Date.now(),
    });
    teleWriteQueue(q);
    teleScheduleFlush();
    return true;
  } catch (e) { return false; }
}
let teleFlushT = 0, teleFlushing = false;
function teleScheduleFlush() {
  if (teleFlushT || teleFlushing) return;
  teleFlushT = setTimeout(() => { teleFlushT = 0; teleFlush(); }, 5000);
}
async function teleFlush() {
  if (teleFlushing || !teleIsEnabled()) return;
  const q = teleReadQueue();
  if (!q.length) return;
  let base = "";
  try { base = (typeof onlBase === "function" ? onlBase() : ""); } catch (e) {}
  if (!base) return; // chưa có cấu hình API (dev tĩnh) — giữ hàng đợi
  teleFlushing = true;
  try {
    const batch = q.slice(0, TELE_BATCH);
    const r = await fetch(base + "/telemetry", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
    if (r.ok) teleWriteQueue(q.slice(batch.length));
  } catch (e) { /* offline — giữ hàng đợi, thử lại lần sau */ }
  teleFlushing = false;
  if (teleReadQueue().length) teleScheduleFlush();
}
// Đánh dấu ngày hoạt động (mỗi ngày UTC một lần) + gửi active_day.
function teleActiveDayTick() {
  const m = teleMeta(), today = teleDayKey(Date.now());
  if (m.last === today) return;
  m.last = today;
  m.days = (m.days | 0) + 1;
  teleSaveMeta(m);
  const d = new Date(Date.now()), wd = d.getUTCDay();
  teleTrack("active_day", { weekend: (wd === 0 || wd === 6) ? 1 : 0 });
}
let teleSessionStart = 0;
function teleSessionBegin() { teleSessionStart = Date.now(); }
function teleSessionEnd() {
  if (!teleSessionStart) return;
  teleTrack("session_length", teleSessionBucket((Date.now() - teleSessionStart) / 1e3));
  teleSessionStart = 0;
}
// Thông báo một lần sau cập nhật: nêu rõ 3 loại dữ liệu + nút tắt ngay.
function teleMaybeNotice() {
  try {
    if (localStorage.getItem(TELE_NOTICE_KEY)) return;
    localStorage.setItem(TELE_NOTICE_KEY, "1");
  } catch (e) { return; }
  if (typeof modal !== "function") return;
  modal(`<h3>Thu thập dữ liệu ẩn danh</h3>
  <p class="desc">Để cải thiện game, bản này thu thập <b>dữ liệu ẩn danh</b> ở mức tối thiểu:</p>
  <div class="card"><p class="desc" style="margin:0">1. Ngày bạn mở game (tính theo tuần, không định danh)<br>
  2. Tính năng bạn mở/dùng<br>
  3. Thời gian treo máy theo khoảng (ví dụ &lt;5 phút, 5–15 phút…)</p></div>
  <p class="desc"><b>Không</b> thu thập tên, liên hệ, nội dung save hay bất cứ thông tin cá nhân nào.
  Chi tiết xem <b>Chính sách dữ liệu</b> trong game. Bạn có thể tắt bất cứ lúc nào ở Cài đặt.</p>
  <div class="btnrow"><button class="btn" id="teleOk">Đã hiểu</button><button class="btn" id="teleOff">Tắt thu thập</button></div>`, () => {
    document.querySelector("#teleOk").onclick = () => closeModal();
    document.querySelector("#teleOff").onclick = () => { teleSetEnabled(false); closeModal(); if (typeof toast === "function") toast("Đã tắt thu thập dữ liệu"); };
  });
}
function teleSettingsRow() {
  const on = teleIsEnabled();
  return `<div class="row"><span>Thu thập dữ liệu ẩn danh <small class="dim">(ngày chơi, tính năng dùng, giờ treo máy — không PII)</small></span>
  <button class="btn" id="teleTog">${on ? "Đang bật" : "Đang tắt"}</button></div>`;
}
function teleBindSettings() {
  const b = document.querySelector("#teleTog");
  if (b) b.onclick = () => { teleSetEnabled(!teleIsEnabled()); b.textContent = teleIsEnabled() ? "Đang bật" : "Đang tắt"; };
}
let teleHooked = false;
function teleHookRenderMore() {
  if (teleHooked || typeof renderMore !== "function") return;
  teleHooked = true;
  const _rm = renderMore;
  renderMore = function () { _rm.apply(this, arguments); try { teleBindSettings(); } catch (e) {} };
}
// Khởi động: gọi một lần trong init().
function teleBoot() {
  teleHookRenderMore();
  teleSessionBegin();
  teleActiveDayTick();
  teleMaybeNotice();
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => { if (document.hidden) { teleFlush(); } });
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pagehide", () => { teleSessionEnd(); });
  }
}
