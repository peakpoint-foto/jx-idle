import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Bước 3 jx-idle — test viết TRƯỚC code (js/step3.js). Chạy lần đầu phải FAIL
// (ReferenceError: step3* chưa tồn tại); sau khi có code phải PASS toàn bộ.
// Các hàm step3* nhận (save, opts); opts.enabled bỏ qua gate khi test thuần túy,
// còn test gate riêng dùng featureEnabled thật qua setFeatureFlags.
const G = () => game();
function fresh(mode = "phlt") {
  const g = G();
  g.run(`fixture('${mode}',60)`);
  return g;
}

test("sim khóa: Khí Tràng sát thương +10%, Linh Phù sát thương +5%, cộng tối đa +15%", () => {
  const g = fresh();
  assert.equal(g.run("STEP3_AURA.damage.bonus"), 0.10);
  assert.equal(g.run("STEP3_CHARM_EFFECTS.damage"), 0.05);
  assert.equal(g.run("Math.round((STEP3_AURA.damage.bonus + STEP3_CHARM_EFFECTS.damage)*100)/100"), 0.15);
  // Aura không cộng dồn với bùa cùng hiệu ứng: lấy max; Linh Phù cộng thêm, tối đa 1/bản loại.
  assert.equal(g.run("step3ResolveEffectBonus({buff:0.20,aura:0.10,charms:[{type:'damage',bonus:0.05}]}).total"), 0.25);
  assert.equal(g.run("step3ResolveEffectBonus({buff:0.05,aura:0.10,charms:[]}).total"), 0.10);
  assert.equal(g.run("step3ResolveEffectBonus({buff:0,aura:0,charms:[{type:'damage',bonus:0.05},{type:'damage',bonus:0.05}]}).total"), 0.05);
  assert.equal(g.run("step3ResolveEffectBonus({buff:0,aura:0,charms:[{type:'damage',bonus:0.05}]}).total"), 0.05);
  assert.equal(g.run("step3ResolveEffectBonus({buff:0,aura:0.10,charms:[]}).skillLevels"), 0);
});

test("gate flag Bước 3 vẫn chặn đúng mode (Lát T không bật ở CTC)", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({trigger_deck:true,companion:true,trophy_charm:true,loot_records:true})");
  assert.equal(g.run("step3Gate('trigger_deck','ctc')"), false);
  assert.equal(g.run("step3Gate('trigger_deck','phlt')"), true);
  assert.equal(g.run("step3Gate('loot_records','ctc')"), true);
  g.run("setFeatureFlags({})");
  // Bước 6: loot_records mặc định ON nên sau khi xóa override vẫn mở ở ctc;
  assert.equal(g.run("step3Gate('loot_records','ctc')"), true);
  // Lát T vẫn bị chặn ở ctc (kiểm tra mode, không phụ thuộc mặc định).
  assert.equal(g.run("step3Gate('trigger_deck','ctc')"), false);
});

test("Đồ Chí: ghi 990 item, ghi cả khi túi đầy, không tạo icon mới", () => {
  const g = fresh("ctc");
  g.run("setFeatureFlags({loot_records:true})");
  const total = g.run("J.items.reduce((t,d)=>t+(d.list?d.list.length:0),0)");
  assert.equal(total, 990);
  const catalog = g.json("J.items.flatMap(d=>d.list.map(it=>it.n))");
  assert.equal(g.run(`step3CodexRecord(S, ${JSON.stringify(catalog[0])}, ${JSON.stringify(catalog)})`), true);
  assert.equal(g.run("S.step3.loot_records.entries[" + JSON.stringify(catalog[0]) + "].count"), 1);
  assert.equal(g.run(`'icon' in S.step3.loot_records.entries[${JSON.stringify(catalog[0])}]`), false);
  // Túi đầy (60/60) vẫn ghi — Đồ Chí là ghi chép, không phải túi (§5 v2.3).
  g.run("S.inv = Array.from({length:60},(_,i)=>({uid:1000+i,base:[0],mag:[]})); S.step3.loot_records.entries={};");
  assert.equal(g.run(`step3CodexRecord(S, ${JSON.stringify(catalog[1])}, ${JSON.stringify(catalog)})`), true);
  assert.equal(g.run("Object.keys(S.step3.loot_records.entries).length"), 1);
  // Item ngoài catalog 990 bị từ chối; flag OFF chặn ghi.
  assert.equal(g.run(`step3CodexRecord(S, 'Món bịa không có', ${JSON.stringify(catalog)})`), false);
  assert.throws(() => g.run("step3CodexRecord(S,'x',[],{enabled:false})"), /chưa mở/);
  // Đủ bộ mở Dịch Dung.
  assert.equal(g.run("step3CodexSetUnlock(S,'bo_a',3,3)"), true);
  assert.deepEqual(g.json("S.step3.loot_records.sets_unlocked"), ["bo_a"]);
});

test("Dịch Dung: chỉ doll hiện có, giữ nguyên chỉ số, bán đồ gốc không mất vẻ", () => {
  const g = fresh("ctc");
  g.run("setFeatureFlags({appearance_change:true})");
  g.run("S.step3={}; step3EnsureDefaults(S); S.step3.appearance_change.unlocked=['lady','man']; const before=JSON.stringify({lvl:S.lvl,attr:S.attr,sk:S.sk}); S.__before=before;");
  g.run("step3TransmogSelect(S,'lady')");
  assert.equal(g.run("S.step3.appearance_change.selected"), "lady");
  assert.equal(g.run("JSON.stringify({lvl:S.lvl,attr:S.attr,sk:S.sk})===S.__before"), true);
  assert.throws(() => g.run("step3TransmogSelect(S,'doll_bia')"), /chưa mở|không có/);
  g.run("S.inv=[];"); // bán hết đồ gốc
  assert.equal(g.run("S.step3.appearance_change.unlocked.includes('lady')"), true);
  assert.throws(() => g.run("step3TransmogSelect(S,'lady',{enabled:false})"), /chưa mở/);
});

test("Võ Công Mẫu: đúng 10 mẫu, 1/phái, định dạng JXB1, không kẹt mode 2.0", () => {
  const g = fresh("ctc");
  assert.equal(g.run("STEP3_PRESETS.length"), 10);
  assert.equal(g.run("new Set(STEP3_PRESETS.map(p=>p.fac)).size"), 10);
  assert.equal(g.run("STEP3_PRESETS.every(p=>p.fac && p.skillId && p.skillName)"), true);
  const code = g.run("step3PresetCode(step3PresetByFac('shaolin'))");
  assert.ok(code.startsWith("JXB1:"));
  assert.equal(g.run("step3PresetByFac('shaolin').fac"), "shaolin");
  // Áp mẫu ở CTC (không yêu cầu g2 như build_library).
  g.run("S.fac='shaolin'; step3PresetApply(S,'shaolin',{enabled:true})");
  assert.equal(g.run("S.step3.build_presets.selected"), "shaolin");
  assert.throws(() => g.run("step3PresetApply(S,'wudang',{enabled:true})"), /không khớp|phái/);
});

test("Mùa xếp hạng: chỉ bảng/mode, thưởng tài nguyên CTC CHƯA MỞ", () => {
  const g = fresh("ctc");
  const rows = g.json("step3SeasonBoard([{name:'A',points:10},{name:'B',points:30},{name:'C',points:20}])");
  assert.deepEqual(rows.map(r => r.name), ["B", "C", "A"]);
  assert.equal(g.run("'resource' in step3SeasonBoard([{name:'A',points:1}])[0]"), false);
  assert.equal(g.run("STEP3_SEASON_RESOURCE_GATE.open"), false);
  assert.throws(() => g.run("step3SeasonResourceClaim(S)"), /CHƯA MỞ|chưa mở/);
});

test("Thử thách tuần: xoay đúng 3 mutator mẫu, khóa theo tuần, 0 mutator mới", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({weekly_trial:true,coop_rescue:true})");
  assert.deepEqual(g.json("step3WeeklyMutators()"), ["giant", "frenzy", "bulwark"]);
  assert.equal(g.run("step3WeeklyMutator(10)"), g.run("step3WeeklyMutator(10)"));
  assert.notEqual(g.run("step3WeeklyMutator(10)"), g.run("step3WeeklyMutator(11)"));
  g.run("S.step3={}; step3EnsureDefaults(S); step3WeeklyState(S,'2026-W40',40); S.step3.weekly_trial.progress=5;");
  g.run("step3WeeklyState(S,'2026-W40',40)");
  assert.equal(g.run("S.step3.weekly_trial.progress"), 5);
  g.run("step3WeeklyState(S,'2026-W41',41)");
  assert.equal(g.run("S.step3.weekly_trial.progress"), 0);
  assert.equal(g.run("S.step3.weekly_trial.mutator"), g.run("step3WeeklyMutator(41)"));
});

test("Thử thách cộng đồng: chỉ đếm đóng góp, thưởng chung CHƯA MỞ", () => {
  const g = fresh("g2");
  g.run("setFeatureFlags({community_challenge:true,online_account_g2:true})");
  g.run("S.step3={}; step3EnsureDefaults(S);");
  assert.equal(g.run("step3CommunityContribute(S, 7)"), 7);
  assert.equal(g.run("step3CommunityContribute(S, 3)"), 10);
  assert.equal(g.run("STEP3_COMMUNITY_REWARD.open"), false);
  assert.throws(() => g.run("step3CommunityClaim(S)"), /CHƯA MỞ|chưa mở/);
});

test("Vực Sâu: thưởng mốc 5 tầng tách khỏi rift_tower không thưởng, cần training_lab", () => {
  const g = fresh("g2");
  assert.deepEqual(g.json("step3RiftMilestones(12)"), [5, 10]);
  assert.deepEqual(g.json("step3RiftMilestones(4)"), []);
  g.run("S.step3={}; step3EnsureDefaults(S);");
  assert.throws(() => g.run("step3RiftClaim(S,5,{riftTowerEnabled:true,trainingLabEnabled:false})"), /training_lab/);
  const r = g.json("step3RiftClaim(S,5,{riftTowerEnabled:true,trainingLabEnabled:true})");
  assert.equal(r.credit, 1);
  assert.throws(() => g.run("step3RiftClaim(S,5,{riftTowerEnabled:true,trainingLabEnabled:true})"), /đã nhận|mốc/);
  assert.equal(g.run("S.step3.rift_rewards.credits"), 1);
  assert.equal(g.run("step3RiftClaim(S,7,{riftTowerEnabled:true,trainingLabEnabled:true})"), null);
});

test("Lịch farm: 16 bảng Bước 2, vòng hoàn thành mới đếm, CTC qua receipt, Bảo Đảm local", () => {
  const g = fresh("ctc");
  g.run("setFeatureFlags({farm_schedule:true})");
  g.run("S.step3={}; step3EnsureDefaults(S);");
  const table = g.json("step3FarmBossTable()");
  assert.equal(table.length, 16);
  assert.equal(table[0].pity.boss_kills, 500);
  assert.equal(table[15].pity.boss_kills, 125);
  assert.throws(() => g.run("step3FarmCreate(S,{bossId:999999,rounds:10,stopRule:'none',bossKind:'local'})"), /Thủ Lĩnh|boss/);
  assert.throws(() => g.run("step3FarmCreate(S,{bossId:141,rounds:10,stopRule:'none',bossKind:'ctc'})"), /receipt/);
  g.run("step3FarmCreate(S,{bossId:141,rounds:20,stopRule:'bag_full',bossKind:'local'})");
  assert.equal(g.run("step3FarmCompleteRound(S,{})"), 1);
  g.run("step3FarmAbortRound(S)"); // vòng dở: không đếm, không thưởng
  assert.equal(g.run("S.step3.farm_schedule.state.completed"), 1);
  assert.equal(g.run("step3FarmStatus(S).startsWith('Đang farm:')"), true);
  g.run("step3FarmCompleteRound(S,{bagFull:true})");
  assert.equal(g.run("S.step3.farm_schedule.state.status"), "stopped_bag_full");
  assert.ok(g.run("step3FarmStatus(S)").includes("Dừng vì: túi đầy"));
  // Bảo Đảm local: vùng 0 cần 500 lần; CTC thì server nắm, local không trả.
  g.run("S.step3.farm_schedule.state.completed=500; S.step3.farm_schedule.state.pityCount=500;");
  assert.equal(g.run("step3FarmPityDue(S)"), true);
  assert.equal(g.run("step3FarmPityClaim(S)"), true);
  assert.equal(g.run("S.step3.farm_schedule.state.pityCount"), 0);
  g.run("step3FarmCreate(S,{bossId:141,rounds:5,stopRule:'none',bossKind:'ctc',receipt:'rcpt-1'})");
  assert.throws(() => g.run("step3FarmPityClaim(S)"), /server/);
});

test("Cơ Quan Phổ: mở 3 ô (Bước 6), ưu tiên, cấm đệ quy, không phát trong offline, Thử ngay không tốn gì", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({trigger_deck:true})");
  g.run("S.step3={}; step3EnsureDefaults(S);");
  // Bước 6 đổi luật: sim step6-latT cho thấy đánh giá 3 ô ≈ 1 ô nên mở đủ trần
  // thiết kế — lưu 2 ô nay HỢP LỆ, chỉ 4 ô mới bị từ chối.
  g.run("step3TriggerSave(S,[{condition:'hp_low',skill:10,priority:1},{condition:'mana_low',skill:6,priority:2}],{ownedSkills:new Set([10,6])})");
  assert.equal(g.run("S.step3.trigger_deck.slots.length"), 2);
  assert.throws(() => g.run("step3TriggerSave(S,[{condition:'hp_low',skill:10,priority:1},{condition:'mana_low',skill:6,priority:2},{condition:'hp_low',skill:10,priority:3},{condition:'mana_low',skill:6,priority:4}],{ownedSkills:new Set([10,6])})"), /3 ô|tối đa/);
  assert.throws(() => g.run("step3TriggerSave(S,[{condition:'hp_low',skill:999,priority:1}],{ownedSkills:new Set([10])})"), /không có|kỹ năng/);
  // Tick logic kiểm tra qua deck dựng trực tiếp (đủ 2 ô, ưu tiên 1 trước).
  g.run("S.step3.trigger_deck.slots=[{condition:'hp_low',skill:10,priority:2},{condition:'mana_low',skill:6,priority:1}];");
  // Cả 2 đủ điều kiện: ưu tiên 1 phát trước, còn lại chờ tick sau (không đệ quy).
  const tick = g.json("step3TriggerTick(S,(slot)=>true)");
  assert.equal(tick.fired.priority, 1);
  assert.equal(tick.waiting.length, 1);
  // Tick sau xét lại từ đầu: cơ quan ưu tiên 1 vẫn đủ điều kiện thì phát lại,
  // cơ quan chờ vẫn chờ trong tick đó (không đệ quy, mỗi tick tối đa 1 phát).
  assert.equal(g.run("step3TriggerTick(S,(slot)=>true).fired.priority"), 1);
  // Offline catch-up: không phát động, trạng thái chờ không đổi.
  g.run("step3TriggerSave(S,[{condition:'hp_low',skill:10,priority:1}],{ownedSkills:new Set([10])})");
  assert.equal(g.run("step3TriggerOfflineTick(S,(slot)=>true).fired"), null);
  // Thử ngay: không tốn cooldown, không rơi thưởng, lặp lại giống nhau.
  g.run("S.__cd={10:5}; S.__reward=0;");
  const t1 = g.json("step3TriggerTryNow(S,(slot)=>slot.skill===10,{10:5})");
  const t2 = g.json("step3TriggerTryNow(S,(slot)=>slot.skill===10,{10:5})");
  assert.equal(t1.wouldFire.skill, 10);
  assert.deepEqual(t1, t2);
  assert.equal(g.run("S.__cd[10]"), 5);
  assert.equal(g.run("S.__reward"), 0);
});

test("Đồng hành: 1 bản, 1 Khí Tràng, sát thương lên Thủ Lĩnh giảm nửa, fallback thiếu vàng", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({companion:true})");
  g.run("S.step3={}; step3EnsureDefaults(S); step3CompanionAdopt(S,'slime_tid');");
  assert.equal(g.run("S.step3.companion.tid"), "slime_tid");
  g.run("step3CompanionSetAura(S,'damage'); step3CompanionSetAura(S,'slow');");
  assert.equal(g.run("S.step3.companion.aura"), "slow");
  assert.equal(g.run("S.step3.companion.aurasActive"), undefined);
  assert.equal(g.run("step3CompanionDamage(100,'boss')"), 50);
  assert.equal(g.run("step3CompanionDamage(100,'normal')"), 100);
  assert.throws(() => g.run("step3CompanionSetAura(S,'aura_bia')"), /Khí Tràng|không có/);
  // Ngã, đủ vàng tự hồi sinh trừ 1000; thiếu vàng thì chờ bấm + mất Khí Tràng.
  g.run("S.gold=5000; S.step3.companion.autoRevive=true;");
  const r1 = g.json("step3CompanionFall(S,5000,false)");
  assert.equal(r1.revived, true);
  assert.equal(g.run("S.gold"), 4000);
  g.run("S.step3.companion.alive=true; S.gold=100;");
  const r2 = g.json("step3CompanionFall(S,100,false)");
  assert.equal(r2.revived, false);
  assert.equal(r2.auraActive, false);
  assert.ok(r2.report.includes("thiếu vàng"));
  // Hồi sinh giữa trận chỉ có tác dụng từ trận sau.
  g.run("S.step3.companion.alive=false; S.step3.companion.pendingRevive=false;");
  const r3 = g.json("step3CompanionFall(S,5000,true)");
  assert.equal(r3.revived, true);
  assert.equal(r3.auraActiveNow, false);
  assert.equal(g.run("S.step3.companion.pendingRevive"), true);
});

test("Chiến Tích Linh Phù: 3 bản, chiếm ô túi 60, chỉ tác dụng trong túi, khóa chống tự dọn, nâng bằng Kỷ vật có Bảo Đảm", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({trophy_charm:true})");
  assert.equal(g.run("STEP3_TROPHY_CHARMS.length"), 3);
  g.run("S.step3={}; step3EnsureDefaults(S); S.inv=[];");
  assert.equal(g.run("step3TrophyCharmAdd(S,'trophy_charm_1')"), true);
  assert.equal(g.run("S.inv.length"), 1);
  assert.equal(g.run("step3TrophyCharmEffects(S).length"), 1);
  g.run("S.stash=S.inv.splice(0,1);"); // chuyển sang rương: hết tác dụng
  assert.equal(g.run("step3TrophyCharmEffects(S).length"), 0);
  g.run("S.inv=S.stash; S.stash=[]; S.inv[0].locked=true;");
  assert.deepEqual(g.json("step3AutoCleanCandidates(S.inv)"), []);
  g.run("S.inv[0].locked=false;");
  assert.equal(g.run("step3AutoCleanCandidates(S.inv).length"), 1);
  // Túi đầy 60 thì không thêm được.
  g.run("S.inv = Array.from({length:60},(_,i)=>({uid:2000+i,base:[0],mag:[]}));");
  assert.throws(() => g.run("step3TrophyCharmAdd(S,'trophy_charm_2')"), /túi đầy|đầy/);
  // Bảo Đảm Kỷ vật: 10 lần hạ Thủ Lĩnh -> 1 Kỷ vật; nâng tốn 1 Kỷ vật.
  g.run("S.inv=[]; S.step3={}; step3EnsureDefaults(S); step3TrophyCharmAdd(S,'trophy_charm_1');");
  for (let i = 0; i < 9; i++) g.run("step3TrophyKill(S,'challenge_boss_1')");
  assert.equal(g.run("S.step3.trophy_charm.trophies"), 0);
  g.run("step3TrophyKill(S,'challenge_boss_1')");
  assert.equal(g.run("S.step3.trophy_charm.trophies"), 1);
  assert.equal(g.run("step3TrophyUpgrade(S,'trophy_charm_1')"), true);
  assert.equal(g.run("S.step3.trophy_charm.trophies"), 0);
  assert.equal(g.run("S.inv.find(it=>it.charmId==='trophy_charm_1').level"), 2);
});

test("Lát T không phát trong offline catch-up và không chạm CTC", () => {
  const g = fresh("phlt");
  g.run("setFeatureFlags({trigger_deck:true})");
  g.run("S.step3={}; step3EnsureDefaults(S); step3TriggerSave(S,[{condition:'hp_low',skill:10,priority:1}],{ownedSkills:new Set([10])});");
  const before = g.json("S.step3.trigger_deck");
  g.run("step3TriggerOfflineTick(S,()=>true);");
  assert.deepEqual(g.json("S.step3.trigger_deck"), before);
  assert.equal(g.run("step3Gate('companion','ctc',{companion:true})"), false);
});
