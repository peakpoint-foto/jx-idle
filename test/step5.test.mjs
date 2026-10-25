import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { game } from "./helpers/game.mjs";

// Bước 5 jx-idle — thử sửa ở mức an toàn: PHLT lag (culling vòng vẽ),
// iOS đơ khi mở sách skill (cache/diff renderSkill), nút chuyển map trên
// màn hình chiến đấu, auto-potion ngưỡng mana + slider thắng profile,
// và cổng kiểm tra cast Cơ Quan Phổ (CHƯA nối live — xem cuối file).
// Test viết TRƯỚC code: chạy lần đầu phải FAIL (step5* chưa tồn tại,
// potionManaThreshold chưa có, guard onScreen chưa có trong draw()).
const ROOT = fileURLToPath(new URL("..", import.meta.url));
function fresh(mode = "phlt") {
  const g = game();
  g.run(`fixture('${mode}',60)`);
  return g;
}
function enableLatT(g) {
  g.run("setFeatureFlags({trigger_deck:true,companion:true,trophy_charm:true,loot_records:true})");
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// --- (a) PHLT lag: culling trong draw() chính (không đổi logic game) ---
test("Bước 5 (a): draw() bỏ vẽ ground/quái/xác ngoài màn hình, giữ nguyên cập nhật trạng thái", () => {
  const src = read("js/render.js");
  assert.ok(src.includes("if(!onScreen(d.x,d.y,40))continue;"), "ground culling");
  assert.ok(src.includes("if(!onScreen(e.x,e.y,120))continue;"), "corpse culling");
  assert.ok(src.includes("if(!onScreen(e.x,e.y,160))"), "enemy culling");
  // Vòng vẽ SV đã cull từ trước (js/survival.js) — đây là tiền lệ, không phải mẫu mới bịa.
  assert.ok(read("js/survival.js").includes("onScreen(e.x,e.y,80)"), "SV đã cull từ trước");
  // Không đổi số quái/máu/tỉ lệ: không có hằng số spawn mới trong render.js.
  assert.ok(!src.includes("STEP5_SPAWN"), "không đổi spawn");
});

// --- (b) iOS đơ: renderSkill() cache/diff, giữ nguyên handler và hiển thị ---
test("Bước 5 (b): renderSkill() lần 2 không đổi state thì bỏ qua vẽ lại, đổi state thì vẽ lại", () => {
  const g = fresh();
  // Harness không nạp js/guide.js nên suggestModal chưa tồn tại — stub nó
  // (chỉ là gán handler onclick trong renderSkill gốc, không phải hành vi
  // Bước 5). Đây là thiếu sót của harness, không phải của game.
  g.run("suggestModal=()=>{};");
  g.run("renderSkill()");
  assert.equal(g.run("STEP5_SKILL_RENDERS"), 1);
  g.run("renderSkill()");
  assert.equal(g.run("STEP5_SKILL_RENDERS"), 1, "không vẽ lại khi state không đổi");
  assert.equal(g.run("STEP5_SKILL_SKIPS"), 1);
  assert.equal(g.run("R.skillViewP===R.P"), true, "skip vẫn cập nhật skillViewP để tick không gọi lại");
  // Đổi điểm kỹ năng -> phải vẽ lại (không kẹt ở cache cũ).
  g.run("S.skPts+=1; renderSkill()");
  assert.equal(g.run("STEP5_SKILL_RENDERS"), 2);
  // Đổi khóa chiêu chính -> phải vẽ lại.
  g.run("S.mainLock=false; renderSkill()");
  assert.equal(g.run("STEP5_SKILL_RENDERS"), 3);
  // Mở/đóng tab nhiều lần không đổi state -> toàn skip, không vẽ lại.
  g.run("renderSkill(); renderSkill(); renderSkill()");
  assert.equal(g.run("STEP5_SKILL_RENDERS"), 3);
  assert.equal(g.run("STEP5_SKILL_SKIPS"), 4);
});
test("Bước 5 (b): đổi identity (phái/kỹ năng) thì fingerprint đổi và vẽ lại", () => {
  const g = fresh();
  g.run("suggestModal=()=>{};");
  g.run("renderSkill()");
  const before = g.run("STEP5_SKILL_RENDERS");
  // Học thêm 1 chiêu tấn công của phái (nếu có) rồi vẽ lại phải render.
  const learned = g.run(`(()=>{const ids=FAC.shaolin.skills.filter(id=>isAttack(SK[id])&&!S.sk[id]);if(!ids.length)return null;S.sk[ids[0]]=1;R.dirty=true;recalc();return ids[0]})()`);
  if (learned !== null) {
    g.run("renderSkill()");
    assert.equal(g.run("STEP5_SKILL_RENDERS"), before + 1);
  }
});

// --- (c) Nút chuyển map trên màn hình chiến đấu ---
test("Bước 5 (c): nút chuyển map tái dùng gotoStage, chặn khi đang hoạt động, không phá vòng chiến đấu", () => {
  const html = read("index.html");
  assert.ok(html.includes('id="jxStagePrev"'), "nút ải trước có mặt trên màn hình chiến đấu");
  assert.ok(html.includes('id="jxStageNext"'), "nút ải sau có mặt trên màn hình chiến đấu");
  const g = fresh();
  g.run("S.stage=5; S.maxStage=10;");
  assert.deepEqual(g.json("step5BattleNavDisabled()"), { prev: false, next: false });
  assert.equal(g.run("step5BattleNavGo(1)"), true);
  assert.equal(g.run("S.stage"), 6);
  assert.equal(g.run("S.wave"), 1, "gotoStage đặt lại đợt như cũ");
  assert.deepEqual(g.json("R.enemies"), [], "gotoStage dọn quái cũ như cũ");
  // Biên: ải 1 thì không về trước, ải max thì không sang sau.
  g.run("S.stage=1;");
  assert.equal(g.json("step5BattleNavDisabled()").prev, true);
  assert.equal(g.run("step5BattleNavGo(-1)"), false);
  assert.equal(g.run("S.stage"), 1);
  g.run("S.stage=10;");
  assert.equal(g.json("step5BattleNavDisabled()").next, true);
  assert.equal(g.run("step5BattleNavGo(1)"), false);
  // Đang leo tháp: nút chặn, ải không đổi (không phá vòng tháp).
  g.run("S.stage=5; R.tower={floor:3};");
  assert.deepEqual(g.json("step5BattleNavDisabled()"), { prev: true, next: true });
  assert.equal(g.run("step5BattleNavGo(1)"), false);
  assert.equal(g.run("S.stage"), 5);
  // Tống Kim / công thành / thị trấn cũng chặn.
  g.run("R.tower=null; R.tk={};");
  assert.equal(g.run("step5BattleNavGo(1)"), false);
  g.run("R.tk=null; S.siege={};");
  assert.equal(g.run("step5BattleNavGo(1)"), false);
  g.run("S.siege=null; R.town={};");
  assert.equal(g.run("step5BattleNavGo(1)"), false);
});

// --- (d) Auto-potion: ngưỡng % cho mana + slider tay đặt thắng profile ---
test("Bước 5 (d): ngưỡng mana mặc định 50% — dưới ngưỡng thì uống, trên ngưỡng thì không", () => {
  const g = fresh("ctc");
  g.run("S.gold=1e9; S.potStock={life:{},mana:{}};");
  g.run("var mp=J.potions.find(p=>p.kind==='mana'); S.potStock.mana[mp.tier]=2;");
  assert.equal(g.run("potionManaThreshold()"), 50, "mặc định mana 50% như HP");
  // HP đầy để cô lập mana; mana 40% max -> uống.
  g.run("R.life=R.P.life; R.mana=R.P.mana*0.4; R.hot={life:0,mana:0,lifeT:0,manaT:0,cd:0}; R.potCd={}; var u0=S.potUsed||0; autoPotion(.1);");
  assert.equal(g.run("S.potUsed||0"), 1, "mana dưới 50% thì uống");
  // Mana 90% max -> không uống (reset HOT/cooldown để lần gọi thứ hai có nghĩa).
  g.run("R.hot={life:0,mana:0,lifeT:0,manaT:0,cd:0}; R.potCd={}; R.mana=R.P.mana*0.9; var u1=S.potUsed||0; autoPotion(.1);");
  assert.equal(g.run("S.potUsed||0"), 1, "mana trên 50% thì không uống");
  // Slider mana tay đặt 80%: mana 60% -> uống; slider tay đặt 30%: mana 40% -> không.
  g.run("S.potManaPct=80; R.hot={life:0,mana:0,lifeT:0,manaT:0,cd:0}; R.potCd={}; R.mana=R.P.mana*0.6; autoPotion(.1);");
  assert.equal(g.run("S.potUsed||0"), 2, "ngưỡng mana 80% thì mana 60% phải uống");
  g.run("S.potManaPct=30; R.hot={life:0,mana:0,lifeT:0,manaT:0,cd:0}; R.potCd={}; R.mana=R.P.mana*0.4; autoPotion(.1);");
  assert.equal(g.run("S.potUsed||0"), 2, "ngưỡng mana 30% thì mana 40% không uống");
});
test("Bước 5 (d): slider tay đặt thắng profile combat_policy; không tay đặt thì profile thắng; chọn lại profile thì về ngưỡng profile", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({combat_policy:true}); S.ctrl='auto'; manual=()=>S.ctrl==='manual'; combatPolicySave('conserve',true);");
  g.run("S.gold=1e9; var lp=J.potions.find(p=>p.kind==='life'); var mp=J.potions.find(p=>p.kind==='mana'); S.potStock={life:{[lp.tier]:3},mana:{[mp.tier]:3}};");
  const reset = "R.hot={life:0,mana:0,lifeT:0,manaT:0,cd:0}; R.potCd={}; R.deadT=0; R.town=null;";
  // Chưa tay đặt: profile conserve HP 30% -> HP 60% không uống (profile thắng).
  g.run(`${reset} R.life=R.P.life*0.6; R.mana=R.P.mana; var u0=S.potUsed||0; autoPotion(.1);`);
  assert.equal(g.run("S.potUsed||0"), 0, "chưa tay đặt: HP 60% trên ngưỡng conserve 30% thì không uống");
  // Tay đặt HP 80% -> HP 60% uống (slider thắng profile). Đây là hành vi trước
  // sửa bị bỏ qua: combat_policy dùng ngưỡng profile bất kể slider.
  g.run("S.potLifeManual=true; S.potLifePct=80;");
  g.run(`${reset} R.life=R.P.life*0.6; R.mana=R.P.mana; autoPotion(.1);`);
  assert.equal(g.run("S.potUsed||0"), 1, "tay đặt HP 80%: HP 60% phải uống dù profile conserve chỉ 30%");
  // Tay đặt mana 80% -> mana 60% uống dù conserve chỉ yêu cầu mana < 1x cost chiêu chính.
  g.run("S.potManaManual=true; S.potManaPct=80;");
  g.run(`${reset} R.life=R.P.life; R.mana=R.P.mana*0.6; autoPotion(.1);`);
  assert.equal(g.run("S.potUsed||0"), 2, "tay đặt mana 80%: mana 60% phải uống");
  // Chọn lại profile -> tay đặt bị xóa, quay về ngưỡng profile.
  g.run("combatPolicySave('conserve',true);");
  assert.equal(g.run("S.potLifeManual"), false);
  assert.equal(g.run("S.potManaManual"), false);
  g.run(`${reset} R.life=R.P.life*0.6; R.mana=R.P.mana; autoPotion(.1);`);
  assert.equal(g.run("S.potUsed||0"), 2, "sau khi chọn lại profile: HP 60% lại không uống");
  // Nguồn sự thật được khóa ở mức source: handler slider phải đặt cờ tay đặt.
  const potSrc = read("js/potion_policy.js").replace(/\s+/g, "");
  assert.ok(potSrc.includes("S.potLifeManual=true"), "slider HP đặt cờ tay đặt");
  assert.ok(potSrc.includes("S.potManaManual=true"), "slider mana đặt cờ tay đặt");
  assert.ok(potSrc.includes("potionManaThreshold"), "có hàm ngưỡng mana");
});

// --- (e) Cast Cơ Quan Phổ: chỉ cổng kiểm tra, KHÔNG nối live trong Bước 5 ---
test("Bước 5 (e): cổng kiểm tra cast — đủ điều kiện thì ok, thiếu mana/bị cấm/chưa học/flag OFF/profile nắm quyền thì từ chối", () => {
  const g = fresh();
  enableLatT(g);
  const starter = g.run("FAC.shaolin.starter");
  g.run(`step3TriggerSave(S,[{condition:'hp<50%',skill:${starter},priority:1}],{enabled:true,ownedSkills:[${starter}]});`);
  g.run("R.life=R.P.life*0.4; R.mana=R.P.mana;");
  assert.deepEqual(g.json(`step5TriggerCastCheck(${starter})`), { ok: true }, "đủ điều kiện + đủ mana thì cổng mở");
  // Thiếu mana: học 1 chiêu tốn mana (nếu có) hoặc ép cost — dùng chiêu chính nếu cost > 0.
  const cost = g.run(`R.P.actives.find(a=>a.id===${starter}).cost`);
  if (cost > 0) {
    g.run(`R.mana=${cost - 1};`);
    const r = g.json(`step5TriggerCastCheck(${starter})`);
    assert.equal(r.ok, false, "thiếu mana thì cổng đóng");
    g.run("R.mana=R.P.mana;");
  }
  // Chưa học: chiêu tấn công khác của phái chưa học.
  const unlearned = g.run("FAC.shaolin.skills.find(id=>isAttack(SK[id])&&!S.sk[id])");
  if (unlearned !== null && unlearned !== undefined) {
    assert.equal(g.json(`step5TriggerCastCheck(${unlearned})`).ok, false, "chưa học thì cổng đóng");
  }
  // Bùa chú (curse): kỹ năng enemy không phải tấn công.
  const curse = g.run("(()=>{for(let i=0;i<SK.length;i++){const s=SK[i];if(s&&isCurse(s))return i}return null})()");
  if (curse !== null) {
    assert.equal(g.json(`step5TriggerCastCheck(${curse})`).ok, false, "bùa chú bị cấm trong idle thì cổng đóng");
  }
  // Flag OFF thì cổng đóng (tắt tường minh — Bước 6 mặc định trigger_deck đã ON).
  g.run("setFeatureFlags({trigger_deck:false});");
  assert.equal(g.json(`step5TriggerCastCheck(${starter})`).ok, false, "flag OFF thì cổng đóng");
  // Profile combat_policy đang nắm quyền chọn chiêu thì cổng đóng (tránh bypass policy).
  g.run("setFeatureFlags({trigger_deck:true}); S.ctrl='auto'; manual=()=>S.ctrl==='manual'; setFeatureFlags({trigger_deck:true,combat_policy:true}); combatPolicySave('balanced',true);");
  assert.equal(g.json(`step5TriggerCastCheck(${starter})`).ok, false, "profile đang bật thì cổng đóng");
});
test("Bước 5 (e): tick đánh giá không tự cast (cast thật chỉ ở nhịp đánh qua step6PacingAttack, Bước 6)", () => {
  const g = fresh();
  enableLatT(g);
  const starter = g.run("FAC.shaolin.starter");
  g.run(`step3TriggerSave(S,[{condition:'hp<50%',skill:${starter},priority:1}],{enabled:true,ownedSkills:[${starter}]}); R.life=R.P.life*0.4;`);
  const mainBefore = g.run("S.main");
  const r = g.json("step4GameTick(0.05)");
  assert.equal(r.trigger.wouldFire, starter, "vẫn đánh giá wouldFire như Bước 4");
  assert.equal(g.run("S.step3.trigger_deck.lastFired"), null, "không ghi lastFired vì chưa cast thật");
  assert.equal(g.run("S.main"), mainBefore, "không ép S.main");
  assert.equal(g.run("typeof step5ArmPending"), "undefined", "không có hàm arm pending nào được nối vào tick");
  const combatSrc = read("js/combat.js");
  assert.ok(!combatSrc.includes("step5Trigger"), "tick combat không chứa hook Bước 5");
  assert.ok(!combatSrc.includes("step5ArmPending"), "không sửa combat.js cho cast");
});
