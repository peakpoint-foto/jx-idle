import test from "node:test";
import assert from "node:assert/strict";
import { GAME } from "../gen/game.js";
import {
  analyzeSyncDelta,
  applySyncGuard,
  capIdleOfflineRewards,
  capStateToServerIdleWindow,
  clampStateToSyncBudget,
  isOfflineAccountGap,
  serverSeenBudgetSec,
  syncGuardMode,
  syncElapsedBudgetSec,
  syncIdleBudgetSec,
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

test("serverSeenBudgetSec uses last_hb and caps offline like creditTime", () => {
  const now = Date.now();
  const acc = { created_at: now - 90 * 864e5, last_hb: now - 48 * 3600e3, off_sec: 0 };
  assert.equal(serverSeenBudgetSec(acc, now), 8 * 3600);
  const online = { created_at: now - 864e5, last_hb: now - 30e3 };
  assert.ok(serverSeenBudgetSec(online, now) <= 30);
});

test("syncIdleBudgetSec is min(server seen, since last char updated_at)", () => {
  const now = Date.now();
  const acc = { created_at: now - 864e5, last_hb: now - 48 * 3600e3 };
  const recentChar = now - 3600e3;
  assert.equal(syncIdleBudgetSec(acc, recentChar, now), 3600);
  const staleChar = now - 48 * 3600e3;
  assert.equal(syncIdleBudgetSec(acc, staleChar, now), 8 * 3600);
});

test("clampStateToSyncBudget clamps inflated gold to elapsed budget", () => {
  const prev = Object.assign(GAME.newSave(), { mode: "ctc", fac: "shaolin", gold: 1000, lvl: 40, xp: 0 });
  const next = { ...prev, gold: 50_000_000 };
  const r = clampStateToSyncBudget(prev, next, { elapsedSec: 3600, playSec: 5000 });
  assert.equal(r.clamped, true);
  assert.ok(r.state.gold < next.gold);
  assert.equal(r.analysis.violations.length, 0);
});

test("capIdleOfflineRewards skips clamp when account is online (recent hb)", () => {
  const now = Date.now();
  const prev = Object.assign(GAME.newSave(), { mode: "ctc", fac: "shaolin", gold: 1000, lvl: 40, xp: 0 });
  const next = { ...prev, gold: 50_000_000 };
  const acc = { created_at: now - 864e5, last_hb: now - 30e3 };
  assert.equal(isOfflineAccountGap(acc, now), false);
  const r = capIdleOfflineRewards(prev, next, { account: acc, lastUpdatedAt: now - 3600e3, playSec: 5000, now });
  assert.equal(r.capped, false);
  assert.equal(r.state.gold, next.gold);
});

test("applySyncGuard enforce rejects when cap cannot trim eq item spike", async () => {
  const prev = Object.assign(GAME.newSave(), {
    mode: "ctc",
    fac: "shaolin",
    gold: 1000,
    lvl: 40,
    xp: 0,
    inv: [],
    eq: {},
  });
  const next = JSON.parse(JSON.stringify(prev));
  next.eq = {
    head: { id: 1 },
    body: { id: 2 },
    weapon: { id: 3 },
    ring1: { id: 4 },
    ring2: { id: 5 },
    amulet: { id: 6 },
    boots: { id: 7 },
    belt: { id: 8 },
  };
  const db = {
    prepare() {
      return { bind() { return { run: async () => {} }; } };
    },
  };
  await assert.rejects(
    () =>
      applySyncGuard({ SYNC_GUARD_MODE: "enforce" }, db, {
        accountId: "x",
        account: { created_at: Date.now(), last_hb: Date.now() - 60e3 },
        prevSnapshot: JSON.stringify(prev),
        nextState: next,
        lastUpdatedAt: Date.now() - 60e3,
        playSec: 5000,
        mode: "ctc",
        now: Date.now(),
      }),
    err => err.code === "sync_budget_exceeded"
  );
});
