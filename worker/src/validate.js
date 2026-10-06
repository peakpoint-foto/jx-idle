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
   Ước lượng cố ý rộng tay: tối đa 2 quái/giây và hệ số EXP ×4 (tinh anh, boss, quái cao cấp hơn, đồ cộng EXP),
   cộng thêm 25% và 1 giờ dự phòng. Chỉ nhân vật vượt xa mức này mới bị gắn cờ. */
export const LV_TIME = { kps: 2, xpMul: 4, slack: 1.25, graceSec: 3600 };
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

function checkItem(it, slot, flags) {
  const where = `${slot}: ${String(it && it.n || "?").slice(0, 40)}`;
  if (!it || typeof it !== "object") return flags.push(["item_bad", where]);
  if (!G.modeItemOk(it, "ctc")) flags.push(["item_mode", `${where} vượt trần đồ Công Thành Chiến`]);
  const group = G.J.items[it.d];
  const row = group && group.list.find((r) => r.k === it.k && r.lvl === it.lvl);
  if (!row) return flags.push(["item_base", `${where} không có trong dữ liệu game`]);
  for (const [id, , mx] of it.base || []) {
    const rb = row.base.find((b) => b[0] === id);
    if (!rb) flags.push(["item_base", `${where} có chỉ số gốc lạ (${id})`]);
    else if (Math.abs(mx) > Math.abs(rb[2]) + 0.5) flags.push(["item_base", `${where} chỉ số gốc ${id} = ${mx} > ${rb[2]}`]);
  }
  const mag = Array.isArray(it.mag) ? it.mag : [];
  if (mag.length > MAG_MAX) flags.push(["item_affix", `${where} có ${mag.length} dòng thuộc tính`]);
  for (const m of mag) {
    const cap = AFFIX_MAX.get(m && m.a);
    const v = Math.abs(+(m && m.p && m.p[0]) || 0);
    if (cap === undefined) flags.push(["item_affix", `${where} có thuộc tính lạ (${m && m.a})`]);
    else if (v > cap * LINE_SCALE_MAX + 1) flags.push(["item_affix", `${where} thuộc tính ${m.a} = ${v} > ${Math.round(cap * LINE_SCALE_MAX)}`]);
  }
  if ((it.enh | 0) > G.ENH_MAX) flags.push(["item_enh", `${where} cường hóa +${it.enh} > +${G.ENH_MAX}`]);
}

/* ---- Toàn bộ nhân vật ---- */
const ATTR_SLACK = 120, SKILL_SLACK = 25;
// Điểm tiềm năng thưởng ngoài lên cấp: mốc cấp (theo cấp đã đạt), thành tựu, điểm danh 30 ngày (một lần),
// cộng nguồn lặp lại theo thời gian chơi (điểm danh 7 ngày, cửa hàng công thành/Tống Kim, rương Phúc Duyên…).
const ptsOf = (g) => (g && +g.pts) || 0;
const ATTR_ONCE = G.ACH.reduce((s, a) => s + ptsOf(a[3]), 0) + Object.values(G.LOGIN30).reduce((s, g) => s + ptsOf(g), 0);
const attrMilestones = (lvl) => G.LV_MS.reduce((s, [lv, g]) => s + (lvl >= lv ? ptsOf(g) : 0), 0);
export const ATTR_PER_HOUR = 20, ATTR_GUEST_TIME = 400, REBORN_PTS = 50;
export function attrBudget(state, playSec) {
  const lvl = Math.floor(state.lvl), reborn = Math.max(0, +(state.rw && state.rw.stat && state.rw.stat.reborn) || 0);
  // Nguồn lặp lại tính theo giờ chơi nhưng có trần theo cấp, để chơi rất lâu cũng không mở toang giới hạn.
  const timed = Math.min(playSec != null ? Math.ceil((playSec / 3600) * ATTR_PER_HOUR) : ATTR_GUEST_TIME, 40 + lvl * 4);
  return (lvl - 1) * G.PTS_PER_LEVEL + ATTR_SLACK + attrMilestones(lvl) + ATTR_ONCE + reborn * REBORN_PTS + timed;
}

// Trả về { flags: [[code, detail]], power, bracket, P } . playSec: giờ chơi máy chủ đã đo (null với khách).
export function validateChar(state, playSec) {
  const flags = [];
  const lvl = Math.floor(state.lvl);
  for (const [slot, it] of Object.entries(state.eq || {})) if (it) checkItem(it, slot, flags);

  const attr = state.attr || {};
  const attrUsed = ["str", "dex", "vit", "eng"].reduce((s, k) => s + Math.max(0, +attr[k] || 0), 0) + Math.max(0, +state.attrPts || 0);
  const attrMax = attrBudget(state, playSec);
  if (attrUsed > attrMax) flags.push(["attr_points", `Điểm tiềm năng ${attrUsed} > ${attrMax}`]);

  let skUsed = Math.max(0, +state.skPts || 0);
  for (const [id, v] of Object.entries(state.sk || {})) {
    const lv = Math.max(0, +v || 0), sk = G.SK[id];
    skUsed += lv;
    if (!sk) flags.push(["skill", `Kỹ năng lạ (${id})`]);
    else if (lv > (sk.max || 20) + 5) flags.push(["skill", `${sk.n} cấp ${lv} > ${sk.max}`]);
  }
  const skMax = (lvl - 1) * G.SKILL_PTS_PER_LEVEL + 1 + SKILL_SLACK;
  if (skUsed > skMax) flags.push(["skill_points", `Điểm kỹ năng ${skUsed} > ${skMax}`]);

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
    const dps = (P.main && P.main.dps) || 0;
    power = Math.round(Math.sqrt(Math.max(1, P.life) * Math.max(1, dps)) * 10);
  } catch (e) {
    flags.push(["calc", "Không tính được chỉ số nhân vật"]);
  }
  return { flags, power, bracket: bracketOf(lvl), P };
}

export const FLAG_TEXT = {
  item_bad: "Trang bị hỏng",
  item_mode: "Trang bị vượt giới hạn chế độ",
  item_base: "Trang bị vượt giới hạn",
  item_affix: "Thuộc tính trang bị vượt giới hạn",
  item_enh: "Cường hóa vượt giới hạn",
  attr_points: "Điểm tiềm năng vượt giới hạn",
  skill: "Kỹ năng vượt giới hạn",
  skill_points: "Điểm kỹ năng vượt giới hạn",
  level_time: "Cấp vượt ngưỡng giờ chơi",
  calc: "Dữ liệu nhân vật bất thường",
};
