import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("chất phái: framework 3 cơ chế mẫu", () => {
  const g = game();
  g.run(`setFeatureFlags({faction_mechanics:true});`);
  const m1 = g.json(`facMechanic("shaolin").id`);
  assert.equal(m1, "lahan");
  const m2 = g.json(`facMechanic("tangmen").id`);
  assert.equal(m2, "amkhi");
  const m3 = g.json(`facMechanic("wudang").id`);
  assert.equal(m3, "thaicuc");
  const m4 = g.json(`facMechanic("emei")`);
  assert.equal(m4, null, "phái chưa có cơ chế -> null");
});

test("chất phái: flag tắt thì không có cơ chế", () => {
  const g = game();
  // flag mặc định tắt
  const m = g.json(`facMechanic("shaolin")`);
  assert.equal(m, null, "flag tắt -> null");
});

test("chất phái: shaolin giảm 20% damage khi HP < 30%", () => {
  const g = game();
  g.run(`setFeatureFlags({faction_mechanics:true});`);
  const mul = g.json(`FAC_MECHANICS.shaolin.onTakeDamage(null, 0.2)`);
  assert.equal(mul, 0.8, "HP 20% -> giảm 20%");
  const mul2 = g.json(`FAC_MECHANICS.shaolin.onTakeDamage(null, 0.5)`);
  assert.equal(mul2, 1, "HP 50% -> không giảm");
});
