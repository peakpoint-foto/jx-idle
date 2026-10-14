// So sánh save đồng bộ với bản trước; ước lượng ngân sách theo thời gian server giữa hai lần sync.
// SYNC_GUARD_MODE (env): off | log_only (default) | enforce
import { HttpError } from "./http.js";
const OFFLINE_MAX = 8 * 3600;
const HB_ONLINE_GAP = 150;
import { GAME } from "../gen/game.js";
import { levelCapForTime, MODE_TIME_FACTOR, modeOfState } from "./validate.js";
import { recordSyncGuardTelemetry } from "./telemetry.js";

export const SYNC_GUARD_MODES = Object.freeze(["off", "log_only", "enforce"]);

export function syncGuardMode(env) {
  const raw = String(env?.SYNC_GUARD_MODE ?? "log_only").trim().toLowerCase();
  if (raw === "enforce" || raw === "1" || raw === "true") return "enforce";
  if (raw === "off" || raw === "0" || raw === "false" || raw === "disabled") return "off";
  return "log_only";
}

/** Thời gian “có thể kiếm” giữa hai lần sync (giây), bám offline cap game. */
export function syncElapsedBudgetSec(lastUpdatedAt, now = Date.now()) {
  if (!lastUpdatedAt || !(lastUpdatedAt > 0)) return OFFLINE_MAX;
  const wall = Math.max(0, (now - lastUpdatedAt) / 1000);
  if (wall <= HB_ONLINE_GAP) return wall;
  return Math.min(wall, OFFLINE_MAX);
}

function itemCount(state) {
  if (!state || typeof state !== "object") return 0;
  const inv = Array.isArray(state.inv) ? state.inv.length : 0;
  const eq = state.eq && typeof state.eq === "object" ? Object.values(state.eq).filter(Boolean).length : 0;
  const ground = Array.isArray(state.ground) ? state.ground.length : 0;
  return inv + eq + ground;
}

function totalXp(state) {
  const lvl = Math.max(1, Math.floor(+state.lvl || 1));
  let xp = Math.max(0, +state.xp || 0);
  for (let L = 1; L < lvl; L++) xp += GAME.expNeed(L);
  return xp;
}

function goldBudget(sec, mode) {
  const mul = mode === "g2" ? 2.5 : mode === "phlt" ? 1.5 : 1;
  // Rộng tay để tune qua telemetry log_only (~500 lượng/giây hiệu quả × hệ số mode).
  return Math.max(0, Math.floor(sec * 500 * mul * 1.25));
}

function itemBudget(sec) {
  // ~2 món/phút hiệu quả + slack cho auto-loot.
  return Math.max(0, Math.floor(sec * (2 / 60) + 3));
}

function xpBudget(sec, state, playSec) {
  const mode = modeOfState(state);
  const factor = MODE_TIME_FACTOR[mode] || 1;
  const effective = (playSec != null ? +playSec : 0) + sec * factor;
  const capLvl = levelCapForTime(effective);
  let maxXp = 0;
  for (let L = 1; L <= Math.min(capLvl, GAME.MAX_LEVEL); L++) maxXp += GAME.expNeed(L);
  return maxXp;
}

/**
 * @returns {{ violations: object[], deltas: object, budgets: object, elapsedSec: number }}
 */
export function analyzeSyncDelta(prevState, nextState, { elapsedSec, playSec, now = Date.now() }) {
  const violations = [];
  const mode = modeOfState(nextState);
  const prevGold = Math.max(0, Math.floor(+prevState?.gold || 0));
  const nextGold = Math.max(0, Math.floor(+nextState?.gold || 0));
  const dGold = nextGold - prevGold;

  const prevItems = itemCount(prevState);
  const nextItems = itemCount(nextState);
  const dItems = nextItems - prevItems;

  const prevXp = totalXp(prevState || {});
  const nextXp = totalXp(nextState);
  const dXp = nextXp - prevXp;

  const bGold = goldBudget(elapsedSec, mode);
  const bItems = itemBudget(elapsedSec);
  const bXp = xpBudget(elapsedSec, nextState, playSec);
  const prevLvl = Math.floor(+prevState?.lvl || 1);
  const nextLvl = Math.floor(+nextState?.lvl || 1);

  if (dGold > bGold) {
    violations.push({
      code: "gold_delta",
      reason: `Vàng +${dGold} vượt ngân sách ${bGold} trong ${elapsedSec.toFixed(0)}s`,
      delta: dGold,
      budget: bGold,
    });
  }
  if (dItems > bItems) {
    violations.push({
      code: "item_delta",
      reason: `Số món +${dItems} vượt ngân sách ${bItems} trong ${elapsedSec.toFixed(0)}s`,
      delta: dItems,
      budget: bItems,
    });
  }
  const effectivePlay = (playSec != null ? +playSec : 0) + elapsedSec * (MODE_TIME_FACTOR[mode] || 1);
  const maxLvl = levelCapForTime(effectivePlay);
  if (nextLvl > maxLvl) {
    violations.push({
      code: "level_time",
      reason: `Cấp ${nextLvl} vượt trần ${maxLvl} với play_sec≈${Math.floor(playSec || 0)} + elapsed ${elapsedSec.toFixed(0)}s`,
      delta: nextLvl - prevLvl,
      budget: maxLvl,
    });
  }
  const maxTotalXp = xpBudget(elapsedSec, nextState, playSec);
  if (nextXp > maxTotalXp + GAME.expNeed(Math.min(nextLvl, GAME.MAX_LEVEL))) {
    violations.push({
      code: "xp_delta",
      reason: `EXP tổng ${Math.round(nextXp)} vượt ngân sách ~${Math.round(maxTotalXp)}`,
      delta: dXp,
      budget: maxTotalXp,
    });
  }

  return {
    violations,
    deltas: { gold: dGold, items: dItems, xp: dXp, lvl: nextLvl - prevLvl },
    budgets: { gold: bGold, items: bItems, xp: bXp, elapsedSec },
    elapsedSec,
  };
}

export function clampStateToBudget(prevState, nextState, analysis) {
  const out = JSON.parse(JSON.stringify(nextState));
  const prevGold = Math.max(0, Math.floor(+prevState?.gold || 0));
  out.gold = Math.min(Math.max(0, Math.floor(+out.gold || 0)), prevGold + analysis.budgets.gold);
  // Không cắt item tự động — enforce mode nên reject thay vì clamp mù.
  return out;
}

export async function applySyncGuard(env, db, {
  accountId,
  prevSnapshot,
  nextState,
  lastUpdatedAt,
  playSec,
  mode,
}) {
  const guardMode = syncGuardMode(env);
  if (guardMode === "off") return { state: nextState, guard: { mode: guardMode, violations: [] } };

  let prevState = null;
  try {
    prevState = prevSnapshot ? JSON.parse(prevSnapshot) : null;
  } catch {
    prevState = null;
  }
  if (!prevState) return { state: nextState, guard: { mode: guardMode, violations: [] } };

  const elapsedSec = syncElapsedBudgetSec(lastUpdatedAt);
  const analysis = analyzeSyncDelta(prevState, nextState, { elapsedSec, playSec });
  if (!analysis.violations.length) return { state: nextState, guard: { mode: guardMode, ...analysis } };

  await recordSyncGuardTelemetry(db, {
    at: Date.now(),
    accountId,
    guardMode,
    mode: mode || modeOfState(nextState),
    elapsedSec: analysis.elapsedSec,
    deltas: analysis.deltas,
    budgets: analysis.budgets,
    violations: analysis.violations,
  });

  if (guardMode === "log_only") {
    return { state: nextState, guard: { mode: guardMode, logged: true, ...analysis } };
  }

  throw new HttpError(409, "sync_budget_exceeded", "Tiến độ vượt ngân sách thời gian kể từ lần đồng bộ trước", {
    violations: analysis.violations,
    deltas: analysis.deltas,
    budgets: analysis.budgets,
    elapsed_sec: analysis.elapsedSec,
  });
}
