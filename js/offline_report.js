"use strict";
// Báo cáo treo máy chi tiết (2.5): highlight món hiếm nhất, tiến độ lên cấp,
// thời gian hiệu quả so với trần, lý do delta = 0, lịch sử 7 lần gần nhất.
function offlineZeroReason() {
  if (typeof S === "undefined" || !S || !S.fac) return "";
  const now = typeof idleNowMs === "function" ? idleNowMs() : Date.now();
  const raw = (now - S.last) / 1e3;
  if (!(raw >= 60)) return "Vắng mặt dưới 60 giây — chưa đủ để tính treo máy.";
  if (S.lvl >= MAX_LEVEL) return "Đã đạt cấp tối đa — không nhận thêm kinh nghiệm.";
  const d = S.offDay;
  if (d && now - d.t0 < 864e5 && d.secs >= OFFLINE_DAY_MAX) return "Đã hết quota treo máy hôm nay (12 giờ).";
  return "Không hạ được quái nào trong thời gian vắng mặt (sát thương quá thấp).";
}
// Làm giàu báo cáo từ offlineGains(): tiến độ lên cấp + thời gian hiệu quả.
function offlineEnrich(o) {
  if (!o) return null;
  const need = expNeed(S.lvl);
  o.nearLevel = {up: S.lvl - o.lv0, pct: S.lvl >= MAX_LEVEL ? 100 : Math.round(S.xp / need * 100)};
  o.eff = Math.min(o.secs, OFFLINE_FULL) + OFFLINE_TAIL * Math.max(0, o.secs - OFFLINE_FULL);
  return o;
}
function offlineHistoryPush(o) {
  if (!S.rw || typeof S.rw !== "object") S.rw = {};
  if (!Array.isArray(S.rw.offlineHist)) S.rw.offlineHist = [];
  S.rw.offlineHist.push({at: Date.now(), secs: Math.round(o.secs), kills: o.kills, xp: Math.round(o.xp),
    gold: Math.round(o.gold), lv0: o.lv0, lv1: o.lv1, got: o.got});
  S.rw.offlineHist = S.rw.offlineHist.slice(-7);
  R.dirty = true;
}
function offlineHistoryHTML() {
  const h = S.rw && S.rw.offlineHist;
  if (!h || !h.length) return "";
  const rows = h.slice().reverse().map(e => {
    const d = new Date(e.at);
    return `<div class="qrow"><span>${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", {hour: "2-digit", minute: "2-digit"})}</span><span class="dim">${fmt(e.xp)} exp · ${fmt(e.gold)} lượng · cấp ${e.lv0}→${e.lv1}</span></div>`;
  }).join("");
  return `<details class="card"><summary>Lịch sử treo máy (7 lần gần nhất)</summary>${rows}</details>`;
}
// W0-3: quota treo máy còn lại — cho người chơi thấy TRƯỚC khi hết.
// Thuần túy theo S.offDay (đã được offlineGains() cộng dồn sau mỗi lần tính).
function offlineQuotaLeft(now) {
  now = now == null ? Date.now() : now;
  const d = (typeof S !== "undefined" && S && S.offDay) || null;
  const sameDay = d && d.t0 <= now && now - d.t0 < 864e5;
  const used = sameDay ? Math.max(0, Math.floor(+d.secs) || 0) : 0;
  return {dayMax: OFFLINE_DAY_MAX, perMax: OFFLINE_MAX, used: used,
    left: Math.max(0, OFFLINE_DAY_MAX - used)};
}
const fmtQuotaDur = sec => { const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60);
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`; };
function offlineQuotaHTML() {
  const q = offlineQuotaLeft();
  const cls = q.left <= 0 ? "bad" : "";
  return `<span>Quota treo máy hôm nay còn</span><span class="${cls}">${fmtQuotaDur(q.left)} / ${fmtQuotaDur(q.dayMax)} (mỗi lần tối đa ${fmtQuotaDur(q.perMax)})</span>`;
}
// HTML chi tiết cho modal chào mừng trở lại.
function offlineDetailHTML(o) {
  const h = Math.floor(o.secs / 3600), m = Math.floor(o.secs % 3600 / 60);
  const rare = o.rarest ? `<div class="card"><b>Món hiếm nhất đã rơi</b><br><span style="color:${RAR_COL[o.rarest.r] || "#fff"}">${esc(o.rarest.n)}</span> <small class="dim">(${RAR_VI[o.rarest.r] || ""})</small></div>` : "";
  const lvl = o.nearLevel.up > 0
    ? `<span>Lên cấp</span><span>${o.lv0} → ${o.lv1} (+${o.nearLevel.up})</span>`
    : `<span>Tiến độ lên cấp</span><span>${o.nearLevel.pct}%</span>`;
  const eff = `<span>Thời gian hiệu quả</span><span>${Math.round(o.eff / 60)} / ${Math.round(o.secs / 60)} phút (trần ${OFFLINE_MAX / 3600}h)</span>`;
  return `<p class="desc">Vắng mặt ${h ? h + " giờ " : ""}${m} phút${o.capped ? " (vượt trần 8 giờ, chỉ tính 8 giờ)" : ""}, nhân vật vẫn luyện công tại ${esc(zoneOf(Math.min(S.stage, STAGES)).n)}.</p>
    <div class="card stats"><span>Quái bị hạ</span><span>${fmt(o.kills)}</span><span>Kinh nghiệm</span><span>${fmt(o.xp)}</span>
    <span>Ngân lượng</span><span>${fmt(o.gold)}</span>${lvl}
    <span>Vật phẩm</span><span>${o.got}${o.sold ? ` (+${o.sold} bán)` : ""}</span>
    <span>Rương tu luyện</span><span>${o.chests || 0} / 3 mốc (1 · 4 · 8 giờ)</span>${eff}${offlineQuotaHTML()}</div>
    ${rare}
    ${o.chests ? '<p class="desc">Quà các mốc đã vào túi — xem nhật ký Giang hồ.</p>' : ""}
    ${typeof weeklyReturnGuideHTML === "function" ? weeklyReturnGuideHTML() : ""}
    ${offlineHistoryHTML()}`;
}
