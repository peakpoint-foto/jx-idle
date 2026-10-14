import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import { GAME } from "../gen/game.js";
import { sha256Hex } from "../src/http.js";
import { sync } from "../src/account.js";
import { activityClaim, validateActivityClaim } from "../src/activity.js";
import { guildTechServerGate } from "../src/capabilities.js";

async function player(t) {
  const DB = await localD1();
  t.after(() => DB.close());
  const id = "ac1";
  const token = "valid-test-token-0123456789-ac";
  const state = Object.assign(GAME.newSave(), {
    mode: "ctc",
    fac: "shaolin",
    lvl: 40,
    cid: "c_anticheat_test_01",
    gold: 1000,
    inv: [],
  });
  const updatedAt = Date.now() - 3600e3;
  await DB.batch([
    DB.prepare(
      "INSERT INTO accounts(id,token_hash,name,created_at,play_sec,last_hb) VALUES(?1,?2,?3,?4,5000,?4)"
    ).bind(id, await sha256Hex(token), "AC", updatedAt),
    DB.prepare(
      "INSERT INTO chars(account_id,character_id,snapshot,lvl,fac,updated_at,sync_rev,mode,validation_status) VALUES(?1,?2,?3,40,'shaolin',?4,1,'ctc','verified')"
    ).bind(id, state.cid, JSON.stringify(state), updatedAt),
  ]);
  const request = () =>
    new Request("https://game.test/api/sync", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
    });
  return { DB, env: { DB }, state, request, id };
}

test("T3 / activity: replay same event_key is duplicate", async t => {
  const { env, request } = await player(t);
  const body = {
    activity: "siege",
    event_key: "siege-replay-key-001",
    contribution: 0,
    cleared: 0,
    won: 0,
  };
  const a = await activityClaim(request(), env, body);
  assert.equal(a.duplicate, false);
  const b = await activityClaim(request(), env, body);
  assert.equal(b.duplicate, true);
});

test("activity tamper: inflated client scores rejected", () => {
  assert.throws(
    () =>
      validateActivityClaim({
        activity: "tower",
        event_key: "tower-2026-10-08-test",
        contribution: 999,
        cleared: 99,
        won: 1,
      }),
    err => err.code === "activity_score_tamper"
  );
  const ok = validateActivityClaim({
    activity: "tower",
    event_key: "tower-2026-10-08-test",
    contribution: 1,
    cleared: 1,
    won: 1,
  });
  assert.equal(ok.contribution, 1);
  assert.equal(ok.cleared, 1);
});

test("sync log_only accepts tampered save and logs telemetry (T1 server side)", async t => {
  const { env, DB, state, request } = await player(t);
  const hacked = { ...state, gold: 50_000_000 };
  env.SYNC_GUARD_MODE = "log_only";
  const r = await sync(request(), env, { save: hacked, base_rev: 1 });
  assert.equal(r.ok, true);
  assert.ok(r.sync_guard_violations > 0);
  const tele = await DB.prepare(
    "SELECT value FROM telemetry_events WHERE event='sync_guard_would_reject' ORDER BY id DESC LIMIT 1"
  ).first();
  assert.ok(tele);
  const payload = JSON.parse(tele.value);
  assert.equal(payload.account_id, "ac1");
  assert.ok(payload.violations.length > 0);
});

test("sync enforce rejects tampered save", async t => {
  const { env, state, request } = await player(t);
  const hacked = { ...state, gold: 50_000_000 };
  env.SYNC_GUARD_MODE = "enforce";
  await assert.rejects(() => sync(request(), env, { save: hacked, base_rev: 1 }), {
    code: "sync_budget_exceeded",
  });
});

test("guild-tech server gate is fail-closed without GUILD_TECH_SERVER_ENABLED", () => {
  assert.throws(() => guildTechServerGate({ FEATURE_FLAGS: '{"guild_tech":true}' }), {
    code: "feature_disabled",
  });
  assert.doesNotThrow(() => guildTechServerGate({ GUILD_TECH_SERVER_ENABLED: "1" }));
});
