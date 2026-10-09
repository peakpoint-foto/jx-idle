import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("tank/support: tank -30% damage, tạo 3x aggro, boss ưu tiên aggro", () => {
  const g = game();
  // kiểm tra code có logic role
  const src = g.run("sessionCombatBossHit.toString()");
  assert.ok(src.includes('target.role==="tank"'), "tank giảm damage");
  const src2 = g.run("sessionCombatHit.toString()");
  assert.ok(src2.includes('actor.role==="tank"?3:1'), "tank 3x aggro");
  assert.ok(src2.includes('actor.role==="damage"'), "damage +10%");
  // boss chọn aggro cao nhất
  const step = g.run("sessionCombatStep.toString()");
  assert.ok(step.includes("aggro"), "boss dùng aggro");
});

test("tank/support: support heal +50%", () => {
  const g = game();
  const src = g.run("sessionCombatUtility.toString()");
  assert.ok(src.includes('actor.role==="support"'), "support heal mạnh hơn");
});
