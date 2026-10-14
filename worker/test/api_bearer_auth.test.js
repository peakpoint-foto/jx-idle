import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import { GAME } from "../gen/game.js";
import { register, me, sync } from "../src/account.js";
import { guildTech } from "../src/guild_tech_api.js";
import { worldBoss } from "../src/world_boss_api.js";
import { sha256Hex } from "../src/http.js";
import { HttpError } from "../src/http.js";
import { seasonOf } from "../src/seasons.js";

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

/** Mirrors `onlApi` headers/body from `js/guild_tech_ui.js` (GET query + POST donate). */
function clientGuildTechRequest(method, token, { guildId, nodeId, gold, nonce, forgedAccountId }) {
  const headers = {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
  if (forgedAccountId) headers["x-account-id"] = forgedAccountId;
  if (method === "GET") {
    return new Request(
      "https://game.test/api/guild-tech?guild_id=" + encodeURIComponent(guildId),
      { method: "GET", headers }
    );
  }
  return new Request("https://game.test/api/guild-tech", {
    method: "POST",
    headers,
    body: JSON.stringify({ guild_id: guildId, node_id: nodeId, gold, nonce }),
  });
}

test("client-style guild tech GET/POST with Bearer records donate on token account", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const donor = await register(req(), env, { name: "TechDonor", save: baseSave() });
  const bystanderSave = baseSave();
  bystanderSave.cid = "c_bearer_bystander012345678";
  const bystander = await register(req("POST", null, "198.51.100.11"), env, {
    name: "TechBystander",
    save: bystanderSave,
  });
  const guildId = "g_client_e2e";
  const nodeId = "exp_boost";
  const gold = 2500;
  const nonce = "client-nonce-gt-1";
  const seasonIdx = seasonOf(Date.now()).index;
  const period = `s${seasonIdx}`;

  const loaded = await guildTech(clientGuildTechRequest("GET", donor.token, { guildId }), env);
  const loadBody = await loaded.json();
  assert.equal(loadBody.ok, true);
  assert.equal(loadBody.seasonIdx, seasonIdx);
  assert.ok(loadBody.def?.nodes?.length);

  const donated = await guildTech(
    clientGuildTechRequest("POST", donor.token, {
      guildId,
      nodeId,
      gold,
      nonce,
      forgedAccountId: bystander.id,
    }),
    env
  );
  assert.equal((await donated.json()).ok, true);

  const donorClaim = await DB.prepare(
    "SELECT account_id, idem_key FROM quota_claims WHERE account_id=?1 AND scope='guild_tech' AND period=?2"
  )
    .bind(donor.id, period)
    .first();
  assert.ok(donorClaim);
  assert.equal(donorClaim.idem_key, `donate:${guildId}:${nodeId}:${nonce}`);

  const bystanderClaims = await DB.prepare(
    "SELECT COUNT(*) AS n FROM quota_claims WHERE account_id=?1 AND scope='guild_tech'"
  )
    .bind(bystander.id)
    .first();
  assert.equal(bystanderClaims.n, 0);

  const node = await DB.prepare(
    "SELECT contributed FROM guild_tech_nodes WHERE guild_id=?1 AND node_id=?2 AND season_idx=?3"
  )
    .bind(guildId, nodeId, seasonIdx)
    .first();
  assert.ok(node);
  assert.equal(node.contributed, gold);
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

test("legacy token survives reload: same Bearer reuses account and progress", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const save = baseSave();
  save.gold = 4242;
  const reg = await register(req(), env, { name: "ReloadKeep", save });
  const token = reg.token;
  const first = await me(req("GET", token), env);
  assert.equal(first.id, reg.id);
  assert.equal(first.char.character_id, reg.character_id);
  assert.equal(JSON.parse((await DB.prepare("SELECT snapshot FROM chars WHERE account_id=?1").bind(reg.id).first()).snapshot).gold, 4242);
  // Simulate page reload: client sends the same stored token again.
  const again = await me(req("GET", token), env);
  assert.equal(again.id, reg.id);
  assert.equal(again.name, "ReloadKeep");
  const synced = await sync(req("POST", token), env, { save: { ...save, gold: 4300 }, base_rev: 1 });
  assert.equal(synced.ok, true);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM accounts").first()).n, 1);
  const third = await me(req("GET", token), env);
  assert.equal(third.id, reg.id);
  assert.equal(JSON.parse((await DB.prepare("SELECT snapshot FROM chars WHERE account_id=?1").bind(reg.id).first()).snapshot).gold, 4300);
});

test("legacy anon world_boss_hits are preserved; new POST never writes anon", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const bossId = "wb_legacy_anon";
  const now = Date.now();
  await DB.batch([
    DB.prepare("INSERT INTO world_boss(id,starts_at,ends_at,hp,max_hp) VALUES(?1,?2,?3,500,500)").bind(
      bossId,
      now - 1000,
      now + 3600000
    ),
    DB.prepare(
      "INSERT INTO world_boss_hits(id,boss_id,account_id,damage,created_at) VALUES('legacy-anon-1',?1,'anon',999,?2)"
    ).bind(bossId, now - 500),
  ]);
  const anonBefore = (await DB.prepare("SELECT COUNT(*) AS n FROM world_boss_hits WHERE account_id='anon'").first()).n;
  assert.equal(anonBefore, 1);
  const noAuth = new Request("https://game.test/api/world-boss", {
    method: "POST",
    headers: { "content-type": "application/json", "x-account-id": "anon" },
    body: JSON.stringify({ boss_id: bossId, snapshot: { power: 1e9 }, nonce: "anon-attempt" }),
  });
  await assert.rejects(() => worldBoss(noAuth, env), (e) => e instanceof HttpError && e.code === "no_token");
  assert.equal(
    (await DB.prepare("SELECT COUNT(*) AS n FROM world_boss_hits WHERE account_id='anon'").first()).n,
    anonBefore
  );
  const token = "wb-real-after-anon-012345678901234567890";
  const id = "wbreal01";
  await DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at) VALUES(?1,?2,?3,?4)")
    .bind(id, await sha256Hex(token), "RealAfterAnon", now)
    .run();
  const authed = new Request("https://game.test/api/world-boss", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ boss_id: bossId, snapshot: { power: 50 }, nonce: "real-hit-1" }),
  });
  const body = await (await worldBoss(authed, env)).json();
  assert.equal(body.ok, true);
  assert.equal(
    (await DB.prepare("SELECT COUNT(*) AS n FROM world_boss_hits WHERE account_id='anon'").first()).n,
    anonBefore
  );
  const newHit = await DB.prepare(
    "SELECT account_id FROM world_boss_hits WHERE id<> 'legacy-anon-1' AND boss_id=?1"
  )
    .bind(bossId)
    .first();
  assert.ok(newHit);
  assert.notEqual(newHit.account_id, "anon");
  assert.equal(newHit.account_id, id);
});
