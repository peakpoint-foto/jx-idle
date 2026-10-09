import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = [
  "data.js", "world.js", "js/core.js", "js/skill_graph.js", "js/workflow_rules.js", "js/modes.js", "js/capabilities.js", "js/stats.js",
  "js/combat_contract.js", "js/content.gen.js", "js/season_themes.js", "js/content.js", "js/rift_rules.js", "js/session_combat.js", "js/loot.js", "js/weapon_policy.js", "js/gear_policy.js", "rdata.js", "js/sets.js", "ref.js",
  "js/recipes.js", "js/combat.js", "js/stage_policy.js", "js/save.js", "js/save_waves.js", "js/save_schema.js", "js/offline_report.js", "js/ui.js", "js/shop.js",
  "js/rewards.js", "js/siege.js", "js/activities.js", "js/depth.js", "js/potion_policy.js",
  "js/builds.js", "js/build_profiles.js", "js/training.js", "js/rift_tower.js", "js/build_compare.js", "js/build_advice.js", "js/build_advice_ui.js", "js/build_library.js", "js/loot_codex.js", "js/combat_policy.js", "js/journal.js", "js/forge.js", "js/gold_sinks.js", "js/auto.js", "js/survival.js", "js/svfinal.js",
  "js/modes_play.js", "js/online.js", "js/context_guide.js", "js/feedback_context.js", "js/telemetry.js", "js/workflow_overrides.js", "js/activity_hardening.js", "js/stash_policy.js", "js/stash.js", "js/skill_graph_ui.js", "js/combat_reports.js", "js/boss_phases.js", "js/expedition.js", "js/expedition_travel.js", "js/expedition_routes.js", "js/expedition_forks.js", "js/element_reactions.js", "js/combo.js", "js/guild_tech_ui.js", "js/expedition_knowledge.js", "js/workbench.js", "js/resource_summary.js", "js/online_sessions.js", "js/ranked_seasons.js", "js/weekly_trial.js", "js/event_calendar.js", "js/codex_waves.js", "js/onboarding_goals.js", "js/standard_gear.js", "js/community_challenge.js", "js/rift.js", "js/build_progression.js", "js/build_progression_ui.js", "js/weekly_tasks.js",
];
const sources = files.map(file => [file, fs.readFileSync(root + file, "utf8")]);

// Real game rules, isolated IO. Timers are queued, never run implicitly.
export function game(seed = 42) {
  const noop = () => {};
  const element = new Proxy(noop, {
    get: (_, key) => key === "style" ? {} : key === "classList"
      ? { add: noop, remove: noop, toggle: noop, contains: () => false }
      : key === "checked" ? true : element,
    set: () => true, apply: () => element,
  });
  const storage = new Map(), timers = [], requests = [];
  let failWrites = false;
  const math = Object.create(Math);
  math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const now = Date.UTC(2026, 9, 7, 12);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = {
    console, Date: Clock, Math: math, Map, Set, JSON, performance, TextEncoder,
    setInterval: noop, setTimeout: fn => { timers.push(fn); return timers.length; },
    clearInterval: noop, clearTimeout: noop, requestAnimationFrame: noop,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { if (failWrites) throw new Error("storage blocked"); storage.set(key, String(value)); },
      removeItem: key => storage.delete(key), clear: () => storage.clear(),
    },
    document: { querySelector: () => element, querySelectorAll: () => [], getElementById: () => element,
      body: element, documentElement: element, addEventListener: noop },
    location: { reload: noop, hostname: "localhost", protocol: "http:" }, navigator: {},
    matchMedia: () => ({ matches: false }), addEventListener: noop, Image: function () {},
    fetch: (...args) => { requests.push(args); throw new Error("network forbidden in workflow tests"); },
    img: () => null, uiSfx: noop, log: noop, toast: noop, burst: noop, addText: noop,
    closeModal: noop, modal: noop, refresh: noop, dotGift: noop, draw: noop, svDraw: noop,
    resizeArena: noop, snapCamera: noop, obsLoad: noop, playMusic: noop, preloadZoneSounds: noop,
    viFixItem: noop, jrAdd: noop, OBS: { g: null }, INPUT: {}, confirm: () => true, invDirty: false,
    curTab: "log", refreshGift: noop, renderPad: noop, checkHints: noop, manual: () => false,
    btoa: s => Buffer.from(s, "binary").toString("base64"),
    atob: s => Buffer.from(s, "base64").toString("binary"),
  };
  context.window = context;
  vm.createContext(context);
  for (const [file, source] of sources) vm.runInContext(source, context, { filename: file });
  vm.runInContext(`
    log=()=>{}; toast=()=>{}; refresh=()=>{}; dotGift=()=>{};
    function fixture(mode='ctc',lvl=60) {
      localStorage.clear(); collectionsCache=null; MODE_CTX=null; SAVE_LOCK=false;
      S=Object.assign(newSave(),{fac:'shaolin',mode,lvl,sexSet:1,attrPts:(lvl-1)*5,
        skPts:lvl-1,speed:MODES[mode].defSpeed});
      S.sk[FAC.shaolin.starter]=1; S.main=FAC.shaolin.starter;
      Object.assign(R,{tower:null,tk:null,town:null,enemies:[],ground:[],P:null,life:1,mana:1,kills:0});
      SV.on=false; R.P=calc(); R.life=R.P.life; R.mana=R.P.mana; RW();
    }
  `, context);
  return {
    run: code => vm.runInContext(code, context),
    json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    storage, requests,
    failWrites: value => { failWrites = value; },
    flush: () => { while (timers.length) timers.shift()(); },
  };
}
