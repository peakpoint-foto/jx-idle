"use strict";

const FEATURE_REGISTRY = Object.freeze({
  skill_graph: { modes: ["ctc","phlt","g2"], enabled: true, online: false },
  build_profiles: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  gold_sinks: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  legendary_affix: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  element_reactions: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  guild_tech: { modes: ["ctc","phlt","g2"], enabled: false, online: true },
  duel_league: { modes: ["ctc","phlt","g2"], enabled: false, online: true },
  world_boss: { modes: ["ctc","phlt","g2"], enabled: false, online: true },
  faction_mechanics: { modes: ["ctc","phlt","g2"], enabled: true, online: false }, // Wave 2 (G1-1): cơ chế phái chính thức có hiệu lực cho ctc
  build_advice: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  combat_policy: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  loot_codex: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  safe_workbench: { modes: ["phlt","g2"], enabled: false, online: false },
  context_guide: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  feedback_diagnostics: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  phased_boss: { modes: ["ctc"], enabled: false, online: false },
  combat_reports: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  training_lab: { modes: ["g2"], enabled: false, online: false },
  rift_tower: { modes: ["g2"], enabled: false, online: false },
  build_library: { modes: ["g2"], enabled: false, online: false },
  build_progression: { modes: ["g2"], enabled: false, online: false },
  expedition: { modes: ["phlt"], enabled: false, online: false },
  expedition_travel: { modes: ["phlt"], enabled: false, online: false },
  expedition_routes: { modes: ["phlt"], enabled: false, online: false },
  expedition_knowledge: { modes: ["phlt"], enabled: false, online: false },
  skill_mutators: { modes: ["g2"], enabled: false, online: false },
  async_duels: { modes: ["ctc"], enabled: true, online: true },
  duel_modes: { modes: ["ctc"], enabled: false, online: true },
  guild_online: { modes: ["ctc"], enabled: true, online: true },
  mentor: { modes: ["ctc"], enabled: false, online: true },
  guild_management: { modes: ["ctc"], enabled: false, online: true },
  online_economy: { modes: ["ctc"], enabled: false, online: true },
  resource_summary: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  // `requires` lists features that must also be on for a given mode, so a mode-specific rollout flag gates a shared feature.
  room_presence: { modes: ["ctc","phlt"], enabled: true, online: true, requires: { phlt: ["coop_rescue"] } },
  party_lobby: { modes: ["ctc","phlt"], enabled: false, online: true, requires: { phlt: ["coop_rescue"] } },
  party_combat: { modes: ["ctc","phlt","g2"], enabled: false, online: true, requires: { phlt: ["coop_rescue","party_lobby"] } },
  coop_rescue: { modes: ["phlt"], enabled: false, online: true },
  weekly_trial: { modes: ["phlt"], enabled: false, online: true, requires: { phlt: ["coop_rescue"] } },
  trial_mutators: { modes: ["phlt"], enabled: false, online: false },
  event_calendar: { modes: ["ctc", "phlt", "g2"], enabled: false, online: false },
  codex_waves: { modes: ["ctc", "phlt", "g2"], enabled: false, online: false },
  onboarding_goals: { modes: ["ctc", "phlt", "g2"], enabled: false, online: false },
  community_challenge: { modes: ["g2"], enabled: false, online: true, requires: { g2: ["online_account_g2"] } },
  party_dungeon: { modes: ["ctc"], enabled: false, online: true },
  party_siege: { modes: ["ctc"], enabled: false, online: true },
  ranked_seasons: { modes: ["ctc"], enabled: false, online: true },
  online_account_phlt: { modes: ["phlt"], enabled: false, online: true },
  online_account_g2: { modes: ["g2"], enabled: false, online: true },
  seasonal_challenge: { modes: ["ctc","phlt","g2"], enabled: false, online: true },
  trading: { modes: ["ctc"], enabled: false, online: true },
  // Bước 1 jx-idle (2026-10-25, BRAINSTORM-v2.3): 7 flag mới, mặc định OFF.
  // Cả 7 đều online:false — không flag nào tự mở kênh đồng bộ mới.
  loot_records: { modes: ["ctc","phlt","g2"], enabled: true, online: false },
  appearance_change: { modes: ["ctc","phlt","g2"], enabled: true, online: false },
  // Chỉ tái dùng code/định dạng JXB1 của build_library, KHÔNG lấy mode chỉ g2 của nó.
  build_presets: { modes: ["ctc","phlt","g2"], enabled: true, online: false },
  // Quy tắc per-Thủ Lĩnh là luật ở tầng tính năng, không phải requires trong
  // registry: Thủ Lĩnh local thì 3 mode, Thủ Lĩnh CTC thì chỉ CTC qua receipt hiện có.
  farm_schedule: { modes: ["ctc","phlt","g2"], enabled: true, online: false },
  // Lát T: "Local" = chế độ chơi offline không đồng bộ, không phải mode id thứ 4
  // (registry chỉ có ctc/phlt/g2), nên đăng ký [phlt, g2] và CTC bị từ chối;
  // không chạm đồng bộ CTC/BXH/Thủ Lĩnh bang cho tới khi có shared calc +
  // validator Worker mở rộng + test D1 + claim runId do server cấp.
  trigger_deck: { modes: ["phlt","g2"], enabled: true, online: false },
  companion: { modes: ["phlt","g2"], enabled: true, online: false },
  trophy_charm: { modes: ["phlt","g2"], enabled: true, online: false },
});
let FEATURE_FLAGS = Object.freeze({});

function parseFeatureFlags(value) {
  try {
    const input = typeof value === "string" ? JSON.parse(value) : value;
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    return Object.fromEntries(Object.keys(FEATURE_REGISTRY).filter(key =>
      Object.prototype.hasOwnProperty.call(input,key) && typeof input[key] === "boolean").map(key => [key,input[key]]));
  } catch (e) { return {}; }
}

function setFeatureFlags(value) { FEATURE_FLAGS = Object.freeze(parseFeatureFlags(value)); }
function featureEnabled(feature, mode, flags, sandbox) {
  mode = mode || modeId();
  flags = flags == null ? FEATURE_FLAGS : parseFeatureFlags(flags);
  sandbox = sandbox == null ? !!(typeof ADMV !== "undefined" && ADMV.sandbox) : !!sandbox;
  if (!Object.prototype.hasOwnProperty.call(FEATURE_REGISTRY,feature) || !isMode(mode)) return false;
  const rule = FEATURE_REGISTRY[feature];
  if (!rule.modes.includes(mode) || rule.online && sandbox) return false;
  const on = Object.prototype.hasOwnProperty.call(flags,feature) ? flags[feature] : rule.enabled;
  const need = rule.requires && rule.requires[mode];
  return on && (!need || need.every(f => featureEnabled(f, mode, flags, sandbox)));
}

function featureConfigSnapshot(mode, flags, sandbox = false) {
  if (!isMode(mode)) throw new Error("Unknown mode");
  const overrides = parseFeatureFlags(flags);
  return { version: 1, mode, feature_flags: overrides,
    capabilities: Object.fromEntries(Object.keys(FEATURE_REGISTRY).map(key => [key,featureEnabled(key,mode,overrides,sandbox)])) };
}
