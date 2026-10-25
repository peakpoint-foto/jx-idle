"use strict";
// Bước 3 jx-idle — logic Lát R + Lát T (local/PHLT/2.0, loại trừ CTC).
// Đây là LỚP LOGIC thuần túy, chưa phải UI: mỗi hàm nhận (save, opts).
// Gate flag: opts.enabled nếu truyền tường minh sẽ thắng; nếu không, hàm tự đọc
// featureEnabled(flag) của game (khi có). Production UI phải truyền/kiểm tra
// featureEnabled trước khi gọi — module không tự bật flag nào.
// Số khóa (sim scripts/sim/step3-aura-charm.mjs, 30 ô mid 60/100/180 + cross-check
// sessionCombatStep): Khí Tràng sát thương +10%, Linh Phù sát thương +5%,
// nguồn mới tối đa +15% DPS, tổng ngân sách +46% < ngưỡng cảnh báo +112,5%
// (POWER_BUDGET.md, trần +150%). Khí Tràng/Linh Phù KHÔNG cộng cấp kỹ năng
// (0 ≤ trần +1 cấp/dòng); dòng % của chúng chịu trần ngân sách POWER_BUDGET.
// Mọi field save mới chỉ sống ở save.step3 (đúng một nơi, theo quy tắc Bước 1:
// không thêm vào migrateCore, không thêm wave mới).
const STEP3_AURA = Object.freeze({
  damage: Object.freeze({ id: "damage", name: "Tăng sát thương", bonus: 0.10 }),
  slow: Object.freeze({ id: "slow", name: "Làm chậm quái", monsterIntervalMul: 1.10 }),
  heal: Object.freeze({ id: "heal", name: "Hồi phục", regenBonus: 0.10 }),
});
const STEP3_AURAS = Object.freeze(["damage", "slow", "heal"]);
const STEP3_CHARM_EFFECTS = Object.freeze({ damage: 0.05, life: 0.05, regen: 0.10 });
const STEP3_TRIGGER_OPEN_SLOTS = 3; // Bước 6: sim hiệu năng step6-latT cho thấy đánh giá 3 ô ≈ 1 ô (dừng ở slot đủ đầu tiên, chi phí µs/nhịp) nên mở đủ trần thiết kế; xem DECISIONS-LOG-3.
const STEP3_TRIGGER_DESIGN_CAP = 3;
const STEP3_COMPANION_REVIVE_COST = 1000;
const STEP3_COMPANION_BOSS_DMG_MUL = 0.5;
const STEP3_TROPHY_PITY = 10;
const STEP3_RIFT_CREDIT_PER_MILESTONE = 1;
const STEP3_TROPHY_CHARMS = Object.freeze([
  // Bước 4 (f): tên Thủ Lĩnh thử thách đã chốt theo tiêu chí "3 boss duy nhất có
  // tên riêng + affinity phái đơn nhất trong 16 boss Bước 2" (xem DECISIONS-LOG-2).
  // bossId challenge_boss_N giữ nguyên làm key save ổn định; bossRef là boss_id
  // trong bảng loot Bước 2 (Lục Phi 720, Hạ Hầu Phục 716, Tiếu Vô Thường 717).
  Object.freeze({ id: "trophy_charm_1", effect: "damage", bonus: 0.05, bossId: "challenge_boss_1", bossName: "Lục Phi", bossRef: 720 }),
  Object.freeze({ id: "trophy_charm_2", effect: "life", bonus: 0.05, bossId: "challenge_boss_2", bossName: "Hạ Hầu Phục", bossRef: 716 }),
  Object.freeze({ id: "trophy_charm_3", effect: "regen", bonus: 0.10, bossId: "challenge_boss_3", bossName: "Tiếu Vô Thường", bossRef: 717 }),
]);
const STEP3_PRESETS = Object.freeze([
  Object.freeze({ id: "preset_shaolin", fac: "shaolin", facName: "Thiếu Lâm phái", skillId: 10, skillName: "Kim Cang Phục Ma" }),
  Object.freeze({ id: "preset_tianwang", fac: "tianwang", facName: "Thiên Vương Bang", skillId: 29, skillName: "Trảm Long quyết" }),
  Object.freeze({ id: "preset_tangmen", fac: "tangmen", facName: "Đường Môn", skillId: 45, skillName: "Phích Lịch đơn" }),
  Object.freeze({ id: "preset_wudu", fac: "wudu", facName: "Ngũ Độc Giáo", skillId: 63, skillName: "Độc Sa chưởng" }),
  Object.freeze({ id: "preset_emei", fac: "emei", facName: "Nga My phái", skillId: 80, skillName: "Phiêu Tuyết Xuyên Vân" }),
  Object.freeze({ id: "preset_cuiyan", fac: "cuiyan", facName: "Thúy Yên môn", skillId: 99, skillName: "Phong Hoa Tuyết Nguyệt" }),
  Object.freeze({ id: "preset_gaibang", fac: "gaibang", facName: "Cái Bang", skillId: 119, skillName: "Diên Môn Thác Bát" }),
  Object.freeze({ id: "preset_tianren", fac: "tianren", facName: "Thiên Nhẫn Giáo", skillId: 135, skillName: "Tàn Dương Như Huyết" }),
  Object.freeze({ id: "preset_wudang", fac: "wudang", facName: "Võ Đang phái", skillId: 153, skillName: "Nộ Lôi Chỉ" }),
  Object.freeze({ id: "preset_kunlun", fac: "kunlun", facName: "Côn Lôn phái", skillId: 169, skillName: "Hô Phong Pháp" }),
]);
const STEP3_WEEKLY_MUTATORS = Object.freeze(["giant", "frenzy", "bulwark"]);
const STEP3_SEASON_RESOURCE_GATE = Object.freeze({ open: false, sharedCalc: false, validatorExtended: false,
  d1ClaimTable: false, serverRunIdClaim: false,
  reason: "Thưởng mùa CTC bằng tài nguyên CHƯA MỞ: thiếu cả 4 cổng (shared calc, validator mở rộng, D1 claim, claim runId do server cấp)." });
const STEP3_COMMUNITY_REWARD = Object.freeze({ open: false,
  reason: "Thưởng chung cộng đồng CHƯA MỞ: snapshot + route claim + ngưỡng mốc chưa nối và test xong (migration 0014 vẫn là bản nháp, chưa nối ensureSchema/route, chưa kiểm chứng trên D1 thật)." });

function step3Gate(flag, mode, flags) {
  if (typeof featureEnabled !== "function") return false;
  return featureEnabled(flag, mode, flags);
}
function step3Enabled(flag, opts) {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "enabled")) return !!opts.enabled;
  if (typeof featureEnabled === "function") return featureEnabled(flag);
  return true;
}
function step3Def(obj, key, val) { if (obj[key] === undefined) obj[key] = val; return obj[key]; }
function step3EnsureDefaults(save) {
  if (!save || typeof save !== "object") throw new Error("Save không hợp lệ");
  const s = save.step3 && typeof save.step3 === "object" ? save.step3 : (save.step3 = {});
  step3Def(s, "loot_records", { entries: {}, sets_unlocked: [] });
  if (!s.loot_records.entries || typeof s.loot_records.entries !== "object") s.loot_records.entries = {};
  if (!Array.isArray(s.loot_records.sets_unlocked)) s.loot_records.sets_unlocked = [];
  step3Def(s, "appearance_change", { unlocked: [], selected: null });
  step3Def(s, "build_presets", { selected: null, custom: {} });
  step3Def(s, "weekly_trial", { week_key: null, mutator: null, progress: 0 });
  step3Def(s, "community_challenge", { contribution: 0, milestones: [] });
  step3Def(s, "rift_rewards", { credits: 0, claimed: [] });
  step3Def(s, "trigger_deck", { slots: [], lastFired: null });
  step3Def(s, "trophy_charm", { trophies: 0, pityByBoss: {} });
  if (s.farm_schedule === undefined) s.farm_schedule = null;
  if (s.companion === undefined) s.companion = null;
  return s;
}
// Giải quyết bonus cho 1 loại hiệu ứng: aura vs bùa chủ động cùng hiệu ứng lấy
// max (không cộng dồn); Linh Phù cộng thêm nhưng tối đa 1 Linh Phù/loại.
// Không bao giờ cộng cấp kỹ năng: skillLevels luôn 0.
function step3ResolveEffectBonus(input) {
  const buff = Math.max(0, +(input && input.buff) || 0);
  const aura = Math.max(0, +(input && input.aura) || 0);
  const seen = new Set();
  let charm = 0;
  for (const c of (input && input.charms) || []) {
    if (!c || seen.has(c.type)) continue;
    seen.add(c.type);
    charm += Math.max(0, +c.bonus || 0);
  }
  return { total: Math.round((Math.max(buff, aura) + charm) * 1e9) / 1e9, skillLevels: 0 };
}
// --- Vật Phẩm Đồ Chí (loot_records) ---
function step3CodexRecord(save, itemId, catalog, opts) {
  if (!step3Enabled("loot_records", opts)) throw new Error("Đồ Chí chưa mở");
  const s = step3EnsureDefaults(save);
  if (Array.isArray(catalog) && !catalog.includes(itemId)) return false;
  const e = s.loot_records.entries[itemId] || (s.loot_records.entries[itemId] = { seen: true, count: 0 });
  e.seen = true; e.count += 1;
  return true;
}
function step3CodexSetUnlock(save, setId, owned, required) {
  const s = step3EnsureDefaults(save);
  if (!(owned >= required && required > 0)) return false;
  if (!s.loot_records.sets_unlocked.includes(setId)) s.loot_records.sets_unlocked.push(setId);
  return true;
}
// --- Dịch Dung (appearance_change): chỉ doll hiện có, không động vào chỉ số ---
function step3TransmogSelect(save, dollId, availableDolls, opts) {
  if (typeof availableDolls === "object" && availableDolls !== null && !Array.isArray(availableDolls)) { opts = availableDolls; availableDolls = undefined; }
  if (!step3Enabled("appearance_change", opts)) throw new Error("Dịch Dung chưa mở");
  const s = step3EnsureDefaults(save);
  const available = Array.isArray(availableDolls) ? availableDolls : ["lady", "man"];
  if (!s.appearance_change.unlocked.includes(dollId) || !available.includes(dollId))
    throw new Error("Vẻ ngoài chưa mở hoặc không có trong doll hiện có");
  s.appearance_change.selected = dollId;
  return true;
}
// --- Võ Công Mẫu (build_presets): tái dùng ĐỊNH DẠNG JXB1, không lấy gate g2 ---
function step3PresetByFac(fac) { return STEP3_PRESETS.find(p => p.fac === fac) || null; }
function step3PresetCode(preset) {
  if (!preset) throw new Error("Mẫu không tồn tại");
  const payload = { v: 1, fac: preset.fac, attr: {}, sk: { [preset.skillId]: 1 }, slots: [0, 0, 0, 0],
    main: preset.skillId, mainLock: true, rot: true, recipe: {} };
  const json = JSON.stringify(payload);
  const b64 = typeof btoa === "function" ? btoa(json) : Buffer.from(json, "utf8").toString("base64");
  return "JXB1:" + b64;
}
function step3PresetApply(save, fac, opts) {
  if (!step3Enabled("build_presets", opts)) throw new Error("Võ Công Mẫu chưa mở");
  const preset = step3PresetByFac(fac);
  if (!preset) throw new Error("Mẫu không tồn tại");
  if (save.fac && save.fac !== fac) throw new Error("Mẫu không khớp phái nhân vật");
  const s = step3EnsureDefaults(save);
  s.build_presets.selected = fac; s.build_presets.custom = {};
  return preset;
}
// --- Mùa xếp hạng: CHỈ bảng/mode. Thưởng tài nguyên CTC: CHƯA MỞ (gate Bước 2) ---
function step3SeasonBoard(rows) {
  return (Array.isArray(rows) ? rows.slice() : [])
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .map(r => ({ name: r.name, points: r.points || 0 }));
}
function step3SeasonResourceClaim() { throw new Error(STEP3_SEASON_RESOURCE_GATE.reason); }
// --- Thử thách tuần: xoay 3 mutator mẫu, khóa theo tuần, 0 mutator mới ---
function step3WeeklyMutators() { return STEP3_WEEKLY_MUTATORS.slice(); }
function step3WeeklyMutator(weekIndex) {
  return STEP3_WEEKLY_MUTATORS[((weekIndex % 3) + 3) % 3];
}
function step3WeeklyState(save, weekKey, weekIndex, opts) {
  if (!step3Enabled("weekly_trial", opts)) throw new Error("Thử thách tuần chưa mở");
  const s = step3EnsureDefaults(save);
  if (s.weekly_trial.week_key !== weekKey) {
    s.weekly_trial.week_key = weekKey;
    s.weekly_trial.mutator = step3WeeklyMutator(weekIndex);
    s.weekly_trial.progress = 0;
  }
  return s.weekly_trial;
}
// --- Thử thách cộng đồng: CHỈ đếm đóng góp. Thưởng chung: CHƯA MỞ ---
function step3CommunityContribute(save, amount, opts) {
  if (!step3Enabled("community_challenge", opts)) throw new Error("Thử thách cộng đồng chưa mở");
  const s = step3EnsureDefaults(save);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Đóng góp không hợp lệ");
  s.community_challenge.contribution += amount;
  return s.community_challenge.contribution;
}
function step3CommunityClaim() { throw new Error(STEP3_COMMUNITY_REWARD.reason); }
// --- Vực Sâu: thưởng mốc 5 tầng, TÁCH KHỎI rift_tower hiện có (vô hạn, không thưởng) ---
// Cơ chế đã chọn: mỗi mốc 5 tầng đã qua được claim đúng 1 lần, +1 điểm luyện chế
// (credit mốc, không phải EXP/vàng/đồ trực tiếp — Luyện Tài chưa sẵn sàng nên
// credit chưa có chỗ tiêu ở Bước 3, không tạo sức mạnh ẩn). Phụ thuộc training_lab:
// không có training_lab thì không claim được, kể cả khi rift_tower đang bật.
function step3RiftMilestones(cleared) {
  const out = [];
  for (let f = 5; f <= cleared; f += 5) out.push(f);
  return out;
}
function step3RiftClaim(save, milestoneFloor, opts) {
  if (!opts || !opts.riftTowerEnabled) throw new Error("Vực Sâu chưa mở");
  if (!opts.trainingLabEnabled) throw new Error("Cần training_lab mới nhận thưởng mốc Vực Sâu");
  if (!Number.isInteger(milestoneFloor) || milestoneFloor < 5 || milestoneFloor % 5 !== 0) return null;
  const s = step3EnsureDefaults(save);
  if (s.rift_rewards.claimed.includes(milestoneFloor)) throw new Error("Mốc này đã nhận thưởng");
  s.rift_rewards.claimed.push(milestoneFloor);
  s.rift_rewards.credits += STEP3_RIFT_CREDIT_PER_MILESTONE;
  return { milestone: milestoneFloor, credit: STEP3_RIFT_CREDIT_PER_MILESTONE, credits: s.rift_rewards.credits };
}
// --- Lịch farm (farm_schedule): bảng loot Bước 2 + quy tắc per-Thủ Lĩnh ---
function step3FarmBossTable(bossTable) {
  if (Array.isArray(bossTable)) return bossTable;
  try {
    const t = typeof JX_CONTENT !== "undefined" && JX_CONTENT && JX_CONTENT.bossLoot;
    if (t && Array.isArray(t.bosses)) return t.bosses;
  } catch (e) { /* không có bảng nạp sẵn */ }
  return [];
}
function step3FarmCreate(save, input, opts) {
  if (!step3Enabled("farm_schedule", opts)) throw new Error("Lịch farm chưa mở");
  const table = step3FarmBossTable(input && input.bossTable);
  const boss = table.find(b => b.boss_id === input.bossId);
  if (!boss) throw new Error("Thủ Lĩnh không có trong bảng loot 16 boss");
  if (!Number.isInteger(input.rounds) || input.rounds < 1) throw new Error("Số vòng không hợp lệ");
  if (!["none", "bag_full", "rare_drop"].includes(input.stopRule)) throw new Error("Ngưỡng dừng không hợp lệ");
  if (input.bossKind === "ctc" && !input.receipt) throw new Error("Thủ Lĩnh CTC cần receipt CTC hiện có, không tự tạo receipt mới");
  if (!["local", "ctc"].includes(input.bossKind)) throw new Error("Loại Thủ Lĩnh không hợp lệ");
  const s = step3EnsureDefaults(save);
  s.farm_schedule = { bossId: boss.boss_id, bossName: boss.boss, rounds: input.rounds,
    stopRule: input.stopRule, bossKind: input.bossKind, receipt: input.receipt || null,
    state: { completed: 0, pityCount: 0, status: "running", stopReason: null } };
  return s.farm_schedule;
}
function step3FarmCompleteRound(save, roundOpts) {
  const sc = step3EnsureDefaults(save).farm_schedule;
  if (!sc) throw new Error("Chưa đặt lịch farm");
  const st = sc.state;
  if (st.status !== "running") return st.completed;
  st.completed += 1; st.pityCount += 1;
  if (roundOpts && roundOpts.bagFull) { st.status = "stopped_bag_full"; st.stopReason = "túi đầy"; }
  else if (roundOpts && roundOpts.rare && sc.stopRule === "rare_drop") { st.status = "stopped_rare"; st.stopReason = "rơi đồ hiếm"; }
  else if (st.completed >= sc.rounds) { st.status = "completed"; st.stopReason = null; }
  return st.completed;
}
function step3FarmAbortRound(save) {
  // Vòng dở (vào → dọn wave đầu → rút → vào lại): không đếm, không thưởng,
  // không cộng dồn tiến độ vòng cũ; lần vào lại là vòng mới (quyết v2.3).
  const sc = step3EnsureDefaults(save).farm_schedule;
  if (!sc) throw new Error("Chưa đặt lịch farm");
  sc.state.lastAborted = true;
  return sc.state.completed;
}
function step3FarmStatus(save) {
  const sc = step3EnsureDefaults(save).farm_schedule;
  if (!sc) return "Chưa đặt lịch farm";
  let text = `Đang farm: ${sc.bossName} • Vòng ${sc.state.completed}/${sc.rounds}`;
  if (sc.state.stopReason) text += ` • Dừng vì: ${sc.state.stopReason}`;
  if (sc.state.status === "stopped_bag_full") text += " • [Dọn túi và tiếp tục]";
  return text;
}
function step3FarmPityDue(save, bossTable) {
  const sc = step3EnsureDefaults(save).farm_schedule;
  if (!sc || sc.bossKind !== "local") return false;
  const boss = step3FarmBossTable(bossTable).find(b => b.boss_id === sc.bossId);
  if (!boss) return false;
  const pity = boss.pity && typeof boss.pity === "object" ? boss.pity.boss_kills : boss.pity;
  return sc.state.pityCount >= pity;
}
function step3FarmPityClaim(save) {
  const sc = step3EnsureDefaults(save).farm_schedule;
  if (!sc) throw new Error("Chưa đặt lịch farm");
  if (sc.bossKind === "ctc") throw new Error("Bảo Đảm CTC do server nắm, chưa mở ở local — không trả bằng bộ đếm local");
  if (!step3FarmPityDue(save)) return false;
  sc.state.pityCount = 0;
  return true;
}
// --- Cơ Quan Phổ (trigger_deck): mở 3 ô (Bước 6 mở đủ trần thiết kế, sim step6-latT) ---
function step3TriggerSave(save, slots, opts) {
  if (!step3Enabled("trigger_deck", opts)) throw new Error("Cơ Quan Phổ chưa mở");
  if (!Array.isArray(slots) || slots.length > STEP3_TRIGGER_OPEN_SLOTS)
    throw new Error(`Cơ Quan Phổ tối đa ${STEP3_TRIGGER_OPEN_SLOTS} ô (trần thiết kế ${STEP3_TRIGGER_DESIGN_CAP} ô)`);
  const owned = opts && opts.ownedSkills
    ? (opts.ownedSkills instanceof Set ? opts.ownedSkills : new Set(opts.ownedSkills)) : null;
  const blocked = opts && opts.blockedSkills
    ? (opts.blockedSkills instanceof Set ? opts.blockedSkills : new Set(opts.blockedSkills)) : new Set();
  for (const slot of slots) {
    if (!slot || typeof slot.condition !== "string" || !slot.condition || !Number.isInteger(slot.skill) || !Number.isInteger(slot.priority))
      throw new Error("Cấu hình cơ quan không hợp lệ");
    if (blocked.has(slot.skill)) throw new Error("Kỹ năng bị cấm trong idle, không cho lưu cơ quan");
    if (owned && !owned.has(slot.skill)) throw new Error("Kỹ năng không có trong bảng kỹ năng nhân vật, không cho lưu cơ quan");
  }
  const s = step3EnsureDefaults(save);
  s.trigger_deck.slots = slots.map(x => ({ condition: x.condition, skill: x.skill, priority: x.priority }));
  s.trigger_deck.lastFired = null;
  return s.trigger_deck;
}
function step3TriggerTick(save, readyFn, opts) {
  if (!step3Enabled("trigger_deck", opts)) return { fired: null, waiting: [], reason: "disabled" };
  const s = step3EnsureDefaults(save);
  const ready = s.trigger_deck.slots.filter(slot => readyFn(slot)).sort((a, b) => a.priority - b.priority);
  if (!ready.length) return { fired: null, waiting: [] };
  // Mỗi tick tối đa 1 cơ quan phát động (ưu tiên cao nhất); các cơ quan đủ điều
  // kiện còn lại chờ tick sau — không đệ quy: kỹ năng phát động không được xét
  // lại thành điều kiện của cơ quan khác trong cùng tick.
  const fired = ready[0], waiting = ready.slice(1);
  s.trigger_deck.lastFired = fired.skill;
  return { fired, waiting };
}
function step3TriggerOfflineTick() {
  // Edge Bước 1/v2.3: Cơ Quan Phổ KHÔNG phát động trong offline catch-up;
  // trạng thái chờ không cộng dồn qua phiên offline. Hàm này cố ý không chạm save.
  return { fired: null, waiting: [], reason: "offline_catchup_no_trigger" };
}
function step3TriggerTryNow(save, readyFn, cooldowns, opts) {
  // Nút "Thử ngay": chạy thử với chỉ số hiện tại, không tốn lượt, không tiêu
  // cooldown, không rơi thưởng, không đổi state. cooldowns chỉ được đọc.
  const s = step3EnsureDefaults(save);
  const ordered = s.trigger_deck.slots.slice().sort((a, b) => a.priority - b.priority);
  const blocked = opts && opts.blockedSkills ? new Set(opts.blockedSkills) : new Set();
  let wouldFire = null;
  const reasons = ordered.map(slot => {
    if (blocked.has(slot.skill)) return { skill: slot.skill, reason: "bị cấm trong idle" };
    if (!readyFn(slot)) return { skill: slot.skill, reason: "chưa đủ điều kiện" };
    if (!wouldFire) { wouldFire = slot; return { skill: slot.skill, reason: "sẽ phát động đầu tiên" }; }
    return { skill: slot.skill, reason: "chờ tick sau" };
  });
  void cooldowns;
  return { wouldFire, reasons };
}
// --- Đồng hành (companion): 1 bản đầu, render tái dùng drawPet, 1 Khí Tràng ---
function step3CompanionAdopt(save, tid, opts) {
  if (!step3Enabled("companion", opts)) throw new Error("Đồng hành chưa mở");
  const s = step3EnsureDefaults(save);
  s.companion = { tid, level: 1, aura: null, autoRevive: false, alive: true, pendingRevive: false, auraLostSince: null };
  return s.companion;
}
function step3CompanionSetAura(save, auraId, opts) {
  if (!step3Enabled("companion", opts)) throw new Error("Đồng hành chưa mở");
  if (!STEP3_AURAS.includes(auraId)) throw new Error("Khí Tràng không có trong 3 lựa chọn bản đầu");
  const s = step3EnsureDefaults(save);
  if (!s.companion) throw new Error("Chưa có Đồng hành");
  s.companion.aura = auraId; // mỗi lần chỉ 1 Khí Tràng: chọn mới thay thế chọn cũ
  return auraId;
}
function step3CompanionDamage(dmg, targetKind) {
  return targetKind === "boss" ? dmg * STEP3_COMPANION_BOSS_DMG_MUL : dmg;
}
function step3CompanionFall(save, gold, inBattle) {
  const s = step3EnsureDefaults(save);
  if (!s.companion) throw new Error("Chưa có Đồng hành");
  const c = s.companion;
  if (c.autoRevive && gold >= STEP3_COMPANION_REVIVE_COST) {
    save.gold = gold - STEP3_COMPANION_REVIVE_COST;
    c.alive = true; c.pendingRevive = !!inBattle;
    // Hồi sinh giữa trận chỉ có tác dụng từ trận sau nếu reload/giữa trận (v2.3).
    return { revived: true, auraActiveNow: !inBattle, report: "Đồng hành tự hồi sinh." };
  }
  c.alive = false; c.auraLostSince = Date.now();
  if (!c.autoRevive) return { revived: false, auraActive: false, report: "Đồng hành chờ người chơi bấm hồi sinh." };
  return { revived: false, auraActive: false, report: "Đồng hành chưa hồi sinh vì thiếu vàng" };
}
// --- Chiến Tích Linh Phù (trophy_charm): 3 bản đầu, chiếm ô túi, chỉ tác dụng trong túi ---
function step3TrophyCharmAdd(save, charmId, opts) {
  if (!step3Enabled("trophy_charm", opts)) throw new Error("Chiến Tích Linh Phù chưa mở");
  const charm = STEP3_TROPHY_CHARMS.find(c => c.id === charmId);
  if (!charm) throw new Error("Linh Phù không có trong 3 bản đầu");
  const s = step3EnsureDefaults(save);
  const inv = Array.isArray(save.inv) ? save.inv : (save.inv = []);
  const max = typeof INV_MAX === "number" ? INV_MAX : 60;
  if (inv.length >= max) throw new Error("Túi đầy (60 ô), không thêm được Linh Phù");
  inv.push({ charmId: charm.id, level: 1, locked: false, base: [0], mag: [] });
  return true;
}
function step3TrophyCharmEffects(save) {
  const inv = Array.isArray(save.inv) ? save.inv : [];
  return inv.filter(it => it && STEP3_TROPHY_CHARMS.some(c => c.id === it.charmId))
    .map(it => { const c = STEP3_TROPHY_CHARMS.find(x => x.id === it.charmId);
      // % hiệu lực giữ nguyên số sim khóa ở cấp 1; nâng cấp ở Bước 3 chỉ tăng
      // cấp/tiến độ — % tăng theo cấp cần sim riêng ở Bước 4, không tự tăng ngầm.
      return { id: c.id, effect: c.effect, bonus: c.bonus, level: it.level || 1 }; });
}
function step3AutoCleanCandidates(inv) {
  // Linh Phù đã khóa được bảo vệ khỏi tự dọn như đồ khóa/đồ bộ/đồ đã cường hóa;
  // Linh Phù chưa khóa được tự dọn theo bộ lọc như đồ thường (§5 v2.3).
  return (Array.isArray(inv) ? inv : []).filter(it => !(it && it.charmId && it.locked));
}
function step3TrophyKill(save, bossId, opts) {
  if (!step3Enabled("trophy_charm", opts)) throw new Error("Chiến Tích Linh Phù chưa mở");
  const s = step3EnsureDefaults(save);
  const n = (s.trophy_charm.pityByBoss[bossId] || 0) + 1;
  if (n >= STEP3_TROPHY_PITY) { s.trophy_charm.pityByBoss[bossId] = 0; s.trophy_charm.trophies += 1; }
  else s.trophy_charm.pityByBoss[bossId] = n;
  return s.trophy_charm.trophies;
}
function step3TrophyUpgrade(save, charmId, opts) {
  if (!step3Enabled("trophy_charm", opts)) throw new Error("Chiến Tích Linh Phù chưa mở");
  const s = step3EnsureDefaults(save);
  const it = (Array.isArray(save.inv) ? save.inv : []).find(x => x && x.charmId === charmId);
  if (!it) throw new Error("Linh Phù không có trong túi — chỉ nâng được Linh Phù trong túi");
  if (s.trophy_charm.trophies < 1) throw new Error("Chưa đủ Kỷ vật để nâng");
  s.trophy_charm.trophies -= 1; it.level = (it.level || 1) + 1;
  return true;
}
