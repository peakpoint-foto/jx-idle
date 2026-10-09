import test from "node:test";
import assert from "node:assert/strict";
import {localD1} from "./helpers/d1.js";
import {quotaClaim, quotaClaimSQL, quotaPeriodDay, quotaRefund, quotaStatus} from "../src/quota.js";

const Q = (db, over = {}) => ({db, accountId: "a1", scope: "trial", period: quotaPeriodDay(Date.now()), limit: 5, idemKey: "k", now: Date.now(), errorCode: "trial_attempts_used", ...over});

test("hai claim đồng thời không vượt quota (limit=1)", async () => {
  const db = await localD1();
  const mk = i => quotaClaim(db, Q(db, {limit: 1, idemKey: "race" + i}));
  const rs = await Promise.allSettled([mk(0), mk(1)]);
  const ok = rs.filter(r => r.status === "fulfilled"), bad = rs.filter(r => r.status === "rejected");
  assert.equal(ok.length, 1, "đúng một claim thành công");
  assert.equal(bad.length, 1, "claim còn lại bị từ chối");
  assert.equal(bad[0].reason.code, "trial_attempts_used");
  assert.equal((await quotaStatus(db, "a1", "trial", Q(db).period)).used, 1);
  await db.close();
});

test("idempotency: cùng idem_key retry không trừ thêm lượt", async () => {
  const db = await localD1();
  const q = Q(db, {limit: 2, idemKey: "same"});
  const r1 = await quotaClaim(db, q);
  assert.equal(r1.accepted, true); assert.equal(r1.duplicate, false); assert.equal(r1.used, 1);
  const r2 = await quotaClaim(db, q);
  assert.equal(r2.accepted, true); assert.equal(r2.duplicate, true); assert.equal(r2.used, 1);
  assert.equal((await quotaStatus(db, "a1", "trial", q.period)).used, 1);
  await db.close();
});

test("đủ limit thì từ chối claim mới nhưng retry cũ vẫn được", async () => {
  const db = await localD1();
  const q = Q(db, {limit: 2});
  await quotaClaim(db, {...q, idemKey: "k1"});
  await quotaClaim(db, {...q, idemKey: "k2"});
  await assert.rejects(quotaClaim(db, {...q, idemKey: "k3"}), e => e.code === "trial_attempts_used");
  // retry của lượt đã trừ vẫn accepted (idempotent), không tính thêm
  const r = await quotaClaim(db, {...q, idemKey: "k1"});
  assert.equal(r.duplicate, true); assert.equal(r.used, 2);
  await db.close();
});

test("quotaClaimSQL dùng được với placeholder đánh số (?N) trong batch", async () => {
  const db = await localD1();
  // Mô phỏng cách sessions.js nhét câu quota vào batch với bộ tham số ?N của mình.
  const values = ["sess1", "x", "a1", 999, 0, 0, 0, 0, 0, "phlt", "trial", "d:7", 1];
  const sql = quotaClaimSQL(f => ({accountId: "?3", scope: "?11", period: "?12", idemKey: "?1", now: "?4", limit: "?13"}[f]));
  const batch = [
    db.prepare(sql).bind(...values),
    db.prepare("INSERT INTO quota_claims(account_id,scope,period,idem_key,created_at) SELECT 'probe','trial','d:7','probe',0 WHERE (SELECT COUNT(*) FROM quota_claims WHERE account_id='a1' AND scope='trial' AND period='d:7')<99"),
  ];
  const rs = await db.batch(batch);
  assert.equal(rs[0].meta.changes, 1);
  assert.equal((await quotaStatus(db, "a1", "trial", "d:7")).used, 1);
  await db.close();
});

test("quotaRefund hoàn đúng idem_key của mình", async () => {
  const db = await localD1();
  const q = Q(db, {limit: 2});
  await quotaClaim(db, {...q, idemKey: "k1"});
  await quotaClaim(db, {...q, idemKey: "k2"});
  await quotaRefund(db, {accountId: "a1", scope: "trial", period: q.period, idemKey: "k1"});
  assert.equal((await quotaStatus(db, "a1", "trial", q.period)).used, 1);
  // sau hoàn lượt, claim mới lại được
  const r = await quotaClaim(db, {...q, idemKey: "k3"});
  assert.equal(r.accepted, true); assert.equal(r.used, 2);
  await db.close();
});

test("tham số quota không hợp lệ bị từ chối rõ", async () => {
  const db = await localD1();
  await assert.rejects(quotaClaim(db, Q(db, {scope: "BAD!"})), e => e.code === "bad_quota_scope");
  await assert.rejects(quotaClaim(db, Q(db, {limit: 0})), e => e.code === "bad_quota_limit");
  await assert.rejects(quotaClaim(db, Q(db, {idemKey: ""})), e => e.code === "bad_quota_idem");
  await db.close();
});
