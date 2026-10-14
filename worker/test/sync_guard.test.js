import test from "node:test";
import assert from "node:assert/strict";
import { GAME } from "../gen/game.js";
import {
  analyzeSyncDelta,
  syncGuardMode,
  syncElapsedBudgetSec,
} from "../src/sync_guard.js";

test("syncGuardMode defaults to log_only", () => {
  assert.equal(syncGuardMode({}), "log_only");
  assert.equal(syncGuardMode({ SYNC_GUARD_MODE: "enforce" }), "enforce");
  assert.equal(syncGuardMode({ SYNC_GUARD_MODE: "off" }), "off");
});

test("analyzeSyncDelta flags gold spike over elapsed budget", () => {
  const prev = Object.assign(GAME.newSave(), { mode: "ctc", fac: "shaolin", gold: 1000, lvl: 40, xp: 0 });
  const next = { ...prev, gold: 500_000 };
  const r = analyzeSyncDelta(prev, next, { elapsedSec: 60, playSec: 3600 });
  assert.ok(r.violations.some(v => v.code === "gold_delta"));
});

test("syncElapsedBudgetSec caps long gaps at OFFLINE_MAX", () => {
  const t0 = Date.now() - 48 * 3600e3;
  assert.equal(syncElapsedBudgetSec(t0), 8 * 3600);
});
