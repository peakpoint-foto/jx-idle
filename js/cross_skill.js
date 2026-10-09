"use strict";
// 3.5: Võ học tạp — học 1 skill ngoại phái tối đa cấp 5, tốn chi phí lớn.
// Không nhận bonus hệ của phái mình (seriesLv).
const CROSS_SKILL_COST = 1000000; // 1M vàng
const CROSS_SKILL_MAX = 5;

function crossSkill() {
  return (S.rw && S.rw.crossSkill) || null;
}
function crossSkillLearn(skillId) {
  const s = SK[skillId];
  if (!s || !isAttack(s)) return {ok: false, msg: "Chỉ học được chiêu tấn công"};
  const fac = FAC[S.fac];
  if (fac && fac.skills.includes(skillId)) return {ok: false, msg: "Đã là skill bổn phái"};
  if (crossSkill()) return {ok: false, msg: "Chỉ học được 1 skill ngoại phái"};
  if (S.gold < CROSS_SKILL_COST) return {ok: false, msg: `Cần ${fmt(CROSS_SKILL_COST)} vàng`};
  if (S.lvl < 100) return {ok: false, msg: "Cần cấp 100"};
  S.gold -= CROSS_SKILL_COST;
  S.rw.crossSkill = {id: skillId, level: 1};
  S.sk[skillId] = 1;
  save(); recalc();
  return {ok: true, msg: `Đã học ${s.n} (ngoại phái)`};
}
function crossSkillUpgrade() {
  const c = crossSkill();
  if (!c) return {ok: false, msg: "Chưa học skill ngoại phái"};
  if (c.level >= CROSS_SKILL_MAX) return {ok: false, msg: "Đã max cấp 5"};
  const cost = CROSS_SKILL_COST * c.level;
  if (S.gold < cost) return {ok: false, msg: `Cần ${fmt(cost)} vàng`};
  if (S.skPts < 5) return {ok: false, msg: "Cần 5 điểm kỹ năng"};
  S.gold -= cost; S.skPts -= 5;
  c.level++; S.sk[c.id] = c.level;
  save(); recalc();
  return {ok: true, msg: `Lên cấp ${c.level}`};
}
// Level thực tế: không nhận seriesLv của phái mình.
function crossSkillLv(id) {
  const c = crossSkill();
  if (!c || c.id !== id) return null;
  const P = R.P;
  if (!P) return c.level;
  const s = SK[id];
  const bonus = (P.plusSkill || 0) + (P.skAdd && P.skAdd[id] || 0);
  // KHÔNG cộng seriesLv[s.series]
  return c.level + Math.min(2, bonus);
}
