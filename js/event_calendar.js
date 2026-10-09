"use strict";
// Lịch sự kiện (1.3): bảng lịch theo tuần đọc từ content JSON (data/content/events.v*.json).
// Mặc định tắt (flag event_calendar). Sự kiện ngoài lịch không chạy: worker từ chối
// bằng eventScheduled ở sessions.js (mã lỗi event_not_scheduled).
// Chỉ số tuần UTC và mốc tuần dùng đúng công thức của trialWeekId/trialWeekStart.
function eventWeekIndex(now) { return Math.floor((Math.floor(now / 864e5) + 3) / 7); }
function eventWeekStart(id) { return (id * 7 - 3) * 864e5; }
// Giờ VN (UTC+7) cho hiển thị, cùng cách đọc với trialTime.
function eventDayVN(ms) { const d = new Date(ms + 7 * 3600e3), p = n => String(n).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`; }
// HTML tách riêng để test được mà không cần render đầy đủ.
function eventCalendarHTML(now) {
  if (!featureEnabled("event_calendar")) return "";
  now = now == null ? Date.now() : now;
  const week = eventWeekIndex(now), start = eventWeekStart(week);
  const evs = eventsForWeek(JX_CONTENT.events, week);
  const rows = evs.map(s => {
    const lim = s.limits ? Object.entries(s.limits).map(([k, v]) => `${v} lượt/${k === "perDay" ? "ngày" : "tuần"}`).join(", ") : "";
    return `<div class="qrow"><span><b>${esc(s.name)}</b> <small class="dim">${esc(s.mode.toUpperCase())}${lim ? " · " + esc(lim) : ""}</small></span></div>`;
  }).join("");
  return `<section class="card" id="eventCalendarCard"><h4>Lịch sự kiện tuần</h4>` +
    `<small class="dim">Tuần ${eventDayVN(start)} → ${eventDayVN(start + 7 * 864e5)} (giờ VN). Sự kiện ngoài lịch không mở.</small>` +
    (rows || '<p class="dim">Tuần này không có sự kiện.</p>') + `</section>`;
}
function eventCalendarRender() {
  const host = document.getElementById("t-more");
  if (!host) return;
  host.querySelector("#eventCalendarCard")?.remove();
  const html = eventCalendarHTML();
  if (html) host.insertAdjacentHTML("afterbegin", html);
}
{
  // Theo pattern renderMore của các panel khác (feedback, expedition...).
  const original = typeof renderMore === "function" ? renderMore : null;
  if (original) renderMore = function () { const v = original.apply(this, arguments); eventCalendarRender(); return v; };
  else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", eventCalendarRender);
}
