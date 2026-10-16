import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import { GAME } from "../gen/game.js";
import { register, auth, rotateToken, listDevices, revokeDevice, me } from "../src/account.js";

const baseSave = (cid) =>
  Object.assign(GAME.newSave(), { mode: "ctc", fac: "shaolin", cid, lvl: 20, xp: 1 });

const req = (token = null) =>
  new Request("https://game.test/api/x", {
    method: "POST",
    headers: { ...(token ? { authorization: "Bearer " + token } : {}) },
  });

async function setup(t, name, cid) {
  const DB = await localD1();
  t.after(() => DB.close());
  const env = { DB };
  const reg = await register(req(), env, { name, save: baseSave(cid) });
  return { DB, env, reg };
}

test("W1-5: xoay token chính — token mới dùng được, token cũ còn hiệu lực 24h (grace)", async (t) => {
  const { DB, env, reg } = await setup(t, "RotA", "c_rot_aaaaaaaa0001");
  const r = await rotateToken(req(reg.token), env, {});
  assert.equal(r.rotated, "primary");
  assert.ok(r.token && r.token !== reg.token, "cấp token mới");
  assert.ok(r.grace_until > Date.now(), "grace 24h");
  // Token mới auth OK.
  const accNew = await auth(req(r.token), env);
  assert.equal(accNew.id, reg.id);
  // Token cũ vẫn auth OK trong grace.
  const accOld = await auth(req(reg.token), env);
  assert.equal(accOld.id, reg.id);
  assert.equal(accOld._auth_via, "grace");
  // Hết grace -> 401.
  await DB.prepare("UPDATE accounts SET prev_token_expires_at=?1 WHERE id=?2")
    .bind(Date.now() - 1000, reg.id).run();
  await assert.rejects(() => auth(req(reg.token), env), (e) => e && e.code === "bad_token");
  // Token mới vẫn sống.
  assert.equal((await auth(req(r.token), env)).id, reg.id);
});

test("W1-5: cấp token theo device — dùng được, không đẻ thêm device, không xoay primary", async (t) => {
  const { env, reg } = await setup(t, "RotB", "c_rot_bbbbbbbb0002");
  const d = await rotateToken(req(reg.token), env, { device_label: "Điện thoại" });
  assert.equal(d.rotated, "device");
  assert.equal(d.device_label, "Điện thoại");
  // Device token auth OK cho API thường.
  const m = await me(req(d.token), env);
  assert.equal(m.id, reg.id);
  // Device token không được cấp thêm device.
  await assert.rejects(
    () => rotateToken(req(d.token), env, { device_label: "Máy lạ" }),
    (e) => e && e.code === "device_cannot_provision"
  );
  // Device token xoay (không label) -> tự xoay chính nó, token cũ của device chết ngay.
  const d2 = await rotateToken(req(d.token), env, {});
  assert.equal(d2.rotated, "device");
  assert.ok(d2.token !== d.token);
  await assert.rejects(() => auth(req(d.token), env), (e) => e && e.code === "bad_token");
  assert.equal((await auth(req(d2.token), env)).id, reg.id);
  // Token chính không bị ảnh hưởng.
  assert.equal((await auth(req(reg.token), env)).id, reg.id);
});

test("W1-5: list devices không lộ hash; revoke thiết bị lạ -> token đó 401", async (t) => {
  const { env, reg } = await setup(t, "RotC", "c_rot_cccccccc0003");
  const d = await rotateToken(req(reg.token), env, { device_label: "Máy tính bảng" });
  const list = await listDevices(req(reg.token), env);
  assert.equal(list.devices.length, 1);
  assert.equal(list.devices[0].device_label, "Máy tính bảng");
  assert.ok(!("token_hash" in list.devices[0]), "không lộ token_hash");
  assert.equal(list.primary.via, "primary");
  // Revoke bằng token chính.
  const rv = await revokeDevice(req(reg.token), env, { device_id: d.device_id });
  assert.equal(rv.ok, true);
  // Token của thiết bị lạ -> 401 ngay.
  await assert.rejects(() => auth(req(d.token), env), (e) => e && e.code === "bad_token");
  await assert.rejects(() => me(req(d.token), env), (e) => e && e.code === "bad_token");
  // Token chính vẫn sống.
  assert.equal((await auth(req(reg.token), env)).id, reg.id);
  // Revoke lại -> 404.
  await assert.rejects(
    () => revokeDevice(req(reg.token), env, { device_id: d.device_id }),
    (e) => e && e.code === "device_not_found"
  );
});

test("W1-5: device không revoke được device khác; được tự revoke chính nó", async (t) => {
  const { env, reg } = await setup(t, "RotD", "c_rot_dddddddd0004");
  const d1 = await rotateToken(req(reg.token), env, { device_label: "D1" });
  const d2 = await rotateToken(req(reg.token), env, { device_label: "D2" });
  // D1 đòi revoke D2 -> 403.
  await assert.rejects(
    () => revokeDevice(req(d1.token), env, { device_id: d2.device_id }),
    (e) => e && e.code === "forbidden"
  );
  // D1 tự revoke chính nó -> ok (đăng xuất thiết bị này).
  const self = await revokeDevice(req(d1.token), env, { device_id: d1.device_id });
  assert.equal(self.ok, true);
  await assert.rejects(() => auth(req(d1.token), env), (e) => e && e.code === "bad_token");
  // D2 không bị ảnh hưởng.
  assert.equal((await auth(req(d2.token), env)).id, reg.id);
});

test("W1-5: không token / token bậy vẫn 401 như cũ", async (t) => {
  const { env, reg } = await setup(t, "RotE", "c_rot_eeeeeeee0005");
  await assert.rejects(() => auth(req(), env), (e) => e && e.code === "no_token");
  await assert.rejects(
    () => auth(req("thisisnotavalidtoken000000000000"), env),
    (e) => e && e.code === "bad_token"
  );
  assert.ok(reg.token);
});
