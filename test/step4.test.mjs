import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { game } from "./helpers/game.mjs";

// Bước 4 jx-idle — nối logic Bước 3 vào vòng game + quyết định (a)–(f).
// Test viết TRƯỚC code (js/step4.js + các điểm nối): chạy lần đầu phải FAIL
// (step4* chưa tồn tại); sau khi có code phải PASS toàn bộ.
const G = () => game();
function fresh(mode = "phlt") {
  const g = G();
  g.run(`fixture('${mode}',60)`);
  return g;
}
function enableLatT(g) {
  g.run("setFeatureFlags({trigger_deck:true,companion:true,trophy_charm:true,loot_records:true})");
}

test("Bước 4 (f): 3 Chiến Tích Linh Phù đã có tên Thủ Lĩnh thử thách thật, không còn null", () => {
  const g = fresh();
  const bosses = g.json("STEP3_TROPHY_CHARMS.map(c=>({id:c.id,bossName:c.bossName,bossRef:c.bossRef}))");
  assert.deepEqual(bosses.map(b => b.bossName), ["Lục Phi", "Hạ Hầu Phục", "Tiếu Vô Thường"]);
  assert.deepEqual(bosses.map(b => b.bossRef), [720, 716, 717]);
  assert.ok(bosses.every(b => b.bossName && b.bossRef));
  // Tên phải là boss trong bảng loot 16 của Bước 2, không bịa.
  const lootNames = g.json("JX_CONTENT.bossLoot.bosses.map(b=>b.boss)");
  for (const b of bosses) assert.ok(lootNames.includes(b.bossName), b.bossName);
});

test("Bước 4 (a): trần sở hữu Luyện Tài + validator (số khởi điểm, chưa phải sim)", () => {
  const g = fresh();
  const caps = g.json("STEP4_CRAFT_CAPS");
  assert.deepEqual(caps, { add_line: 30, change_line: 30, reroll_numbers: 50, remove_line: 30, seal: 20 });
  // Đúng trần thì ok; vượt trần, âm, không nguyên đều liệt kê vào over.
  assert.deepEqual(g.json("step4CraftCheck({add_line:30,change_line:0,reroll_numbers:0,remove_line:0,seal:0})"), { ok: true, over: [] });
  assert.deepEqual(g.json("step4CraftCheck({add_line:31,change_line:0,reroll_numbers:0,remove_line:0,seal:0})"), { ok: false, over: ["add_line"] });
  assert.deepEqual(g.json("step4CraftCheck({add_line:-1,change_line:0,reroll_numbers:0,remove_line:0,seal:0})"), { ok: false, over: ["add_line"] });
  assert.deepEqual(g.json("step4CraftCheck({add_line:1.5,change_line:0,reroll_numbers:0,remove_line:0,seal:0})"), { ok: false, over: ["add_line"] });
  assert.equal(g.run("step4CraftGrant({add_line:30},'add_line',1)"), false);
  assert.deepEqual(g.json("step4CraftGrant({add_line:29},'add_line',1)"), { add_line: 30 });
  assert.throws(() => g.run("step4CraftGrant({},'khong_co',1)"), /không có|unknown/i);
});

test("Bước 4 (3): áp bonus Khí Tràng/Linh Phù vào calc() đúng số sim, không cộng cấp kỹ năng", () => {
  const g = fresh();
  enableLatT(g);
  const base = g.json("calc()");
  const baseDmg = base.dmgMul, baseLife = base.life, baseRegen = base.regen;
  const skBefore = g.run("JSON.stringify(S.sk)");
  g.run("step3EnsureDefaults(S); step3CompanionAdopt(S,'x',{enabled:true}); S.step3.companion.autoRevive=false; step3CompanionSetAura(S,'damage',{enabled:true}); S.inv.push({charmId:'trophy_charm_1',level:1,locked:false,base:[0],mag:[]});");
  const after = g.json("calc()");
  assert.ok(Math.abs(after.dmgMul / baseDmg - 1.15) < 1e-9, `dmgMul ratio ${after.dmgMul / baseDmg}`);
  assert.equal(g.run("JSON.stringify(S.sk)"), skBefore);
  // 2 Linh Phù cùng loại sát thương không cộng thêm (tối đa 1/loại).
  g.run("S.inv.push({charmId:'trophy_charm_1',level:1,locked:false,base:[0],mag:[]});");
  const after2 = g.json("calc()");
  assert.ok(Math.abs(after2.dmgMul / baseDmg - 1.15) < 1e-9);
  // Sinh lực +5% (charm_2), hồi phục: Khí Tràng heal 10% + Linh Phù regen 10% = 20%.
  g.run("S.inv=[]; S.inv.push({charmId:'trophy_charm_2',level:1,locked:false,base:[0],mag:[]}); step3CompanionSetAura(S,'heal',{enabled:true}); S.inv.push({charmId:'trophy_charm_3',level:1,locked:false,base:[0],mag:[]});");
  const after3 = g.json("calc()");
  assert.ok(Math.abs(after3.life / baseLife - 1.05) < 1e-9, `life ratio ${after3.life / baseLife}`);
  assert.ok(Math.abs(after3.regen / baseRegen - 1.20) < 1e-9, `regen ratio ${after3.regen / baseRegen}`);
  // Flag OFF thì calc không đổi.
  // Flag OFF thì calc không đổi (tắt tường minh — Bước 6 mặc định đã ON).
  g.run("setFeatureFlags({companion:false,trophy_charm:false});");
  const off = g.json("calc()");
  assert.ok(Math.abs(off.dmgMul / baseDmg - 1) < 1e-9);
  assert.ok(Math.abs(off.life / baseLife - 1) < 1e-9);
});

test("Bước 4 (2): ghi Đồ Chí tại điểm rơi thật, cả khi túi đầy; flag OFF hoặc ngoài catalog thì không ghi", () => {
  const g = fresh("ctc");
  enableLatT(g);
  g.run("S.inv = Array.from({length:60},(_,i)=>({uid:1000+i,base:[0],mag:[]}));");
  const catalog = g.json("J.items.flatMap(d=>d.list.map(it=>it.n))");
  assert.equal(g.run(`step4RecordDrop({n:${JSON.stringify(catalog[0])}})`), true);
  assert.equal(g.run(`S.step3.loot_records.entries[${JSON.stringify(catalog[0])}].count`), 1);
  assert.equal(g.run("step4RecordDrop({n:'Món bịa không có'})"), false);
  // Bước 6: loot_records mặc định ON nên nhánh OFF phải tắt tường minh.
  g.run("setFeatureFlags({loot_records:false});");
  assert.equal(g.run(`step4RecordDrop({n:${JSON.stringify(catalog[1])}})`), false);
  // Điểm nối trong dropToGround thật (không chỉ hàm thuần).
  assert.ok(g.run("dropToGround.toString().includes('step4RecordDrop')"));
});

test("Bước 4 (1a): tick Cơ Quan Phổ vào vòng game — đánh giá theo ưu tiên, không phát trong offline, không đổi lastFired", () => {
  const g = fresh();
  enableLatT(g);
  g.run("step3EnsureDefaults(S); const sk0=FAC.shaolin.starter; step3TriggerSave(S,[{condition:'hp<50%',skill:sk0,priority:1}],{enabled:true,ownedSkills:[sk0]}); R.life=R.P.life*0.4;");
  const r1 = g.json("step4GameTick(0.05)");
  assert.equal(r1.trigger.wouldFire, g.run("FAC.shaolin.starter"));
  assert.equal(g.run("S.step3.trigger_deck.lastFired"), null);
  g.run("R.life=R.P.life*0.9;");
  const r2 = g.json("step4GameTick(0.05)");
  assert.equal(r2.trigger.wouldFire, null);
  // Điều kiện không hiểu được thì fail-closed (không đủ điều kiện), không crash.
  g.run("step3TriggerSave(S,[{condition:'khi trăng lên',skill:FAC.shaolin.starter,priority:1}],{enabled:true,ownedSkills:[FAC.shaolin.starter]}); R.life=R.P.life*0.1;");
  assert.equal(g.json("step4GameTick(0.05).trigger.wouldFire"), null);
  // Vòng tick thật có gọi step4GameTick — tick bị wrap bởi boss_phases nên
  // kiểm tra ở mức source (hàm gốc trong js/combat.js), kèm hành vi ở trên.
  const combatSrc = fs.readFileSync(path.join(ROOT, "js/combat.js"), "utf8");
  assert.ok(combatSrc.includes("step4GameTick(dt)"));
  // calc thật có gọi step4ApplyCalc (calc cũng bị wrap bởi rift_rules nên
  // kiểm tra ở mức source trong js/stats.js; hành vi đã kiểm ở test calc).
  const statsSrc = fs.readFileSync(path.join(ROOT, "js/stats.js"), "utf8");
  assert.ok(statsSrc.includes("step4ApplyCalc(P)"));
});

test("Bước 4 (1b): tick Đồng hành — hồi sinh giữa trận chỉ có tác dụng từ trận sau; Khí Tràng làm chậm ×1,10", () => {
  const g = fresh();
  enableLatT(g);
  g.run("step3EnsureDefaults(S); step3CompanionAdopt(S,'x',{enabled:true}); S.step3.companion.autoRevive=true; step3CompanionSetAura(S,'slow',{enabled:true});");
  assert.equal(g.run("step4MonsterIntervalMul()"), 1.10);
  g.run("step3CompanionFall(S,1000,true);");
  assert.equal(g.run("S.step3.companion.pendingRevive"), true);
  // Đang có trận (inBattle=true): vẫn chờ, Khí Tràng chưa trở lại.
  assert.deepEqual(g.json("step4CompanionTick(S,true)"), { revived: false, aura: null });
  assert.equal(g.run("step4MonsterIntervalMul()"), 1);
  // Hết trận (inBattle=false): hồi sinh có tác dụng, Khí Tràng trở lại.
  assert.deepEqual(g.json("step4CompanionTick(S,false)"), { revived: true, aura: "slow" });
  assert.equal(g.run("step4MonsterIntervalMul()"), 1.10);
  // Vòng tick thật có nhân hệ số làm chậm vào đòn quái (enemyAI cũng bị wrap
  // nên kiểm tra ở mức source trong js/combat.js).
  const combatSrc = fs.readFileSync(path.join(ROOT, "js/combat.js"), "utf8");
  assert.ok(combatSrc.includes("step4MonsterIntervalMul()"));
});

test("Bước 4 (1c): Đồng hành ngã thiếu vàng thì chờ bấm, Khí Tràng tắt, báo cáo đúng câu", () => {
  const g = fresh();
  enableLatT(g);
  g.run("step3EnsureDefaults(S); step3CompanionAdopt(S,'x',{enabled:true}); S.step3.companion.autoRevive=true; step3CompanionSetAura(S,'damage',{enabled:true});");
  const r = g.json("step3CompanionFall(S,999,false)");
  assert.equal(r.report, "Đồng hành chưa hồi sinh vì thiếu vàng");
  assert.equal(g.run("step4MonsterIntervalMul()"), 1);
  assert.equal(g.json("step4CompanionTick(S,false).aura"), null);
});

test("Bước 4 (4): UI tối thiểu — khay Linh Phù, thẻ Cơ Quan Phổ + Thử ngay, trạng thái farm, chọn Võ Công Mẫu", () => {
  const g = fresh();
  enableLatT(g);
  g.run("step3EnsureDefaults(S); S.inv.push({charmId:'trophy_charm_1',level:2,locked:true,base:[0],mag:[]}); S.inv.push({uid:1,base:[0],mag:[]}); step3TriggerSave(S,[{condition:'hp<50%',skill:FAC.shaolin.starter,priority:1}],{enabled:true,ownedSkills:[FAC.shaolin.starter]});");
  const tray = g.run("step4CharmTrayHTML(S)");
  assert.ok(tray.includes("Linh Phù đang mang"));
  assert.ok(tray.includes("1") && tray.includes("60") || tray.includes("còn trống"));
  assert.ok(tray.includes("trophy_charm_1") || tray.includes("sát thương"));
  const card = g.run("step4TriggerCardHTML(S)");
  assert.ok(card.includes("Thử ngay"));
  assert.ok(card.includes("hp") && card.includes("50%")); // "<" được esc thành &lt;
  const tryNow = g.json("step3TriggerTryNow(S,()=>true,{}, {enabled:true})");
  assert.equal(tryNow.wouldFire.skill, g.run("FAC.shaolin.starter"));
  const presets = g.run("step4PresetPickerHTML()");
  assert.ok(presets.includes("Thiếu Lâm") || presets.includes("shaolin"));
  assert.ok((presets.match(/preset_/g) || []).length >= 10 || presets.includes("Kim Cang"));
  const more = g.run("step4MoreSectionHTML()");
  assert.ok(more.includes("Bước 4") || more.includes("Linh Phù") || more.includes("Cơ Quan"));
});

test("Bước 4 (4b): trạng thái lịch farm duy nhất tái dùng định dạng Bước 3", () => {
  const g = fresh();
  enableLatT(g);
  g.run("step3EnsureDefaults(S); const t=JX_CONTENT.bossLoot.bosses[0]; step3FarmCreate(S,{bossId:t.boss_id,rounds:20,stopRule:'bag_full',bossKind:'local',bossTable:JX_CONTENT.bossLoot.bosses},{enabled:true}); step3FarmCompleteRound(S,{bagFull:true});");
  const html = g.run("step4FarmStatusHTML(S)");
  assert.ok(html.includes("Đang farm:"));
  assert.ok(html.includes("túi đầy"));
  assert.ok(html.includes("Dọn túi và tiếp tục"));
});

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test("Bước 4 (d): văn bản Tháp Vô Tận đã sửa cho khớp code (tầng đã qua 0 thưởng)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/rewards.js"), "utf8");
  assert.ok(!src.includes("quái vẫn rơi đồ và cho kinh nghiệm"), "câu cũ mâu thuẫn vẫn còn");
  assert.ok(src.includes("quái tầng đã qua không rơi đồ và không cho kinh nghiệm"));
});
