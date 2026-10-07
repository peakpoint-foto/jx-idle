import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = [
  "data.js", "world.js", "js/core.js", "js/workflow_rules.js", "js/modes.js", "js/stats.js",
  "js/loot.js", "js/gear_policy.js", "rdata.js", "js/sets.js", "ref.js",
  "js/recipes.js", "js/combat.js", "js/save.js", "js/ui.js", "js/shop.js",
  "js/rewards.js", "js/siege.js", "js/activities.js", "js/depth.js",
  "js/forge.js", "js/auto.js", "js/survival.js", "js/svfinal.js",
  "js/modes_play.js", "js/online.js", "js/workflow_overrides.js",
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
    console, Date: Clock, Math: math, Map, Set, JSON, performance,
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
    viFixItem: noop, OBS: { g: null }, INPUT: {}, confirm: () => true, invDirty: false,
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
