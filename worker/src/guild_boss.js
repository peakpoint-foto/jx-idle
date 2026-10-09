// 2.7: Boss bang async theo tuần — server mô phỏng session thật (tái dùng hạ tầng
// session như G04), damage ghi qua khung idempotent/boss_receipts có sẵn.
import {GAME} from '../gen/game.js';

export const GUILD_BOSS_RULES = Object.freeze({
  attemptsPerDay: 3,          // giữ nguyên giới hạn hiện tại
  hpPerMember: 15000,         // boss_max_hp = hpPerMember × số thành viên
  milestones: [0.25, 0.5, 0.75, 1], // mốc thưởng chung theo % HP đã mất
});

// Tuần dùng chung với guild.week (số tuần từ epoch, khớp weekKey trong social.js).
export function guildBossWeekId(now) {
  return Math.floor(now / (7 * 864e5));
}

export function guildBossSeed(weekId) {
  let h = 2166136261;
  for (const c of `guildboss-v1:${weekId}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Mô phỏng 1 lượt đánh từ snapshot đã verify. Trả về damage (số nguyên >= 1).
// Deterministic theo (weekId, snapshot) — cùng build đánh cùng tuần cho cùng damage.
export function simulateGuildBossAttack(snapshot, weekId) {
  const previous = GAME.getS();
  let actor;
  try {
    const s = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    GAME.setS(s);
    actor = GAME.sessionActor('gb:' + (s.cid || 'x'), s.name || 'Hero', GAME.calc(), 'damage');
  } finally {
    GAME.setS(previous);
  }
  const seed = guildBossSeed(weekId);
  let state = GAME.sessionCombatNew('ctc', [actor], seed, 'guildboss', {week: weekId});
  let guard = 0;
  while (state.status === 'active' && guard++ < 2000) {
    state = GAME.sessionCombatStep(state, [], [actor.id]);
  }
  const dmg = state.actors[0] && state.actors[0].contribution ? state.actors[0].contribution.damage : 0;
  return Math.max(1, Math.round(dmg));
}

// Mốc đã đạt từ % HP đã mất.
export function guildBossMilestones(hp, maxHp) {
  const lost = maxHp > 0 ? 1 - hp / maxHp : 1;
  return GUILD_BOSS_RULES.milestones.filter(m => lost >= m);
}
