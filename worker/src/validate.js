// Kiểm định nhân vật Công Thành Chiến bằng chính code của game (worker/gen/game.js).
// Máy chủ không tin chỉ số do client gửi: tự tính lại bằng calc() và soi từng món trang bị.
import { GAME as G } from "../gen/game.js";

export const BRACKETS = [
  { k: "so", n: "Sơ cấp", lo: 40, hi: 79 },
  { k: "trung", n: "Trung cấp", lo: 80, hi: 99 },
  { k: "cao", n: "Cao cấp", lo: 100, hi: 119 },
  { k: "thuong", n: "Thượng thừa", lo: 120, hi: Infinity },
];
export const bracketOf = (lvl) => BRACKETS.find((b) => lvl >= b.lo && lvl <= b.hi) || null;

/* ---- Ngưỡng cấp theo giờ chơi ----
   Mỗi cấp L cần (10 + 1.4L) × xpSlow(L) lần hạ quái cùng cấp (xem expFor/gainXp trong combat.js).
   Ước lượng cố ý rộng tay: tối đa 3 quái/giây (đã tính Lệnh bài Triệu hồi nhân ba số quái) và hệ số EXP ×4 (tinh anh, boss, quái cao cấp hơn, đồ cộng EXP),
   cộng thêm 25% và 1 giờ dự phòng. Chỉ nhân vật vượt xa mức này mới bị gắn cờ. */
export const LV_TIME = { kps: 3, xpMul: 4, slack: 1.25, graceSec: 3600 };
const LV_SEC = [0, 0];
for (let L = 1; L <= G.MAX_LEVEL; L++)
  LV_SEC[L + 1] = LV_SEC[L] + ((10 + 1.4 * L) * G.xpSlow(L)) / (LV_TIME.kps * LV_TIME.xpMul);

// Số giây chơi tối thiểu (đã cộng dự phòng) để đạt cấp lvl.
export const minSecForLevel = (lvl) => Math.max(0, LV_SEC[Math.min(lvl, G.MAX_LEVEL)] * LV_TIME.slack - LV_TIME.graceSec);

export function levelCapForTime(sec) {
  let L = 1;
  while (L < G.MAX_LEVEL && minSecForLevel(L + 1) <= sec) L++;
  return L;
}

/* ---- Trang bị ---- */
// Giá trị tuyệt đối lớn nhất mỗi thuộc tính phụ có thể roll ra (dòng đầu p[0]).
const AFFIX_MAX = new Map();
for (const a of G.J.affix) {
  const [mn, mx] = a.p[0] || [0, 0];
  const v = Math.max(Math.abs(mn), Math.abs(mx));
  AFFIX_MAX.set(a.a, Math.max(AFFIX_MAX.get(a.a) || 0, v));
}
const LINE_SCALE_MAX = 1.18; // lineScale() trong loot.js tối đa 1 + 0.18
const MAG_MAX = 6;

function checkItem(it, slot, flags, pending) {
  const where = `${slot}: ${String(it && it.n || "?").slice(0, 40)}`;
  if (!it || typeof it !== "object") return flags.push(["item_bad", where]);
  if (!G.modeItemOk(it, "ctc")) flags.push(["item_mode", `${where} vượt trần đồ Công Thành Chiến`]);
  const group = G.J.items[it.d];
  const row = group && group.list.find((r) => r.k === it.k && r.lvl === it.lvl);
  if (!row) return flags.push(["item_base", `${where} không có trong dữ liệu game`]);
  if (!Array.isArray(it.base)) return flags.push(["item_base", `${where} thiếu chỉ số gốc hợp lệ`]);
  for (const b of it.base) {
    if (!Array.isArray(b) || b.length < 3 || !Number.isFinite(+b[1]) || !Number.isFinite(+b[2])) {
      flags.push(["item_base", `${where} có chỉ số gốc không phải số hữu hạn`]);
      continue;
    }
    const [id, mn, mx] = b;
    const rb = row.base.find((b) => b[0] === id);
    if (!rb) flags.push(["item_base", `${where} có chỉ số gốc lạ (${id})`]);
    else if (Math.abs(mn) > Math.abs(rb[1]) + 0.5 || Math.abs(mx) > Math.abs(rb[2]) + 0.5)
      flags.push(["item_base", `${where} chỉ số gốc ${id} vượt khoảng ${rb[1]}–${rb[2]}`]);
  }
  if (it.req != null && !Array.isArray(it.req)) flags.push(["item_base", `${where} có yêu cầu trang bị hỏng`]);
  if ((it.mag != null && !Array.isArray(it.mag)) || (it.ext != null && !Array.isArray(it.ext)))
    flags.push(["item_affix", `${where} có danh sách thuộc tính hỏng`]);
  const mag = Array.isArray(it.mag) ? it.mag : [];
  if (mag.length > MAG_MAX) flags.push(["item_affix", `${where} có ${mag.length} dòng thuộc tính`]);
  const seen = new Set();
  for (const m of mag.concat(Array.isArray(it.ext) ? it.ext : [])) {
    if (!m || typeof m !== "object" || !Array.isArray(m.p) || !m.p.every(v => v === -1 || Number.isFinite(+v))) {
      flags.push(["item_affix", `${where} có dòng thuộc tính không phải số hữu hạn`]);
      continue;
    }
    if (seen.has(m.a)) flags.push(["item_affix", `${where} lặp thuộc tính ${m.a}`]);
    seen.add(m.a);
    if (G.isElementSkillAttr(G.attrName(m?.a)) && (!Number.isInteger(m?.p?.[0]) || m.p[0] < 0 || m.p[0] > 1))
      pending.push(["item_policy_pending", `${where} có dòng cộng cấp kỹ năng hệ vượt +1; cần chuẩn hóa dữ liệu trước khi xếp hạng`]);
    const cap = AFFIX_MAX.get(m && m.a);
    const v = Math.abs(+(m && m.p && m.p[0]) || 0);
    if (cap === undefined) flags.push(["item_affix", `${where} có thuộc tính lạ (${m && m.a})`]);
    else if (v > cap * LINE_SCALE_MAX + 1) flags.push(["item_affix", `${where} thuộc tính ${m.a} = ${v} > ${Math.round(cap * LINE_SCALE_MAX)}`]);
  }
  if (!Number.isInteger(it.enh || 0) || (it.enh | 0) < 0 || (it.enh | 0) > G.ENH_MAX)
    flags.push(["item_enh", `${where} cường hóa +${it.enh} vượt giới hạn`]);
}

/* ---- Toàn bộ nhân vật ---- */
const ATTR_SLACK = 120, SKILL_SLACK = 25;
// Điểm tiềm năng thưởng ngoài lên cấp: mốc cấp (theo cấp đã đạt), thành tựu, điểm danh 30 ngày (một lần),
// cộng nguồn lặp lại theo thời gian chơi (điểm danh 7 ngày, cửa hàng công thành/Tống Kim, rương Phúc Duyên…).
const ptsOf = (g) => (g && +g.pts) || 0;
const ATTR_ONCE = G.ACH.reduce((s, a) => s + ptsOf(a[3]), 0) + Object.values(G.LOGIN30).reduce((s, g) => s + ptsOf(g), 0);
const attrMilestones = (lvl) => G.LV_MS.reduce((s, [lv, g]) => s + (lvl >= lv ? ptsOf(g) : 0), 0);
export const ATTR_PER_HOUR = 20, ATTR_GUEST_TIME = 400, REBORN_PTS = 50, DA_TAU_ATTR_WEEKLY = 5;
export function attrBudget(state, playSec) {
  const lvl = Math.floor(state.lvl), reborn = Math.max(0, +(state.rw && state.rw.stat && state.rw.stat.reborn) || 0);
  // Nguồn lặp lại tính theo giờ chơi nhưng có trần theo cấp, để chơi rất lâu cũng không mở toang giới hạn.
  const timed = Math.min(playSec != null ? Math.ceil((playSec / 3600) * ATTR_PER_HOUR) : ATTR_GUEST_TIME, 40 + lvl * 4);
  // Dã Tẩu PHLT/2.0 has a server ledger cap of five points per UTC week.
  // Keep that small recurring source inside the validation budget so a valid
  // character is not flagged merely because the weekly reward was claimed.
  return (lvl - 1) * G.PTS_PER_LEVEL + ATTR_SLACK + attrMilestones(lvl) + ATTR_ONCE + reborn * REBORN_PTS + timed + DA_TAU_ATTR_WEEKLY;
}

// Trả về { flags: [[code, detail]], power, bracket, P } . playSec: giờ chơi máy chủ đã đo (null với khách).
export function validateChar(state, playSec) {
  const flags = [];
  const pending = [];
  const lvl = Math.floor(state.lvl);
  for (const [slot, it] of Object.entries(state.eq || {})) if (it) checkItem(it, slot, flags, pending);
  if (!Array.isArray(state.inv)) flags.push(["item_container", "Hành trang không phải danh sách"]);
  else state.inv.forEach((it, i) => checkItem(it, `inv[${i}]`, flags, pending));
  if (state.ground != null && !Array.isArray(state.ground)) flags.push(["item_container", "Đồ trên đất không phải danh sách"]);
  else if (Array.isArray(state.ground)) state.ground.forEach((drop, i) => checkItem(drop && drop.it, `ground[${i}]`, flags, pending));

  const attr = state.attr || {};
  const attrUsed = ["str", "dex", "vit", "eng"].reduce((s, k) => s + Math.max(0, +attr[k] || 0), 0) + Math.max(0, +state.attrPts || 0);
  const attrMax = attrBudget(state, playSec);
  if (attrUsed > attrMax) flags.push(["attr_points", `Điểm tiềm năng ${attrUsed} > ${attrMax}`]);

  let skUsed = Math.max(0, +state.skPts || 0);
  const ownSkills = G.FAC[state.fac] ? new Set(G.FAC[state.fac].skills.map(String)) : null;
  for (const [id, v] of Object.entries(state.sk || {})) {
    const lv = Math.max(0, +v || 0), sk = G.SK[id];
    skUsed += lv;
    if (!sk) flags.push(["skill", `Kỹ năng lạ (${id})`]);
    else if (ownSkills && !ownSkills.has(String(id))) flags.push(["skill", `${sk.n} không thuộc môn phái ${state.fac}`]);
    else if (lv > (sk.max || 20) + 5) flags.push(["skill", `${sk.n} cấp ${lv} > ${sk.max}`]);
  }
  const skMax = (lvl - 1) * G.SKILL_PTS_PER_LEVEL + 1 + SKILL_SLACK;
  const reborn = Math.max(0, +(state.rw && state.rw.stat && state.rw.stat.reborn) || 0);
  if (reborn > 5) flags.push(["rebirth_count", `Số lần chuyển sinh ${reborn} vượt giới hạn 5`]);
  if (reborn > 0) {
    // The client legitimately keeps skill points after rebirth, but the current
    // server has no signed level-180 checkpoint/history to prove the allowance.
    // Do not call this cheating: keep the character out of the ladder pending
    // verification instead of creating a sticky false-positive flag.
    pending.push(["rebirth_skill_history", `Có ${reborn} lần chuyển sinh nhưng chưa có lịch sử cấp server để xác minh ngân sách kỹ năng`]);
  } else if (skUsed > skMax) {
    flags.push(["skill_points", `Điểm kỹ năng ${skUsed} > ${skMax}`]);
  }

  if (playSec != null && lvl > levelCapForTime(playSec))
    flags.push(["level_time", `Cấp ${lvl} sau ${(playSec / 3600).toFixed(1)} giờ chơi (tối đa ${levelCapForTime(playSec)})`]);

  // Chỉ số do máy chủ tự tính.
  let P = null, power = 0;
  try {
    // Bổ sung trường thiếu bằng giá trị mặc định (migrate() của game cần cả code giao diện).
    const s = Object.assign(G.newSave(), JSON.parse(JSON.stringify(state)));
    s.mode = "ctc";
    G.setS(s);
    P = G.calc();
    power = Math.round(G.power(P));
  } catch (e) {
    flags.push(["calc", "Không tính được chỉ số nhân vật"]);
  }
  return { flags, pending, power, bracket: bracketOf(lvl), P };
}

export const FLAG_TEXT = {
  item_bad: "Trang bị hỏng",
  item_mode: "Trang bị vượt giới hạn chế độ",
  item_base: "Trang bị vượt giới hạn",
  item_affix: "Thuộc tính trang bị vượt giới hạn",
  item_enh: "Cường hóa vượt giới hạn",
  item_container: "Kho đồ không hợp lệ",
  attr_points: "Điểm tiềm năng vượt giới hạn",
  skill: "Kỹ năng vượt giới hạn",
  skill_points: "Điểm kỹ năng vượt giới hạn",
  level_time: "Cấp vượt ngưỡng giờ chơi",
  calc: "Dữ liệu nhân vật bất thường",
};
