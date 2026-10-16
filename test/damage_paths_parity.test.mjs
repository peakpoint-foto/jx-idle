import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { game } from "./helpers/game.mjs";

// W1-6 (G1-3): 3 damage path là THIẾT KẾ có chủ ý — test này KHÓA LẠI hành vi
// hiện tại của cả 3 path. Mọi thay đổi công thức/số đều phải làm test này đỏ
// và cần quyết định thiết kế mới trước khi sửa.

const src = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf-8");

test("W1-6: heroGuard chỉ chạy ở combat.js (thiết kế, không phải thiếu sót)", () => {
  assert.ok(src("combat.js").includes("heroGuard("), "combat.js dùng heroGuard");
  assert.ok(!src("session_combat.js").includes("heroGuard("), "session_combat.js KHÔNG dùng heroGuard");
  assert.ok(!src("survival.js").includes("heroGuard("), "survival.js KHÔNG dùng heroGuard");
});

test("W1-6: heroGuard — công thức giảm sát thương (combat chính)", () => {
  const g = game(42);
  g.run("fixture('ctc',60);S.fac='gaibang';R.life=1000;");
  // legDR 20% -> curseDR 10% -> flatDR 50 -> manaShield 30% (mana 200 chặn 200)
  g.run("R.P={legDR:20,curseDR:0.1,flatDR:50,manaShield:30};R.mana=200;");
  assert.equal(g.run("heroGuard(1000)"), 470); // 1000*.8*.9=720; 720-50=670; 670-200=470
  assert.equal(g.run("R.mana"), 0);
  // flatDR không đưa sát thương xuống dưới 1
  g.run("R.P={flatDR:5000};R.mana=0;");
  assert.equal(g.run("heroGuard(100)"), 1);
  // không có chỉ số giảm nào -> giữ nguyên
  g.run("R.P={};");
  assert.equal(g.run("heroGuard(100)"), 100);
});

test("W1-6: svHit — luôn trúng (KHÔNG hit-check, thiết kế sinh tồn) + công thức", () => {
  const g = game(42);
  g.run("fixture('ctc',60);SV.picks={};SV.pas={};");
  const sid = g.run("FAC.shaolin.starter");
  g.run(`SV.picks[${sid}]=3;`); // star 3 -> x1.6
  // crit:100 -> luôn crit (x2 phần phi-poison); poison không crit (N6)
  const a = { tot: 1000, crit: 100, parts: { phys: 800, poison: 200 } };
  // (800*2+200) * 1.6 * 1.0 * rnd(.9,1.1) — khóa giá trị exact với seed 42
  assert.equal(g.run(`svHit(${JSON.stringify(a)},${sid})`), 2924.513970181346);
  // Tính chất thiết kế: 50 đòn liên tiếp đều trúng, không bao giờ "trượt" vì chính xác
  assert.equal(
    g.run(`(()=>{const a={tot:500,crit:0,parts:{phys:500}};for(let i=0;i<50;i++){if(!(svHit(a,${sid})>0))return false}return true})()`),
    true
  );
});

const SC_SETUP = `
var actor={id:'me',role:'damage',mp:100,cooldown:0,contribution:{damage:0},
 p:{ar:1000,crit:100,curseDef:0,ignRes:{},series:0,series5:0,bossDmg:1,
  main:{id:'sk1',cost:10,rate:2,useAR:true,ignore:0,series:0,series5:0,parts:{phys:500}},
  basic:{id:'sk0',cost:0,rate:1,useAR:false,ignore:0,series:0,series5:0,parts:{phys:100}}}};
var state={rng:12345,tick:0,mode:'ctc',activity:'party',flags:{},events:[],
 boss:{hp:100000,def:100,series:1,res:{phys:10,poison:10,cold:10,fire:10,light:10},poison:0,ward:0}};
var hp0=state.boss.hp;
sessionCombatHit(state,actor);
var dealt=hp0-state.boss.hp;`;

test("W1-6: sessionCombatHit — deterministic theo seed + công thức (combat async)", () => {
  const g = game(7);
  g.run("fixture('ctc',60);" + SC_SETUP);
  // Khóa exact: LCG rng=12345 -> hit (ar 1000 vs def 100), crit x2, res phys 10%, role damage x1.1
  assert.equal(g.run("dealt"), 501.40863548289053);
  assert.equal(g.run("actor.mp"), 90); // trừ cost 10
  assert.equal(g.run("actor.cooldown"), 0.5); // 1/rate
  assert.equal(g.run("actor.contribution.damage"), 501.4086354828906);
  // Chạy lại với cùng seed -> cùng kết quả (replay được)
  g.run(SC_SETUP);
  assert.equal(g.run("dealt"), 501.40863548289053);
});

test("W1-6: sessionCombatHit CÓ hit-check (khác svHit luôn trúng)", () => {
  const g = game(7);
  g.run("fixture('ctc',60);" + SC_SETUP.replace("ar:1000", "ar:1").replace("def:100,", "def:100000,").replace("rng:12345", "rng:99999"));
  // draw đầu của LCG(99999)=0.9909 -> 99.09 >= hitPercent tối thiểu 40 -> trượt
  assert.equal(g.run("dealt"), 0);
  assert.equal(g.run("state.boss.hp"), 100000);
  assert.equal(g.run("actor.mp"), 90, "trượt vẫn tốn mana (thiết kế hiện tại)");
});
