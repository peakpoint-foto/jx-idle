import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import { GAME } from "../gen/game.js";
import { register, login, me, setPassword, deleteAccount, LOGIN_MAX_FAILS } from "../src/account.js";
import { guildTech } from "../src/guild_tech_api.js";
import { sha256Hex } from "../src/http.js";

const baseSave = () =>
  Object.assign(GAME.newSave(), { mode: "ctc", fac: "shaolin", cid: "c_auth_test_0123456789", lvl: 20, xp: 1 });

const req = (method = "POST", token = null, ip = "198.51.100.10") =>
  new Request("https://game.test/api/x", {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      "cf-connecting-ip": ip,
    },
  });

test("login elsewhere invalidates previous token with session_replaced", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const reg = await register(req(), env, { name: "SessTwo", save: baseSave(), password: "securepass1" });
  const oldToken = reg.token;
  await login(req(), env, { username: "SessTwo", password: "securepass1" });
  await assert.rejects(() => me(req("GET", oldToken), env), (e) => e.code === "session_replaced");
});

test("login on another device returns the same character", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const reg = await register(req(), env, { name: "AuthHero", save: baseSave(), password: "securepass1" });
  const cid = reg.character_id;
  const loginRes = await login(req(), env, { username: "AuthHero", password: "securepass1" });
  assert.notEqual(loginRes.token, reg.token);
  const profile = await me(req("GET", loginRes.token), env);
  assert.equal(profile.char.character_id, cid);
  assert.equal(profile.name, "AuthHero");
});

test("repeated wrong passwords trigger temporary lockout", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  await register(req(), env, { name: "LockUser", save: baseSave(), password: "correctpass1" });
  for (let i = 0; i < LOGIN_MAX_FAILS - 1; i++) {
    await assert.rejects(() => login(req(), env, { username: "LockUser", password: "wrongpass1" }), {
      code: "bad_credentials",
    });
  }
  await assert.rejects(() => login(req(), env, { username: "LockUser", password: "wrongpass1" }), { code: "locked" });
  await assert.rejects(() => login(req(), env, { username: "LockUser", password: "correctpass1" }), { code: "locked" });
});

test("legacy token account can set password without losing character", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const token = "legacy-token-only-account-012345678901";
  const id = "leg001";
  const snap = baseSave();
  const now = Date.now();
  await DB.batch([
    DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at,last_hb) VALUES(?1,?2,?3,?4,?4)").bind(
      id,
      await sha256Hex(token),
      "LegacyOne",
      now
    ),
    DB.prepare(
      "INSERT INTO chars(account_id,character_id,fac,lvl,xp,snapshot,updated_at,sync_rev,mode) VALUES(?1,?2,?3,?4,?5,?6,?7,1,?8)"
    ).bind(id, snap.cid, "shaolin", 20, 0, JSON.stringify(snap), now, "ctc"),
  ]);
  const before = await me(req("GET", token), env);
  const set = await setPassword(req("POST", token), env, { password: "newsecure12" });
  assert.ok(set.recovery_code);
  assert.match(set.recovery_code, /^[A-Za-z0-9_-]+$/);
  const after = await me(req("GET", token), env);
  assert.equal(after.char.character_id, before.char.character_id);
  assert.equal(after.has_password, true);
});

test("forged x-account-id is ignored; guild tech POST uses Bearer auth", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const real = await register(req(), env, { name: "RealGuild", save: baseSave(), password: "guildpass12" });
  const forged = new Request("https://game.test/api/guild-tech", {
    method: "POST",
    headers: {
      authorization: "Bearer " + real.token,
      "content-type": "application/json",
      "x-account-id": "attacker_account_id",
    },
    body: JSON.stringify({ guild_id: "g1", node_id: "exp_boost", gold: 1000, nonce: "n-test-1" }),
  });
  const r = await guildTech(forged, env);
  const body = await r.json();
  assert.equal(body.ok, true);
  const row = await DB.prepare("SELECT account_id FROM quota_claims WHERE account_id=?1").bind(real.id).first();
  assert.ok(row);
  assert.equal(row.account_id, real.id);
  const noAuth = new Request("https://game.test/api/guild-tech", {
    method: "POST",
    headers: { "content-type": "application/json", "x-account-id": "attacker_account_id" },
    body: JSON.stringify({ guild_id: "g1", node_id: "exp_boost", gold: 1000, nonce: "n-test-2" }),
  });
  await assert.rejects(() => guildTech(noAuth, env), (e) => e && e.code === "no_token");
});

test("no plaintext password stored in accounts table", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const plain = "MySecretPass99";
  await register(req(), env, { name: "NoPlain", save: baseSave(), password: plain });
  const row = await DB.prepare("SELECT password_hash,password_salt,password_iter,name FROM accounts WHERE name=?1").bind("NoPlain").first();
  assert.ok(row.password_hash);
  assert.ok(row.password_salt);
  assert.equal(row.password_iter, 100_000);
  assert.notEqual(row.password_hash, plain);
  assert.ok(!row.password_hash.includes(plain));
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes(plain));
});

test("delete account removes rows", async (t) => {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const reg = await register(req(), env, { name: "DelMe", save: baseSave(), password: "deletepass1" });
  await deleteAccount(req("POST", reg.token), env, { password: "deletepass1" });
  assert.equal(await DB.prepare("SELECT id FROM accounts WHERE id=?1").bind(reg.id).first(), null);
  assert.equal(await DB.prepare("SELECT account_id FROM chars WHERE account_id=?1").bind(reg.id).first(), null);
});
