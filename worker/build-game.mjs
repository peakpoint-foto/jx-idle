// Đóng gói mã game (script cổ điển chạy trên trình duyệt) thành một module ES cho Worker,
// để máy chủ tính chỉ số và kiểm định nhân vật bằng đúng code của game thay vì viết lại.
// Chạy tự động trước mỗi lần `wrangler dev/deploy` (build.command trong wrangler.jsonc).
// Kết quả: worker/gen/game.js (không commit).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "worker/gen/game.js");

// Đúng thứ tự trong index.html. Chỉ những file calc() và kiểm định cần.
const FILES = [
  "data.js", "world.js", "js/core.js", "js/skill_graph.js", "js/modes.js", "js/capabilities.js", "js/stats.js", "js/combat_contract.js", "js/rift_rules.js", "js/content.js", "js/session_combat.js", "js/element_reactions.js", "js/expedition_forks.js", "js/feedback_context.js", "js/loot.js",
  "js/sets.js", "js/combat.js", "js/save.js", "js/save_schema.js", "js/rewards.js", "js/depth.js", "js/standard_gear.js",
];
// File chỉ chứa một object dữ liệu lớn: nhúng dạng chuỗi JSON (JSON.parse nhanh hơn literal JS).
const DATA = { "data.js": "JX", "world.js": "JW" };

// Những gì module trả về cho máy chủ.
const EXPORTS = [
  "isElementSkillAttr", "normalizeElementSkillItem", "attrName",
  "calc", "power", "newSave", "makeItem", "modeItemOk", "itemPower", "baseRow", "lineScale", "reqOk", "isMode",
  "rollMagicLine", "seededRng", "rerollSeedFor", "REROLL_SEED_V",
  "expNeed", "xpSlow", "J", "FAC", "SK", "MAX_LEVEL", "PTS_PER_LEVEL", "SKILL_PTS_PER_LEVEL", "ENH_MAX",
  "LV_MS", "ACH", "LOGIN30",
  "skillSupportLinks", "factionSkillGraph",
  "COMBAT_MODEL_VERSION", "combatModelDescriptor", "combatEvent",
  "applyPart", "hitPercent", "heroGuard",
  "tickEnemyStatuses",
  "CHALLENGE_VERSION", "CHALLENGE_PRESETS", "challengeBudgets", "challengeSpecCheck", "challengeSave", "standardGear",
  "JX_CONTENT", "eventScheduled", "eventsForWeek", "SESSION_COMBAT", "SESSION_SIEGE", "SESSION_RESCUE", "SESSION_TRIAL", "sessionTrialRule", "sessionTrialMutator", "sessionActor", "sessionCombatNew", "sessionCombatStep",
  "RIFT_RULES", "RIFT_MODIFIERS", "riftModifiersValid", "riftStats", "riftChoices",
  "featureEnabled", "featureConfigSnapshot", "parseFeatureFlags",
  "redactFeedbackText", "cleanFeedbackDiagnostics", "cleanFeedbackContext",
];

function dataFile(file, key) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx, { filename: file });
  const obj = ctx.window[key];
  // JSON chỉ giữ nguyên dữ liệu nếu không có undefined, NaN/Infinity, hàm hay kiểu lạ.
  const check = (v, at) => {
    const t = typeof v;
    if (v === null || t === "string" || t === "boolean") return;
    if (t === "number") { if (!Number.isFinite(v)) throw new Error(`${file}: ${at} = ${v} không chuyển được sang JSON`); return }
    if (t !== "object") throw new Error(`${file}: ${at} có kiểu ${t}`);
    for (const k of Object.keys(v)) check(v[k], at + "." + k);
  };
  check(obj, key);
  const json = JSON.stringify(obj);
  return `window.${key}=JSON.parse(${JSON.stringify(json)});\n`;
}

// Content data-driven (mục 0.2): JSON là nguồn duy nhất, validate ở build time.
// Build fail ngay nếu JSON sai schema — worker và client đọc cùng định nghĩa.
const __contentSrc = fs.readFileSync(path.join(ROOT, "js/content.js"), "utf8");
const __contentCtx = {};
vm.runInNewContext(__contentSrc, __contentCtx, { filename: "js/content.js" });
function __loadContent(file, validate) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  validate(data);
  return data;
}
const __contentData = {
  trial: __loadContent("data/content/trial.v1.json", __contentCtx.validateTrialRules),
  events: __loadContent("data/content/events.v2.json", __contentCtx.validateEventFlags),
  trialMutators: __loadContent("data/content/trial_mutators.v1.json", __contentCtx.validateTrialMutators),
  riftModifiers: __loadContent("data/content/rift_modifiers.v1.json", __contentCtx.validateRiftModifiers),
  seasonThemes: __loadContent("data/content/season_themes.v1.json", __contentCtx.validateSeasonThemes),
  legendaryAffixes: __loadContent("data/content/legendary_affixes.v1.json", __contentCtx.validateLegendaryAffixes),
  factionStories: __loadContent("data/content/faction_stories.v1.json", __contentCtx.validateFactionStories),
};
// JX_CONTENT có mặt trong bundle trước mọi file game (kể cả js/content.js và js/session_combat.js).
// Deep-freeze để giữ nguyên semantics bất biến như bản hardcode Object.freeze lồng nhau trước đây.
let body = `const JX_CONTENT=${JSON.stringify(__contentData)};\n` +
  `Object.freeze(JX_CONTENT);Object.freeze(JX_CONTENT.trial);Object.freeze(JX_CONTENT.trial.rules);` +
  `for(const r of JX_CONTENT.trial.rules)Object.freeze(r);` +
  `Object.freeze(JX_CONTENT.trial.lengths);Object.freeze(JX_CONTENT.events);Object.freeze(JX_CONTENT.events.slots);Object.freeze(JX_CONTENT.trialMutators);Object.freeze(JX_CONTENT.trialMutators.mutators);for(const m of JX_CONTENT.trialMutators.mutators)Object.freeze(m);Object.freeze(JX_CONTENT.riftModifiers);Object.freeze(JX_CONTENT.riftModifiers.modifiers);for(const m of JX_CONTENT.riftModifiers.modifiers)Object.freeze(m);\n`;
for (const f of FILES) {
  body += `// ---- ${f}\n`;
  body += DATA[f] ? dataFile(f, DATA[f]) : fs.readFileSync(path.join(ROOT, f), "utf8") + "\n";
}

const out = `// TỰ SINH bởi worker/build-game.mjs — không sửa tay.
const window = globalThis;
const noop = () => {};
const stubEl = new Proxy(function () {}, { get: (t, k) => (k === "style" ? {} : k === "classList" ? { add: noop, remove: noop, toggle: noop, contains: () => false } : stubEl), apply: () => stubEl, set: () => true });
for (const [k, v] of Object.entries({
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: new Proxy({}, { get: () => () => stubEl }),
  Image: function () {},
  matchMedia: () => ({ matches: false, addEventListener: noop }),
})) if (!(k in globalThis)) globalThis[k] = v;
export const GAME = (function () {
${body}
return {
  setS(v) { S = v },
  getS() { return S },
  R,
  ${EXPORTS.join(",\n  ")}
};
})();
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`game bundle: ${OUT} (${(out.length / 1048576).toFixed(2)} MB)`);
