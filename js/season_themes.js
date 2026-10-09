"use strict";
// 2.8: Mùa theo chủ đề 6-8 tuần — chủ đề + modifier toàn cục nhẹ từ JSON.
// Modifier nhỏ (tối đa +25%), áp dụng đồng đều cho mọi người nên công bằng.
function seasonThemeData() {
  return (typeof JX_CONTENT !== "undefined" && JX_CONTENT.seasonThemes) || null;
}
// Chỉ số mùa chủ đề từ tuần (0-based từ epoch).
function seasonThemeIndex(weekIdx, now) {
  const d = seasonThemeData();
  if (!d) return -1;
  const w = typeof weekIdx === "number" ? weekIdx : Math.floor((now || Date.now()) / (7 * 864e5));
  const season = Math.floor((w - (d.epochWeek || 0)) / d.seasonWeeks);
  return ((season % d.themes.length) + d.themes.length) % d.themes.length;
}
function seasonTheme(weekIdx, now) {
  const d = seasonThemeData(), i = seasonThemeIndex(weekIdx, now);
  return d && i >= 0 ? d.themes[i] : null;
}
// Hệ số modifier ('exp' | 'gold' | 'drop'). Mặc định 1 khi không có theme.
function seasonThemeMul(kind, weekIdx, now) {
  const t = seasonTheme(weekIdx, now);
  const v = t && t.modifiers && t.modifiers[kind];
  return typeof v === "number" && v >= 1 && v <= 1.25 ? v : 1;
}
// Thông tin mùa hiện tại cho UI.
function seasonThemeInfo(now) {
  const d = seasonThemeData();
  if (!d) return null;
  const w = Math.floor((now || Date.now()) / (7 * 864e5));
  const season = Math.floor((w - (d.epochWeek || 0)) / d.seasonWeeks);
  const t = d.themes[seasonThemeIndex(w)];
  const startW = (d.epochWeek || 0) + season * d.seasonWeeks;
  return {theme: t, season, weekStart: startW, weekEnd: startW + d.seasonWeeks - 1,
    weeksLeft: startW + d.seasonWeeks - w};
}
