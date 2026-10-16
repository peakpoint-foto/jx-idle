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

test('world boss: sanity bound chặn power phi lý', async t => {
  const {bossHitPower, WB_POWER_SANE_MAX} = await import('../src/world_boss.js');
  const DB = await localD1(); t.after(() => DB.close());
  const now = Date.now();
  let bi = 0, nc = 0;
  const mkBoss = async (hp) => {
    const id = 'wb_sane_' + (++bi);
    await DB.prepare(`INSERT INTO world_boss(id,starts_at,ends_at,hp,max_hp) VALUES(?1,?2,?3,?4,?4)`)
      .bind(id, now - 1e3, now + 36e5, hp).run();
    return id;
  };
  const nn = () => 'sane-n' + (++nc);
  // power 1e15 (phi lý) -> chặn ở WB_POWER_SANE_MAX, damage = min(1e9/10, max_hp)
  const b1 = await mkBoss(1000000);
  const r1 = await worldBossHit(DB, b1, 'a9', {power: 1e15}, nn());
  assert.ok(r1.ok);
  assert.equal(r1.damage, Math.min(Math.floor(WB_POWER_SANE_MAX / 10), 1000000));
  assert.ok(bossHitPower(1e15) <= WB_POWER_SANE_MAX);
  // power âm / NaN -> damage tối thiểu 1
  const b2 = await mkBoss(1000000);
  const r2 = await worldBossHit(DB, b2, 'a9', {power: -500}, nn());
  assert.ok(r2.ok); assert.equal(r2.damage, 1);
  const b3 = await mkBoss(1000000);
  const r3 = await worldBossHit(DB, b3, 'a9', {power: NaN}, nn());
  assert.ok(r3.ok); assert.equal(r3.damage, 1);
  // power hợp lệ trong bound -> giữ nguyên công thức cũ
  const b4 = await mkBoss(1000000);
  const r4 = await worldBossHit(DB, b4, 'a9', {power: 123456}, nn());
  assert.equal(r4.damage, 12345);
});
