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

function tangmenReady(g) {
  // setup: Đường Môn, flag bật, stub các hàm render/audio không có trong test context
  g.run(`fixture("ctc",60);`);
  g.run(`S.fac="tangmen"; S.sk={}; S.sk[FAC.tangmen.starter]=1; S.main=FAC.tangmen.starter; R.P=calc(); R.life=R.P.life; R.mana=R.P.mana;`);
  g.run(`setFeatureFlags({faction_mechanics:true});`);
  g.run(`function skillFx(){}; npcSfx=()=>{}; skillSfx=()=>{}; dirOf=()=>0;`);
  g.run(`R.enemies=[{x:H.x+30,y:H.y,r:12,hp:1e9,def:0,series:0,res:{phys:0,poison:0,cold:0,fire:0,light:0},poison:0,poisonDmg:0,cls:"normal",act:"st",stun:0,stunImm:0,tid:0}];`);
  g.run(`let __hd=0; const __heroHit=heroHit; heroHit=function(a,e){__hd=__heroHit(a,e);return __hd;};`);
}

test("Phase2-N7: hằng số minh họa TANGMEN_EXTRA_HIT_RATIO = 0.5", () => {
  const g = game();
  g.run(`setFeatureFlags({faction_mechanics:true});`);
  assert.equal(g.json(`TANGMEN_EXTRA_HIT_RATIO`), 0.5, "hằng số minh họa = 50% (CHỜ USER CHỐT)");
  assert.equal(g.json(`FAC_MECHANICS.tangmen.extraDmgMul`), 0.5, "mechanic dùng đúng hằng số");
});

test("Phase2-N7: đòn thêm = 50% sát thương đòn vừa kích hoạt", () => {
  const g = game();
  tangmenReady(g);
  g.run(`Math.random=()=>0.001;`); // luôn trigger onAttack (0.001 < 0.15)
  g.run(`heroAttack();`);
  const hd = g.json(`__hd`);
  const hpLeft = g.json(`R.enemies[0].hp`);
  assert.ok(hd > 1, `đòn kích hoạt gây sát thương thật (hd=${hd})`);
  const expectedExtra = Math.max(1, Math.round(hd * 0.5));
  const totalDealt = 1e9 - hpLeft;
  assert.ok(Math.abs(totalDealt - (hd + expectedExtra)) < 1e-6,
    `tổng = đòn kích hoạt + đòn thêm 50% (hd=${hd}, extra=${expectedExtra}, total=${totalDealt})`);
  const ratio = expectedExtra / hd;
  assert.ok(Math.abs(ratio - 0.5) / 0.5 <= 0.05, `đòn thêm khớp desc 50% trong ±5% (tỉ lệ=${ratio})`);
});

test("Phase2-N7: không trigger thì không có đòn thêm", () => {
  const g = game();
  tangmenReady(g);
  g.run(`Math.random=()=>0.99;`); // 0.99 >= 0.15 -> không kích hoạt
  g.run(`heroAttack();`);
  const hd = g.json(`__hd`);
  const totalDealt = 1e9 - g.json(`R.enemies[0].hp`);
  assert.ok(Math.abs(totalDealt - hd) < 1e-6, "không có sát thương thêm khi không trigger");
});

test("Phase2-N7: đòn trượt (hd=0) không kích hoạt đòn thêm", () => {
  const g = game();
  tangmenReady(g);
  g.run(`Math.random=()=>0.001;`);
  g.run(`const __h2=heroHit; heroHit=function(){return 0;};`); // giả lập đòn trượt
  g.run(`heroAttack();`);
  const totalDealt = 1e9 - g.json(`R.enemies[0].hp`);
  assert.equal(totalDealt, 0, "đòn trượt -> không có đòn thêm");
});

test("Phase2-B6: SV_FAC_K đủ 10 phái", () => {
  const g = game();
  g.run(`fixture("ctc",60);`);
  const keys = g.json(`Object.keys(SV_FAC_K)`);
  const facs = g.json(`JX.factions.map(f=>f.key)`);
  assert.equal(facs.length, 10, "đúng 10 phái sau Phase 0");
  for (const k of facs) assert.ok(keys.includes(k), `SV_FAC_K có phái ${k}`);
  assert.equal(g.json(`SV_FAC_K.cuiyan`), 1, "cuiyan trung tính 1.0 (MINH HỌA - CHỜ USER CHỐT)");
});

test("Phase2-B5: ngân sách 3 mechanic từ công thức", () => {
  const g = game();
  g.run(`setFeatureFlags({faction_mechanics:true});`);
  // shaolin: HP<30% nhận ×0.8 -> EHP kỳ vọng = 0.7L + 0.3L/0.8 = 1.075L (+7.5%)
  assert.equal(g.json(`FAC_MECHANICS.shaolin.onTakeDamage(null,0.2)`), 0.8);
  // tangmen: 15% × 50% đòn kích hoạt -> +7.5% DPS kỳ vọng
  assert.equal(g.json(`FAC_MECHANICS.tangmen.extraDmgMul`), 0.5);
  const trig = g.json(`(()=>{let n=0;for(let i=0;i<100000;i++)if(FAC_MECHANICS.tangmen.onAttack(()=>(i%1000)/1000))n++;return n/100000;})()`);
  assert.ok(Math.abs(trig - 0.15) < 0.01, `tỉ lệ trigger ≈ 15% (đo=${trig})`);
  // wudang: phản 10% sát thương nhận
  assert.equal(g.json(`FAC_MECHANICS.wudang.onTakeDamageReflect()`), 0.1);
});
