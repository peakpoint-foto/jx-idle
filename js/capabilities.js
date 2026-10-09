"use strict";

const FEATURE_REGISTRY = Object.freeze({
  skill_graph: { modes: ["ctc","phlt","g2"], enabled: true, online: false },
  build_profiles: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  build_advice: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  combat_policy: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  loot_codex: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  safe_workbench: { modes: ["phlt","g2"], enabled: false, online: false },
  context_guide: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  feedback_diagnostics: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  phased_boss: { modes: ["ctc"], enabled: false, online: false },
  combat_reports: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  training_lab: { modes: ["g2"], enabled: false, online: false },
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
  guild_management: { modes: ["ctc"], enabled: false, online: true },
  online_economy: { modes: ["ctc"], enabled: false, online: true },
  resource_summary: { modes: ["ctc","phlt","g2"], enabled: false, online: false },
  // `requires` lists features that must also be on for a given mode, so a mode-specific rollout flag gates a shared feature.
  room_presence: { modes: ["ctc","phlt"], enabled: true, online: true, requires: { phlt: ["coop_rescue"] } },
  party_lobby: { modes: ["ctc","phlt"], enabled: false, online: true, requires: { phlt: ["coop_rescue"] } },
  party_combat: { modes: ["ctc","phlt","g2"], enabled: false, online: true, requires: { phlt: ["coop_rescue","party_lobby"] } },
  coop_rescue: { modes: ["phlt"], enabled: false, online: true },
  weekly_trial: { modes: ["phlt"], enabled: false, online: true, requires: { phlt: ["coop_rescue"] } },
  party_dungeon: { modes: ["ctc"], enabled: false, online: true },
  party_siege: { modes: ["ctc"], enabled: false, online: true },
  ranked_seasons: { modes: ["ctc"], enabled: false, online: true },
  online_account_phlt: { modes: ["phlt"], enabled: false, online: true },
  online_account_g2: { modes: ["g2"], enabled: false, online: true },
  seasonal_challenge: { modes: ["ctc","phlt","g2"], enabled: false, online: true },
  trading: { modes: ["ctc"], enabled: false, online: true },
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
