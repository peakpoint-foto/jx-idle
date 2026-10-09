"use strict";
// Mục tiêu 7 ngày cho người mới (1.4): checklist 7 ngày đầu, không thưởng
// (tránh ảnh hưởng cân bằng). State trong extensions.goals7 do migration wave 2
// khởi tạo — save mới lẫn save cũ đều có. Mặc định tắt (flag onboarding_goals).
const GOALS_7 = [
  {day: 1, id: "lv10", name: "Chạm cấp 10", hint: "Đánh quái, làm nhiệm vụ để lên cấp.", check: s => s.lvl >= 10},
  {day: 2, id: "gear4", name: "Mặc 4 món trang bị", hint: "Nhặt đồ rơi và mặc vào các ô.", check: s => Object.values(s.eq || {}).filter(Boolean).length >= 4},
  {day: 3, id: "skills2", name: "Học 2 võ công", hint: "Thẻ Võ công: dùng điểm kỹ năng để học chiêu.", check: s => Object.keys(s.sk || {}).length >= 2},
  {day: 4, id: "stage5", name: "Vượt đến ải 5", hint: "Đẩy ải ở màn hình chính.", check: s => s.stage >= 5},
  {day: 5, id: "kills100", name: "Hạ 100 quái", hint: "Treo máy cũng tính.", check: s => (s.rw && s.rw.stat && s.rw.stat.kills | 0) >= 100},
  {day: 6, id: "boss1", name: "Hạ 1 trùm", hint: "Trùm xuất hiện ở cuối mỗi ải.", check: s => (s.rw && s.rw.stat && s.rw.stat.bosses | 0) >= 1},
  {day: 7, id: "lv30", name: "Chạm cấp 30", hint: "Cột mốc đầu tiên của hành trình.", check: s => s.lvl >= 30},
];
function goals7State() {
  const ext = typeof S !== "undefined" && S && S.extensions;
  return ext && ext.goals7 && typeof ext.goals7 === "object" ? ext.goals7 : null;
}
// Trả danh sách mục tiêu kèm trạng thái; now truyền vào để test được.
// Hoàn thành được ghi nhận lazy (đánh dấu dirty để lưu lại).
function goals7List(now) {
  const st = goals7State();
  if (!st || typeof S === "undefined" || !S || !S.fac) return [];
  now = now == null ? Date.now() : now;
  const dayIdx = Math.floor(now / 864e5);
  const start = Number.isInteger(st.start) ? st.start : dayIdx;
  const today = dayIdx - start + 1;
  if (!st.done || typeof st.done !== "object") st.done = {};
  return GOALS_7.map(gd => {
    let done = !!st.done[gd.id], just = false;
    if (!done && today >= gd.day) {
      let ok = false;
      try { ok = !!gd.check(S); } catch (e) { ok = false; }
      if (ok) { done = true; just = true; st.done[gd.id] = dayIdx; R.dirty = true; }
    }
    return {id: gd.id, day: gd.day, name: gd.name, hint: gd.hint, available: today >= gd.day, done, just, today};
  });
}
function goals7HTML(now) {
  if (!featureEnabled("onboarding_goals")) return "";
  const list = goals7List(now);
  if (!list.length) return "";
  const done = list.filter(x => x.done).length;
  const rows = list.map(g => {
    const icon = g.done ? "✔" : g.available ? "○" : "🔒";
    const sub = g.done ? "" : g.available ? `<br><small class="dim">${esc(g.hint)}</small>` : `<br><small class="dim">Mở ngày ${g.day}</small>`;
    return `<div class="qrow"><span>${icon} <b>Ngày ${g.day}: ${esc(g.name)}</b>${sub}</span></div>`;
  }).join("");
  return `<section class="card" id="goals7Card"><h4>Mục tiêu 7 ngày <small class="dim">${done}/7</small></h4>${rows}</section>`;
}
function goals7Render() {
  const host = document.getElementById("t-more");
  if (!host) return;
  host.querySelector("#goals7Card")?.remove();
  const html = goals7HTML();
  if (html) host.insertAdjacentHTML("afterbegin", html);
}
{
  const original = typeof renderMore === "function" ? renderMore : null;
  if (original) renderMore = function () { const v = original.apply(this, arguments); goals7Render(); return v; };
}
