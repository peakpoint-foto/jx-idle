import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Phase 0: Hoa Sơn phái đã loại khỏi data (J.factions còn 10).
// Save cũ có fac="huashan" (mod tay / build rất cũ) phải load được và remap về Thiếu Lâm.

test("phase0: J.factions còn đúng 10 phái, không còn huashan", () => {
  const g = game();
  assert.equal(g.run("J.factions.length"), 10);
  assert.equal(g.run("J.factions.some(f=>f.key==='huashan')"), false);
  assert.deepEqual(g.json("J.factions.map(f=>f.id)"), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(g.run("FAC.huashan"), undefined);
});

test("phase0: không còn item req phái Hoa Sơn [39,10] trong sets.gold", () => {
  const g = game();
  const left = g.run("J.sets.gold.filter(r=>r.req&&r.req.some(p=>p[0]===39&&p[1]===10)).length");
  assert.equal(left, 0);
});

test("phase0: migrate save fac=huashan -> shaolin", () => {
  const g = game();
  g.run(`var s=migrate(Object.assign(newSave(),{fac:'huashan',sexSet:1,lvl:50}));`);
  assert.equal(g.run("s.fac"), "shaolin");
  assert.equal(g.run("s.lvl"), 50, "giữ nguyên cấp và dữ liệu khác");
});

test("phase0: migrate fac lạ khác (garbage) giữ hành vi cũ -> null", () => {
  const g = game();
  g.run(`var s=migrate(Object.assign(newSave(),{fac:'khongphai',sexSet:1}));`);
  assert.equal(g.run("s.fac"), null);
});

test("phase0: migrate fac hợp lệ không bị đụng", () => {
  const g = game();
  g.run(`var s=migrate(Object.assign(newSave(),{fac:'wudang',sexSet:1,lvl:77}));`);
  assert.equal(g.run("s.fac"), "wudang");
  assert.equal(g.run("s.lvl"), 77);
});

test("phase0: load() save huashan qua localStorage remap + toast", () => {
  const g = game();
  g.run(`var seen=[]; toast=(m)=>{seen.push(m)};var old=pack(Object.assign(newSave(),{fac:'huashan',sexSet:1}));localStorage.setItem(saveKey(),old);`);
  // pack ký đúng nên load() đi đường migrate thường
  g.run("load()");
  assert.equal(g.run("S.fac"), "shaolin");
  const msgs = g.json("seen");
  assert.ok(Array.isArray(msgs) && msgs.length === 1 && /Hoa Sơn/.test(msgs[0]), "toast thông báo 1 lần");
});
