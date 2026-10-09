import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {guildTechContribute, guildTechEffects, guildTechNodes} from '../src/guild_tech.js';

test('guild tech: đóng góp tích lũy, đủ cost lên cấp', async t => {
  const DB = await localD1(); t.after(() => DB.close());
  // đóng góp 60k cho exp_boost (cost 100k)
  let r = await guildTechContribute(DB, 'g1', 'a1', 'exp_boost', 60000, 1, 'n1');
  assert.ok(r.ok); assert.equal(r.level, 0); assert.equal(r.contributed, 60000);
  // đóng góp thêm 50k -> đủ 100k, lên cấp 1, dư 10k
  r = await guildTechContribute(DB, 'g1', 'a2', 'exp_boost', 50000, 1, 'n2');
  assert.ok(r.ok); assert.equal(r.level, 1); assert.equal(r.contributed, 10000);
  assert.ok(r.leveledUp);
  // effect: +2% exp
  const eff = await guildTechEffects(DB, 'g1', 1);
  assert.equal(eff.expPct, 2);
});

test('guild tech: cần mở node yêu cầu trước, idempotent', async t => {
  const DB = await localD1(); t.after(() => DB.close());
  // forge_discount cần exp_boost
  let r = await guildTechContribute(DB, 'g1', 'a1', 'forge_discount', 80000, 1, 'n1');
  assert.equal(r.ok, false, "chưa mở exp_boost");
  // mở exp_boost rồi đóng góp forge_discount
  await guildTechContribute(DB, 'g1', 'a1', 'exp_boost', 100000, 1, 'n2');
  r = await guildTechContribute(DB, 'g1', 'a1', 'forge_discount', 80000, 1, 'n3');
  assert.ok(r.ok); assert.equal(r.level, 1);
  // trùng nonce -> idempotent
  r = await guildTechContribute(DB, 'g1', 'a1', 'forge_discount', 80000, 1, 'n3');
  assert.ok(r.already, "trùng nonce");
});
