import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';
import {GUILD_BOSS_RULES, guildBossWeekId, guildBossSeed, simulateGuildBossAttack, guildBossMilestones} from '../src/guild_boss.js';

function snapshot() {
  const s = GAME.newSave();
  Object.assign(s, {cid: 'c_gb_test', fac: 'shaolin', mode: 'ctc', lvl: 60,
    attrPts: 295, skPts: 58, main: 10, sk: {10: 5}});
  const prev = GAME.getS();
  GAME.setS(s);
  try {
    // trang bị đơn giản để calc() có stats
    for (const [d, k, slot] of [[0, 0, 'weapon'], [2, 0, 'armor']]) {
      const it = GAME.makeItem(d, k, 5, 2);
      if (it) s.eq[slot] = it;
    }
  } finally { GAME.setS(prev); }
  return JSON.stringify(s);
}

test('guild boss: damage từ session sim thật, deterministic', () => {
  const snap = snapshot(), week = guildBossWeekId(Date.now());
  const d1 = simulateGuildBossAttack(snap, week);
  const d2 = simulateGuildBossAttack(snap, week);
  assert.ok(d1 >= 1, 'damage >= 1, got ' + d1);
  assert.equal(d1, d2, 'cùng build + tuần → cùng damage');
  const d3 = simulateGuildBossAttack(snap, week + 1);
  // tuần khác có thể khác (boss series xoay), nhưng vẫn >= 1
  assert.ok(d3 >= 1);
});

test('guild boss: seed và milestone', () => {
  assert.equal(guildBossSeed(100), guildBossSeed(100));
  assert.notEqual(guildBossSeed(100), guildBossSeed(101));
  assert.deepEqual(guildBossMilestones(7500, 10000), [0.25]);
  assert.deepEqual(guildBossMilestones(0, 10000), [0.25, 0.5, 0.75, 1]);
  assert.deepEqual(guildBossMilestones(10000, 10000), []);
});

test('guild boss: activity guildboss hợp lệ trong engine', () => {
  const prev = GAME.getS();
  GAME.setS(JSON.parse(snapshot()));
  const actor = GAME.sessionActor('x', 'H', GAME.calc(), 'damage');
  GAME.setS(prev);
  const s = GAME.sessionCombatNew('ctc', [actor], guildBossSeed(99), 'guildboss', {week: 99});
  assert.equal(s.activity, 'guildboss');
  assert.equal(s.status, 'active');
});
