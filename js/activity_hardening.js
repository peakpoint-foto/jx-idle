/* Activity invariants shared by CTC, PHLT and 2.0 activities.
 * This file is loaded after the activity implementations and before the UI loop.
 * It deliberately treats a saved in-flight run as interrupted on reload: a
 * partially serialized combat state must never become a fresh entry.
 */
"use strict";

const ACTIVITY_RUN_VERSION = 1;
const ACTIVITY_ATTR_WEEKLY_CAP = 5;
const ACTIVITY_TOWER_NUMERIC_CAP = 1e12;
const ACTIVITY_SIEGE_POTS = 1;

function activityMode() { return typeof modeId === "function" ? modeId() : S.mode; }
function activityRuntimeKind() {
  if (S && S.activityRun && S.activityRun.kind) return S.activityRun.kind;
  if (S && S.siege) return "siege";
  if (R && R.tower) return "tower";
  if (R && R.tk) return "tk";
  if (typeof SV !== "undefined" && SV.on) return "survival";
  return null;
}
function activityBusyHard() { return !!activityRuntimeKind(); }
function activityDiff() {
  const run = S && S.activityRun;
  return run && run.diff !== undefined ? run.diff : null;
}
function activityWithDiff(fn) {
  const run = S && S.activityRun;
  if (!run || run.diff === undefined || !S) return fn();
  const old = S.diff;
  S.diff = run.diff;
  try { return fn(); } finally { S.diff = old; }
}
function activityStage() {
  if (R.tower) return { floor: R.tower.floor, endless: !!R.tower.endless };
  if (R.tk) return { wave: R.tk.wave };
  if (S.siege) return { city: S.siege.city, layer: S.siege.layer };
  if (SV && SV.on) return { seconds: Math.floor(SV.t || 0), kills: SV.kills || 0 };
  return {};
}
function activityUnderlyingActive(kind) {
  if (kind === "tower") return !!(R && R.tower);
  if (kind === "tk") return !!(R && R.tk);
  if (kind === "siege") return !!(S && S.siege);
  if (kind === "survival") return !!(typeof SV !== "undefined" && SV.on);
  return false;
}
function activitySnapshot(kind) {
  const s = activityStage();
  return {
    version: ACTIVITY_RUN_VERSION,
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind, mode: activityMode(), diff: S.diff, startedAt: Date.now(),
    baseKills: Math.max(0, S.totalKills || 0),
    stage: s, contribution: { kills: 0, cleared: 0 }, settled: false,
  };
}
let ACTIVITY_SAVING = false;
function activityCheckpoint() {
  if (!S || ACTIVITY_SAVING) return;
  const kind = activityRuntimeKind();
  if (!kind) return;
  const run = S.activityRun || activitySnapshot(kind);
  run.kind = kind; run.mode = activityMode(); run.stage = activityStage();
  run.diff = run.diff === undefined ? S.diff : run.diff;
  run.contribution = run.contribution || { kills: 0, cleared: 0 };
  const kills = kind === "survival" ? (SV.kills || 0) : Math.max(0, (S.totalKills || 0) - (run.baseKills || 0));
  run.contribution.kills = Math.max(run.contribution.kills || 0, kills);
  S.activityRun = run;
  ACTIVITY_SAVING = true;
  try { if (typeof save === "function") save(); } finally { ACTIVITY_SAVING = false; }
}
function activityStart(kind) {
  if (!S || S.activityRun) return;
  if (!activityUnderlyingActive(kind)) return;
  S.activityRun = activitySnapshot(kind);
  activityCheckpoint();
}
function activityFinish(interrupted = false) {
  if (!S) return;
  const current = activityStage(), stored = S.activityRun;
  if (stored) {
    stored.contribution = stored.contribution || { kills: 0, cleared: 0 };
    stored.contribution.kills = Math.max(stored.contribution.kills || 0,
      stored.kind === "survival" ? (SV.kills || 0) : Math.max(0, (S.totalKills || 0) - (stored.baseKills || 0)));
  }
  const completedRun = stored && Object.assign({}, stored, {
    stage: Object.keys(current).length ? current : Object.assign({}, stored.stage),
    contribution: Object.assign({}, stored.contribution || {})
  });
  if (completedRun && !interrupted && typeof activityReportOnline === "function") activityReportOnline(completedRun);
  if (S.activityRun) {
    S.activityRun.settled = true;
    S.activityRun.interrupted = !!interrupted;
  }
  S.activityRun = null;
  if (interrupted) {
    S.activityInterrupted = { at: Date.now(), kind: activityRuntimeKind() };
  }
  ACTIVITY_SAVING = true;
  try { if (typeof save === "function") save(); } finally { ACTIVITY_SAVING = false; }
}
const ACTIVITY_RECEIPT_LIMIT = 16;
let ACTIVITY_RECEIPT_RETRYING = false;
function activityReceiptKey() {
  try { return `${typeof saveKey === "function" ? saveKey() : "jx"}_activity_receipts`; } catch (_) { return "jx_activity_receipts"; }
}
function activityReceiptRead() {
  try {
    const rows = JSON.parse(localStorage.getItem(activityReceiptKey()) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter(x => x && typeof x.event_key === "string" && x.event_key.length <= 100 &&
      ["siege", "tk", "tower", "survival"].includes(x.activity) && Number.isSafeInteger(x.contribution) &&
      x.contribution >= 0 && Number.isSafeInteger(x.cleared) && x.cleared >= 0 && (x.won === 0 || x.won === 1)).slice(-ACTIVITY_RECEIPT_LIMIT);
  } catch (_) { return []; }
}
function activityReceiptWrite(rows) {
  try { localStorage.setItem(activityReceiptKey(), JSON.stringify(rows.slice(-ACTIVITY_RECEIPT_LIMIT))); return true; }
  catch (_) { return false; }
}
function activityReceiptEnqueue(run) {
  if (!run || activityMode() !== "ctc" || !["siege", "tk", "tower", "survival"].includes(run.kind)) return false;
  const stage = run.stage || {}, contribution = run.contribution || {};
  const row = {
    event_key: String(run.id || ""), activity: run.kind, contribution: Math.max(0, Math.floor(contribution.kills || 0)),
    cleared: Math.max(0, Math.floor(contribution.cleared || 0)),
    won: (run.kind === "survival" ? stage.seconds >= 600 : !!run.won) ? 1 : 0,
  };
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(row.event_key)) return false;
  const rows = activityReceiptRead();
  if (!rows.some(x => x.event_key === row.event_key)) rows.push(row);
  return activityReceiptWrite(rows);
}
async function activityRetryReceipts() {
  // Activity receipts belong to the CTC ledger; other modes never send them.
  if (ACTIVITY_RECEIPT_RETRYING || typeof onlEligible !== "function" || !onlEligible() || !S || S.mode !== "ctc" ||
      typeof onlGet !== "function" || !onlGet() || typeof onlApi !== "function") return 0;
  ACTIVITY_RECEIPT_RETRYING = true;
  let sent = 0;
  try {
    let rows = activityReceiptRead();
    while (rows.length) {
      try {
        const result = await onlApi("/activity/claim", { method: "POST", keepalive: true, body: rows[0] });
        if (!result || result.accepted !== true) break;
        rows.shift(); activityReceiptWrite(rows); sent++;
      } catch (error) {
        // Quota is authoritative and cannot recover within this period; retain
        // transient failures and stop so retries stay ordered and bounded.
        if (error && error.code === "quota_exhausted") { rows.shift(); activityReceiptWrite(rows); continue; }
        break;
      }
    }
  } finally { ACTIVITY_RECEIPT_RETRYING = false; }
  return sent;
}
function activityReportOnline(run) {
  if (!activityReceiptEnqueue(run)) return;
  activityRetryReceipts();
}
if (typeof onlRefreshMe === "function") {
  const activityOldRefreshMe = onlRefreshMe;
  onlRefreshMe = async function (...args) {
    const result = await activityOldRefreshMe.apply(this, args);
    if (result) await activityRetryReceipts();
    return result;
  };
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", activityRetryReceipts);
function activityRestoreOnLoad() {
  if (!S) return;
  const pending = S.activityRun || S.siege;
  if (!pending) return;
  const kind = S.activityRun && S.activityRun.kind || "siege";
  S.siege = null;
  S.activityRun = null;
  R.tower = null; R.tk = null; R.enemies = [];
  if (typeof SV !== "undefined") {
    SV.on = false; SV.over = true; SV.en = []; SV.gems = []; SV.shots = [];
  }
  S.wave = 1;
  S.activityInterrupted = { at: Date.now(), kind, id: pending.id || null };
  ACTIVITY_SAVING = true;
  try { if (typeof save === "function") save(); } finally { ACTIVITY_SAVING = false; }
}
function activityWrapStart(fn, kind, active) {
  return function (...args) {
    const out = fn.apply(this, args);
    if (active()) activityStart(kind);
    return out;
  };
}
function activityWrapEnd(fn, kind) {
  return function (...args) {
    const had = activityRuntimeKind() === kind || (S.activityRun && S.activityRun.kind === kind);
    if (S.activityRun && S.activityRun.kind === kind && (kind === "siege" || kind === "tk"))
      S.activityRun.won = !!args[1];
    const out = fn.apply(this, args);
    if (had) activityFinish(false);
    return out;
  };
}
function activityWrapStep(fn, kind) {
  return function (...args) {
    const out = activityWithDiff(() => fn.apply(this, args));
    if (S.activityRun && S.activityRun.kind === kind) {
      S.activityRun.stage = activityStage();
      S.activityRun.contribution = S.activityRun.contribution || { kills: 0, cleared: 0 };
      S.activityRun.contribution.cleared += 1;
      activityCheckpoint();
    }
    return out;
  };
}

if (typeof activityBusy === "function") {
  const legacyBusy = activityBusy;
  activityBusy = () => activityBusyHard() || legacyBusy();
}
if (typeof save === "function") {
  const legacySave = save;
  save = function (...args) {
    // Do not create a run while persistActivityEntry() is still deciding
    // whether the entry write succeeded. The activity wrapper creates it only
    // after the legacy start has committed its quota.
    if (!ACTIVITY_SAVING && S && S.activityRun) activityCheckpoint();
    return legacySave.apply(this, args);
  };
}
if (typeof offlineGains === "function") {
  const legacyOfflineGains = offlineGains;
  offlineGains = function (...args) {
    if (S && (S.activityRun || S.siege)) {
      S.last = Date.now();
      return null;
    }
    return legacyOfflineGains.apply(this, args);
  };
}

if (typeof towerStart === "function") towerStart = activityWrapStart(towerStart, "tower", () => !!R.tower);
if (typeof tkStart === "function") tkStart = activityWrapStart(tkStart, "tk", () => !!R.tk);
if (typeof siegeStart === "function") siegeStart = activityWrapStart(siegeStart, "siege", () => !!S.siege);
if (typeof svStart === "function") svStart = activityWrapStart(svStart, "survival", () => !!SV.on);
if (typeof towerExit === "function") towerExit = activityWrapEnd(towerExit, "tower");
if (typeof tkExit === "function") tkExit = activityWrapEnd(tkExit, "tk");
if (typeof siegeExit === "function") siegeExit = activityWrapEnd(siegeExit, "siege");
if (typeof svExit === "function") svExit = activityWrapEnd(svExit, "survival");
if (typeof towerCleared === "function") towerCleared = activityWrapStep(towerCleared, "tower");
if (typeof tkCleared === "function") tkCleared = activityWrapStep(tkCleared, "tk");
if (typeof siegeCleared === "function") siegeCleared = activityWrapStep(siegeCleared, "siege");
if (typeof towerSpawn === "function") { const f = towerSpawn; towerSpawn = (...a) => activityWithDiff(() => f(...a)); }
if (typeof tkSpawn === "function") { const f = tkSpawn; tkSpawn = (...a) => activityWithDiff(() => f(...a)); }
if (typeof siegeSpawn === "function") { const f = siegeSpawn; siegeSpawn = (...a) => activityWithDiff(() => f(...a)); }
if (typeof svSpawn === "function") { const f = svSpawn; svSpawn = (...a) => activityWithDiff(() => f(...a)); }
if (typeof svTick === "function") { const f = svTick; svTick = (...a) => activityWithDiff(() => f(...a)); }
if (typeof svRewards === "function") { const f = svRewards; svRewards = (...a) => activityWithDiff(() => f(...a)); }
if (typeof tick === "function") { const f = tick; tick = (...a) => activityWithDiff(() => f(...a)); }

// A single life potion is consumed per siege run. Mana potions remain unlimited.
if (typeof usePotion === "function") {
  const legacyUsePotion = usePotion;
  usePotion = function (kind, potion, free) {
    if (kind === "life" && S && S.siege && typeof siegePotLeft === "function" && siegePotLeft() <= 0) {
      return false;
    }
    legacyUsePotion(kind, potion, free);
    return true;
  };
}
if (typeof drinkNow === "function") {
  const legacyDrinkNow = drinkNow;
  drinkNow = function (kind) {
    if (kind === "life" && S && S.siege && typeof siegePotLeft === "function" && siegePotLeft() <= 0) return false;
    return legacyDrinkNow.apply(this, arguments);
  };
}

// Tower 2.0 has no gameplay difficulty ceiling after floor 50. The numerical
// ceiling only prevents Infinity from corrupting the save at absurd test floors.
function towerEndlessDifficulty(floor, level = S.lvl) {
  const f = Math.max(1, Math.floor(floor || 1));
  const extra = Math.max(0, f - 50);
  const growth = Math.min(ACTIVITY_TOWER_NUMERIC_CAP, Math.pow(1.018, extra));
  return {
    floor: f, level: Math.min(MAX_LEVEL, Math.max(1, level + 1)),
    hp: growth, dmg: Math.min(ACTIVITY_TOWER_NUMERIC_CAP, Math.pow(1.014, extra)),
    def: 1 + Math.min(20, extra * .004), ar: 1 + Math.min(20, extra * .003),
  };
}
function towerApplyEndlessDifficulty() {
  if (!R.tower || !towerUnlimited() || R.tower.floor <= 50) return;
  const d = towerEndlessDifficulty(R.tower.floor, S.lvl);
  for (const e of R.enemies || []) {
    const hp = Math.min(ACTIVITY_TOWER_NUMERIC_CAP, e.max * d.hp);
    e.max = hp; e.hp = hp; e.dmg = Math.min(ACTIVITY_TOWER_NUMERIC_CAP, e.dmg * d.dmg);
    e.def = (e.def || 0) * d.def; e.ar = (e.ar || 0) * d.ar; e.L = d.level;
  }
  return d;
}
if (typeof towerSpawn === "function") {
  const legacyTowerSpawn = towerSpawn;
  towerSpawn = function (...args) {
    const out = activityWithDiff(() => legacyTowerSpawn.apply(this, args));
    towerApplyEndlessDifficulty();
    return out;
  };
}
if (typeof grant === "function") {
  const legacyGrant = grant;
  grant = function (reward, reason) {
    if (R.tower && towerUnlimited() && R.tower.floor > 50 && reward && reward.gold) {
      const f = R.tower.floor, extra = f - 50;
      const gold = Math.min(ACTIVITY_TOWER_NUMERIC_CAP, Math.round(7500 + 900 * Math.log1p(extra)));
      reward = Object.assign({}, reward, { gold });
    }
    return legacyGrant(reward, reason);
  };
}

// Dã Tẩu recurring rewards are capped by cycle; PHLT/2.0 attribute rewards
// additionally share a five point weekly budget.
const DA_TAU_FD_CAP = { ctc: 16, phlt: 15, g2: 15 };
function daTauCapStep(step) {
  if (!step || !step.rw) return step;
  const mode = activityMode(), cap = DA_TAU_FD_CAP[mode] || 15;
  if (step.rw.fd !== undefined) step.rw.fd = Math.min(step.rw.fd, cap);
  if (mode !== "ctc" && step.rw.pts) {
    const r = RW(); const wk = typeof weekKey === "function" ? weekKey() : "local";
    if (!r.ytAttrCap || r.ytAttrCap.w !== wk) r.ytAttrCap = { w: wk, n: 0 };
    const left = Math.max(0, ACTIVITY_ATTR_WEEKLY_CAP - r.ytAttrCap.n);
    step.rw.pts = Math.min(step.rw.pts, left);
  }
  return step;
}
if (typeof ytStep === "function") {
  const legacyYtStep = ytStep;
  ytStep = function (...args) { return daTauCapStep(legacyYtStep.apply(this, args)); };
}
if (typeof ytClaim === "function") {
  const legacyYtClaim = ytClaim;
  ytClaim = function (...args) {
    const before = ytState && ytState();
    const step = before && !before.done ? ytStep() : null;
    const out = legacyYtClaim.apply(this, args);
    if (step && step.rw && step.rw.pts) {
      const r = RW(), wk = typeof weekKey === "function" ? weekKey() : "local";
      if (!r.ytAttrCap || r.ytAttrCap.w !== wk) r.ytAttrCap = { w: wk, n: 0 };
      r.ytAttrCap.n = Math.min(ACTIVITY_ATTR_WEEKLY_CAP, r.ytAttrCap.n + step.rw.pts);
    }
    return out;
  };
}

// Tống Kim's win achievement is awarded only after all waves are cleared.
if (typeof tkExit === "function") {
  const legacyTkExit = tkExit;
  tkExit = function (dead, won) {
    const before = RW().stat.tkWins || 0;
    const out = legacyTkExit.apply(this, arguments);
    if (!won && RW().stat.tkWins > before) {
      RW().stat.tkWins = before;
      if (typeof save === "function") save();
    }
    return out;
  };
}

// Kinh thành's once-per-week Golden set is independent from unlimited 2.0
// entries; later clears retain participation rewards only.
if (typeof siegeExit === "function" && typeof forceSetItem === "function") {
  const legacyForceSetItem = forceSetItem;
  let SIEGE_REWARD_CONTEXT = null;
  forceSetItem = function (...args) {
    if (SIEGE_REWARD_CONTEXT && SIEGE_REWARD_CONTEXT.mode === "g2" && SIEGE_REWARD_CONTEXT.city === "kinh") {
      const st = siegeState(), wk = typeof weekKey === "function" ? weekKey() : "local";
      if (st.g2Golden && st.g2Golden.w === wk) return null;
      const item = legacyForceSetItem.apply(this, args);
      if (item) st.g2Golden = { w: wk, id: item.id || null };
      return item;
    }
    return legacyForceSetItem.apply(this, args);
  };
  const legacySiegeExit = siegeExit;
  siegeExit = function (dead, won) {
    const city = S.siege && S.siege.city;
    SIEGE_REWARD_CONTEXT = { mode: activityMode(), city, won: !!won };
    try { return legacySiegeExit.apply(this, arguments); }
    finally { SIEGE_REWARD_CONTEXT = null; }
  };
}

if (typeof siegeBuy === "function" && typeof SIEGE_SHOP !== "undefined") {
  const SIEGE_SHOP_IDS = ["ht", "fd", "mats", "pts", "shard", "xp", "xpb"];
  if (typeof siegeState === "function") {
    const legacySiegeState = siegeState;
    siegeState = function () {
      const st = legacySiegeState.apply(this, arguments);
      st.buy = st.buy || {};
      for (let i = 0; i < SIEGE_SHOP_IDS.length; i++)
        if (st.buy[i] && !st.buy[SIEGE_SHOP_IDS[i]]) st.buy[SIEGE_SHOP_IDS[i]] = st.buy[i];
      return st;
    };
  }
  const legacySiegeBuy = siegeBuy;
  siegeBuy = function (index) {
    const st = siegeState(), id = SIEGE_SHOP_IDS[index];
    if (id && st.buy && st.buy[id]) return false;
    const before = st.buy && st.buy[index] || 0;
    const oldTokens = siegeTokens(), oldBuy = before;
    let out;
    try { out = legacySiegeBuy.apply(this, arguments); }
    catch (e) {
      RW().sgTok = oldTokens; st.buy[index] = oldBuy;
      throw e;
    }
    if (id && st.buy && st.buy[index] > before) { st.buy[id] = st.buy[index]; st.buy[index] = 1; }
    if (id && st.buy && st.buy[index] > before && typeof save === "function") save();
    return out;
  };
}
if (typeof giftBody === "function") {
  const legacyGiftBody = giftBody;
  giftBody = function (tab, r) {
    const html = legacyGiftBody.apply(this, arguments);
    return typeof html === "string" ? html.replace(
      "Sau tầng 50, cấp quái theo cấp nhân vật (tối đa 180); độ khó không tăng theo số tầng.",
      "Sau tầng 50, độ khó HP, sát thương, phòng thủ và né tránh tiếp tục tăng theo từng tầng; giới hạn cấp hiển thị không giới hạn độ khó thực tế."
    ) : html;
  };
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("change", e => {
    if (e.target && e.target.id === "sDiff" && activityBusyHard()) {
      e.preventDefault(); e.stopImmediatePropagation();
      const d = activityDiff(); if (d !== null) e.target.value = d;
      if (typeof toast === "function") toast("Độ khó đã khóa theo lượt đang chơi.");
    }
  }, true);
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("load", activityRestoreOnLoad);
