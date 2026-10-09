import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {worldBossHit, worldBossRewards, WB_MAX_HITS} from '../src/world_boss.js';

test('world boss: đánh trừ HP, giới hạn lượt', async t => {
  const DB = await localD1(); t.after(() => DB.close());
  const bossId = 'wb_test1', now = Date.now();
  await DB.prepare(`INSERT INTO world_boss(id,starts_at,ends_at,hp,max_hp) VALUES(?1,?2,?3,1000000,1000000)`)
    .bind(bossId, now - 1e3, now + 36e5).run();
  // đánh 1 lượt
  let nc = 0; const nn = () => 'n' + (++nc);
  const r1 = await worldBossHit(DB, bossId, 'a1', {power: 50000}, nn());
  assert.ok(r1.ok); assert.equal(r1.damage, 5000); assert.equal(r1.bossHp, 995000);
  // đánh đủ 5 lượt
  for (let i = 0; i < WB_MAX_HITS - 1; i++)
    await worldBossHit(DB, bossId, 'a1', {power: 50000}, nn());
  const r6 = await worldBossHit(DB, bossId, 'a1', {power: 50000}, nn());
  assert.equal(r6.ok, false, "hết lượt");
});

test('world boss: xếp hạng thưởng', async t => {
  const DB = await localD1(); t.after(() => DB.close());
  const bossId = 'wb_test2', now = Date.now();
  await DB.prepare(`INSERT INTO world_boss(id,starts_at,ends_at,hp,max_hp) VALUES(?1,?2,?3,1000000,1000000)`)
    .bind(bossId, now - 1e3, now + 36e5).run();
  await worldBossHit(DB, bossId, 'a1', {power: 100000}, 'm1');
  await worldBossHit(DB, bossId, 'a2', {power: 50000}, 'm2');
  const rewards = await worldBossRewards(DB, bossId);
  assert.equal(rewards[0].accountId, 'a1', "a1 hạng 1");
  assert.equal(rewards[0].reward, "1M vàng");
  assert.equal(rewards[1].reward, "500k vàng");
});
