import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

const DAY = 864e5, T0 = Date.UTC(2026, 9, 5);
function ready(lvl = 60) {
  const g = game();
  g.run(`fixture('g2',${lvl});S.fac='shaolin';S.sk={};S.main=0;autoSpendAttrs();autoSpendSkills();recalc();setFeatureFlags({training_lab:true,rift_tower:true})`);
  return g;
}

test("modifier tầng deterministic theo (ngày, tầng) và đọc từ JSON", () => {
  const g = ready();
  const a = g.json(`towerFloorModifiers(${Math.floor(T0 / DAY)},1)`);
  const b = g.json(`towerFloorModifiers(${Math.floor(T0 / DAY)},1)`);
  assert.deepEqual(a, b, "cùng ngày + tầng -> cùng modifier");
  assert.equal(a.length, 1, "tầng 1 có 1 modifier");
  assert.equal(g.json(`towerFloorModifiers(${Math.floor(T0 / DAY)},10)`).length, 2, "tầng 10 có 2 modifier");
  assert.equal(g.json(`towerFloorModifiers(${Math.floor(T0 / DAY)},25)`).length, 3, "tầng 25 có 3 modifier");
  const valid = g.json("JX_CONTENT.riftModifiers.modifiers.map(m=>m.id)");
  for (const id of [...a, ...b]) assert.ok(valid.includes(id), "id từ JSON: " + id);
  assert.notDeepEqual(a, g.json(`towerFloorModifiers(${Math.floor(T0 / DAY) + 1},1)`), "đổi ngày -> xoay modifier");
});

test("checkpoint mỗi 10 tầng; leo thắng tiến, thua quay về checkpoint", () => {
  const g = ready();
  assert.equal(g.run("towerCheckpoint(0)"), 0);
  assert.equal(g.run("towerCheckpoint(9)"), 0);
  assert.equal(g.run("towerCheckpoint(10)"), 10);
  assert.equal(g.run("towerCheckpoint(23)"), 20);
  // nhân vật mid cấp 60 qua được tầng 1
  const r1 = g.json("towerClimb()");
  assert.equal(r1.won, true, "tầng 1 thắng, DPS " + Math.round(r1.dps));
  assert.equal(g.json("S.extensions.riftTower.cleared"), 1);
  assert.equal(g.json("S.extensions.riftTower.best"), 1);
  assert.equal(g.json("S.extensions.riftTower.history.length"), 1);
  // thua ở tầng cao -> quay về checkpoint
  g.run("S.extensions.riftTower.cleared=23");
  // giả lập thua bằng cách leo tầng quá sức: dùng nhân vật yếu
  const weak = game();
  weak.run("fixture('g2',1);setFeatureFlags({training_lab:true,rift_tower:true});S.extensions.riftTower={day:0,cleared:23,best:23,history:[]}");
  const r = weak.json("towerClimb()");
  assert.equal(r.won, false, "cấp 1 không qua nổi tầng 24");
  assert.equal(weak.json("S.extensions.riftTower.cleared"), 20, "quay về checkpoint 20");
  assert.equal(weak.json("S.extensions.riftTower.best"), 23, "best giữ nguyên");
});

test("leo cùng seed cho cùng kết quả (không save-scum được)", () => {
  const mk = () => { const g = ready(); return g; };
  const g1 = mk(), g2 = mk();
  const r1 = g1.json("towerClimb()"), r2 = g2.json("towerClimb()");
  assert.deepEqual([r1.won, r1.floor, Math.round(r1.dps)], [r2.won, r2.floor, Math.round(r2.dps)]);
});

test("flag tắt thì tháp không mở", () => {
  const g = game();
  g.run("fixture('g2',60);setFeatureFlags({training_lab:true})");
  assert.equal(g.run("towerAllowed()"), false);
  assert.equal(g.run("towerPanelHTML()"), "");
  assert.throws(() => g.run("towerClimb()"), /chưa mở/);
});
