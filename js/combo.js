"use strict";
// 2.14: Nối chiêu combo — dùng skill A mở cửa sổ 2s;
// dùng skill B (được A bổ trợ qua skillSupportLinks) trong cửa sổ được +25% sát thương.
const COMBO_WINDOW = 2, COMBO_BONUS = 0.25;
function comboState() {
  R.combo = R.combo || {from: 0, targets: [], until: 0};
  return R.combo;
}
// Gọi khi dùng skill. Trả về {bonus} nếu kích hoạt combo.
function comboOnSkill(skillId) {
  const now = R.tFight || 0, c = comboState();
  let bonus = 0;
  // kiểm tra combo: skill hiện tại có trong targets của cửa sổ đang mở?
  if (c.until > now && c.targets.includes(skillId)) {
    bonus = COMBO_BONUS;
    if (typeof addText === "function" && typeof H !== "undefined")
      addText(H.x, H.y - 50, "COMBO +" + Math.round(COMBO_BONUS * 100) + "%", "#ffe14a", 13);
  }
  // mở cửa sổ mới từ skill vừa dùng
  let targets = [];
  if (typeof skillSupportLinks === "function") {
    try {
      targets = skillSupportLinks(skillId, 1, typeof S !== "undefined" ? S : null)
        .filter(l => l.active).map(l => l.target);
    } catch (e) {}
  }
  c.from = skillId; c.targets = targets; c.until = targets.length ? now + COMBO_WINDOW : 0;
  return {bonus};
}
function comboActive() {
  const c = comboState(), now = R.tFight || 0;
  return c.until > now ? c : null;
}
