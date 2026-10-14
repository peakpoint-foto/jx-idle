import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import { GAME } from "../gen/game.js";
import { register } from "../src/account.js";
import { guildTech } from "../src/guild_tech_api.js";
import { worldBoss } from "../src/world_boss_api.js";
import { sha256Hex } from "../src/http.js";

const baseSave = () =>
  Object.assign(GAME.newSave(), { mode: "ctc", fac: "shaolin", cid: "c_bearer_0123456789", lvl: 20, xp: 1 });

const req = (method = "POST", token = null, ip = "198.51.100.10") =>
  new Request("https://game.test/api/x", {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      "cf-connecting-ip": ip,
    },
  });

test("guild tech POST uses Bearer auth; forged x-account-id is ignored", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const reg = await register(req(), env, { name: "BearerGuild", save: baseSave() });
  const forged = new Request("https://game.test/api/guild-tech", {
    method: "POST",
    headers: {
      authorization: "Bearer " + reg.token,
      "content-type": "application/json",
      "x-account-id": "attacker_account_id",
    },
    body: JSON.stringify({ guild_id: "g1", node_id: "exp_boost", gold: 1000, nonce: "n-bearer-1" }),
  });
  const r = await guildTech(forged, env);
  const body = await r.json();
  assert.equal(body.ok, true);
  const row = await DB.prepare("SELECT account_id FROM quota_claims WHERE account_id=?1").bind(reg.id).first();
  assert.ok(row);
  assert.equal(row.account_id, reg.id);
  const noAuth = new Request("https://game.test/api/guild-tech", {
    method: "POST",
    headers: { "content-type": "application/json", "x-account-id": "attacker_account_id" },
    body: JSON.stringify({ guild_id: "g1", node_id: "exp_boost", gold: 1000, nonce: "n-bearer-2" }),
  });
  await assert.rejects(() => guildTech(noAuth, env), (e) => e && e.code === "no_token");
});

test("world boss POST requires Bearer; x-account-id does not authenticate", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const token = "world-boss-bearer-test-token-012345678901";
  const id = "wbauth01";
  await DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at) VALUES(?1,?2,?3,?4)")
    .bind(id, await sha256Hex(token), "BossHit", Date.now())
    .run();
  const bossId = "wb_bearer1";
  const now = Date.now();
  await DB.prepare("INSERT INTO world_boss(id,starts_at,ends_at,hp,max_hp) VALUES(?1,?2,?3,1000,1000)")
    .bind(bossId, now - 1000, now + 3600000)
    .run();
  const forged = new Request("https://game.test/api/world-boss", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      "x-account-id": "wrong_id",
    },
    body: JSON.stringify({ boss_id: bossId, snapshot: { power: 100 }, nonce: "wb-n1" }),
  });
  const ok = await worldBoss(forged, env);
  assert.equal((await ok.json()).ok, true);
  const hit = await DB.prepare("SELECT account_id FROM world_boss_hits WHERE boss_id=?1").bind(bossId).first();
  assert.equal(hit.account_id, id);
  const noAuth = new Request("https://game.test/api/world-boss", {
    method: "POST",
    headers: { "content-type": "application/json", "x-account-id": id },
    body: JSON.stringify({ boss_id: bossId, snapshot: {}, nonce: "wb-n2" }),
  });
  await assert.rejects(() => worldBoss(noAuth, env), (e) => e && e.code === "no_token");
});
