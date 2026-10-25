import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Bước 6 jx-idle — CAST THẬT Cơ Quan Phổ (castAttack dùng chung) + sát thương
// tự thân Đồng hành. Test viết trước khi nối tick (theo quy ước các bước trước):
// chạy lần đầu phải FAIL (castAttack/step6* chưa tồn tại); sau khi có code phải PASS.

const G = () => game();
function fresh(mode = "phlt") {
  const g = G();
  g.run(`fixture('${mode}',60)`);
  // Harness không nạp file âm thanh: castAttack/heroHit gọi npcSfx/skillSfx.
  g.run("npcSfx = () => {}; skillSfx = () => {}; skillFx = () => {}; dirOf = () => 0;");
  // Học mọi chiêu Thiếu Lâm để có nhiều active khác main (main=20, cost 10).
  g.run("for (const id of FAC.shaolin.skills) S.sk[id]=1; recalc();");
  return g;
}
function enemyNear(g, cls = "normal") {
  g.run(`R.enemies=[{x:H.x+30,y:H.y,r:12,hp:1e9,def:0,series:0,res:{phys:0,poison:0,cold:0,fire:0,light:0},poison:0,poisonDmg:0,cls:"${cls}",act:"st",stun:0,stunImm:0,tid:0}];`);
}
function enableTrigger(g) {
  g.run("setFeatureFlags({trigger_deck:true})");
}
function setDeck(g, slots) {
  g.run("step3EnsureDefaults(S);");
  g.run(`S.step3.trigger_deck.slots=${JSON.stringify(slots)};`);
}

test("Bước 6: castAttack dùng chung cho kết quả giống hệt heroAttack (cùng seed, cùng setup)", () => {
  const a = fresh(), b = fresh();
  enemyNear(a); enemyNear(b);
  const hpA = a.run("heroAttack(); R.enemies[0].hp");
  const manaA = a.run("R.mana");
  // B: chọn đúng chiêu heroAttack sẽ chọn (P.main khi pool xoay < 2) và cast trực tiếp.
  const outB = b.run("castAttack(R.P, R.P.main, R.enemies[0]); R.enemies[0].hp");
  const manaB = b.run("R.mana");
  assert.equal(outB, hpA);
  assert.equal(manaB, manaA);
  assert.equal(typeof b.run("castAttack"), "function");
  assert.equal(typeof b.run("heroAttackTarget"), "function");
});

test("Bước 6: Cơ Quan Phổ cast thật kỹ năng theo slot (không ép S.main, trừ đúng mana chiêu cơ quan)", () => {
  const g = fresh();
  enableTrigger(g);
  enemyNear(g);
  // Chiêu cơ quan = 11 (cost 8), khác main 20 (cost 10); điều kiện hp<=90, máu đang 50%.
  setDeck(g, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g.run("R.life = R.P.life * 0.5;");
  const manaBefore = g.run("R.mana");
  const mainBefore = g.run("S.main");
  const out = g.run("step6PacingAttack()");
  assert.ok(out > 0 && out !== 0.05, `pacing out ${out}`);
  assert.equal(g.run("R.mana"), manaBefore - 8);
  assert.equal(g.run("S.step3.trigger_deck.lastFired"), 11);
  assert.ok(g.run("S.step3.trigger_deck.castCount") >= 1);
  assert.equal(g.run("S.main"), mainBefore, "cast cơ quan không được đổi S.main");
});

test("Bước 6 (D1, level): điều kiện còn đúng thì nhịp sau vẫn cast lại (không phải edge một lần)", () => {
  const g = fresh();
  enableTrigger(g);
  enemyNear(g);
  setDeck(g, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g.run("R.life = R.P.life * 0.5; R.mana = R.P.mana;");
  g.run("step6TriggerCast();");
  const c1 = g.run("S.step3.trigger_deck.castCount");
  g.run("R.mana = R.P.mana;");
  g.run("step6TriggerCast();");
  assert.equal(g.run("S.step3.trigger_deck.castCount"), c1 + 1);
});

test("Bước 6 (D2): ưu tiên nhỏ nhất trước, 1 cast/nhịp; hết nội lực thì không cast và đòn thường lo liệu", () => {
  const g = fresh();
  enableTrigger(g);
  enemyNear(g);
  // Cả 2 slot đều đủ điều kiện (máu 50% <= 90, mana 50% <= 90): priority 1 (skill 19) trước priority 2 (skill 11).
  setDeck(g, [
    { condition: "hp<=90%", skill: 11, priority: 2 },
    { condition: "mana<=90%", skill: 19, priority: 1 },
  ]);
  g.run("R.life = R.P.life * 0.5; R.mana = R.P.mana * 0.5;");
  g.run("step6TriggerCast();");
  assert.equal(g.run("S.step3.trigger_deck.lastFired"), 19);
  // Hết nội lực: trigger không cast, lastFired giữ nguyên; pacing fallback sang đòn thường (basic, cost 0).
  const g2 = fresh();
  enableTrigger(g2);
  enemyNear(g2);
  setDeck(g2, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g2.run("R.life = R.P.life * 0.5; R.mana = 0;");
  assert.equal(g2.run("step6TriggerCast()"), null);
  assert.equal(g2.run("S.step3.trigger_deck.lastFired"), null);
  const hpBefore = g2.run("R.enemies[0].hp");
  g2.run("step6PacingAttack();");
  assert.ok(g2.run("R.enemies[0].hp") < hpBefore, "đòn thường basic vẫn đánh khi cơ quan hết mana");
  assert.equal(g2.run("S.step3.trigger_deck.lastFired"), null);
});

test("Bước 6: không đệ quy (cast 1 lần/nhịp), flag OFF thì không cast, ngoài tầm thì không trừ mana", () => {
  const g = fresh();
  enableTrigger(g);
  enemyNear(g);
  setDeck(g, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g.run("R.life = R.P.life * 0.5;");
  g.run("step6PacingAttack();");
  assert.equal(g.run("S.step3.trigger_deck.castCount"), 1);
  assert.equal(g.run("R.triggerCasting"), false);
  // Flag OFF (tắt tường minh — Bước 6 mặc định trigger_deck đã ON):
  // pacing = đòn thường, lastFired giữ null.
  const g2 = fresh();
  g2.run("setFeatureFlags({trigger_deck:false});");
  enemyNear(g2);
  setDeck(g2, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g2.run("R.life = R.P.life * 0.5;");
  g2.run("step6PacingAttack();");
  assert.equal(g2.run("S.step3.trigger_deck.lastFired"), null);
  // Ngoài tầm: trigger trả null, không trừ mana, không ghi lastFired.
  const g3 = fresh();
  enableTrigger(g3);
  g3.run("R.enemies=[{x:H.x+10000,y:H.y,r:12,hp:1e9,def:0,series:0,res:{phys:0,poison:0,cold:0,fire:0,light:0},poison:0,poisonDmg:0,cls:'normal',act:'st',stun:0,stunImm:0,tid:0}];");
  setDeck(g3, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g3.run("R.life = R.P.life * 0.5;");
  const manaBefore = g3.run("R.mana");
  assert.equal(g3.run("step6TriggerCast()"), null);
  assert.equal(g3.run("R.mana"), manaBefore);
  assert.equal(g3.run("S.step3.trigger_deck.lastFired"), null);
});

test("Bước 6: chế độ tay thì cơ quan không cast", () => {
  const g = fresh();
  enableTrigger(g);
  enemyNear(g);
  setDeck(g, [{ condition: "hp<=90%", skill: 11, priority: 1 }]);
  g.run("R.life = R.P.life * 0.5; manual = () => true;");
  assert.equal(g.run("step6TriggerCast()"), null);
  assert.equal(g.run("S.step3.trigger_deck.lastFired"), null);
});

test("Bước 6: Đồng hành đánh ké phẳng 20% basic, boss ×0,5; chết/chờ hồi sinh thì không đánh", () => {
  // Đối chứng cùng seed: game companion ON vs OFF, cùng 1 nhịp pacing.
  const on = fresh(), off = fresh();
  for (const g of [on, off]) enemyNear(g);
  on.run("setFeatureFlags({companion:true}); step3EnsureDefaults(S); step3CompanionAdopt(S,'x',{enabled:true}); S.step3.companion.autoRevive=false;");
  const base = off.json("R.P.basic.tot");
  const hpOff = off.run("step6PacingAttack(); R.enemies[0].hp");
  const hpOn = on.run("step6PacingAttack(); R.enemies[0].hp");
  const strike = Math.max(1, Math.round(base * 0.20));
  assert.ok(Math.abs((hpOff - hpOn) - strike) <= 1, `strike thường: diff ${hpOff - hpOn}, kỳ vọng ${strike} (basic.tot ${base})`);
  // Boss: ×0,5.
  const onB = fresh(), offB = fresh();
  for (const g of [onB, offB]) enemyNear(g, "boss");
  onB.run("setFeatureFlags({companion:true}); step3EnsureDefaults(S); step3CompanionAdopt(S,'x',{enabled:true}); S.step3.companion.autoRevive=false;");
  const baseB = offB.json("R.P.basic.tot");
  const hpOffB = offB.run("step6PacingAttack(); R.enemies[0].hp");
  const hpOnB = onB.run("step6PacingAttack(); R.enemies[0].hp");
  const strikeB = Math.max(1, Math.round(Math.round(baseB * 0.20) * 0.5));
  assert.ok(Math.abs((hpOffB - hpOnB) - strikeB) <= 1, `strike boss: diff ${hpOffB - hpOnB}, kỳ vọng ${strikeB}`);
  // Đồng hành ngã: không đánh ké.
  const dead = fresh();
  enemyNear(dead);
  dead.run("setFeatureFlags({companion:true}); step3EnsureDefaults(S); step3CompanionAdopt(S,'x',{enabled:true}); S.step3.companion.alive=false;");
  const hpDead = dead.run("step6PacingAttack(); R.enemies[0].hp");
  assert.equal(hpDead, hpOff, "Đồng hành ngã thì sát thương bằng đúng game không có Đồng hành");
});

test("Bước 6: pacing khi không có deck thì bằng đúng đòn thường (không vỡ đường cũ)", () => {
  const a = fresh(), b = fresh();
  enemyNear(a); enemyNear(b);
  const hpA = a.run("heroAttack(); R.enemies[0].hp");
  const hpB = b.run("step6PacingAttack(); R.enemies[0].hp");
  assert.equal(hpB, hpA);
});
