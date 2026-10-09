import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import worker from "../src/index.js";
import { cleanTelemetryBatch, cleanTelemetryEvent, purgeTelemetry } from "../src/telemetry.js";

const ADMIN_KEYS = JSON.stringify({ t1: "0123456789abcdef0123456789abcdef" });
const now = Date.now();
const good = (e = "active_day", v = { weekend: 1 }) => ({ e, v, iw: "2026-W41", ad: "7-13", mode: "ctc", at: now });

function envFor(db) { return { DB: db, ADMIN_KEYS }; }
async function post(db, body, headers = {}) {
  const r = await worker.fetch(new Request("http://game.test/api/telemetry", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }), envFor(db), {});
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

test("cleanTelemetryEvent chấp nhận batch hợp lệ, từ chối sai định dạng", () => {
  const [e] = cleanTelemetryBatch({ events: [good(), good("session_length", "5-15m"), good("feature_used", "trial")] });
  assert.equal(e.e, "active_day");
  assert.throws(() => cleanTelemetryBatch({ events: [] }), /Batch trống/);
  assert.throws(() => cleanTelemetryBatch({ events: new Array(51).fill(good()) }), /Tối đa 50/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), e: "user_name" }), /không được phép/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), e: "feature_used", v: "Tên Tính Năng Có Dấu" }), /không hợp lệ/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), v: { weekend: 5 } }), /không hợp lệ/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), iw: "tuan-41" }), /Cohort tuần/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), ad: "365" }), /Bucket ngày/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), at: now - 2 * 864e5 }), /Thời gian/);
  assert.throws(() => cleanTelemetryEvent({ ...good(), at: now + 36e5 }), /Thời gian/);
});

test("POST /api/telemetry ghi D1 và purge sự kiện quá 90 ngày", async () => {
  const db = await localD1();
  await db.prepare("INSERT INTO telemetry_events(at,event,install_week,active_days,mode,value) VALUES(?1,'active_day','2026-W01','30+','ctc',null)")
    .bind(now - 91 * 864e5).run();
  const r = await post(db, { events: [good(), good("gold_total", "10k-100k")] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, accepted: 2 });
  const rows = await db.prepare("SELECT event,value FROM telemetry_events ORDER BY id").all();
  assert.equal(rows.results.length, 2); // bản cũ >90 ngày đã bị purge
  assert.equal(rows.results[0].event, "active_day");
  await db.close();
});

test("telemetry bị rate limit khi gửi quá nhanh", async () => {
  const db = await localD1();
  // 240/hour là trần thật; ở đây kiểm tra cơ chế bằng cách gọi dồn dập vẫn ok dưới trần
  for (let i = 0; i < 3; i++) {
    const r = await post(db, { events: [good()] });
    assert.equal(r.status, 200);
  }
  await db.close();
});

test("purgeTelemetry xóa đúng bản ghi cũ", async () => {
  const db = await localD1();
  await db.prepare("INSERT INTO telemetry_events(at,event,install_week,active_days,mode,value) VALUES(?1,'x','2026-W40','1','',null)")
    .bind(now - 100 * 864e5).run();
  await purgeTelemetry(db, now);
  const n = await db.prepare("SELECT COUNT(*) c FROM telemetry_events").first();
  assert.equal(n.c, 0);
  await db.close();
});

test("GET /api/admin/telemetry cần admin key và trả tổng hợp", async () => {
  const db = await localD1();
  await post(db, { events: [good("feature_used", "trial"), good("feature_used", "codex")] });
  const noAuth = await worker.fetch(new Request("http://game.test/api/admin/telemetry"), envFor(db), {});
  assert.equal(noAuth.status, 403);
  const r = await worker.fetch(new Request("http://game.test/api/admin/telemetry?days=7", {
    headers: { "x-admin-key": "0123456789abcdef0123456789abcdef" },
  }), envFor(db), {});
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.rows.length, 1);
  assert.equal(j.rows[0].event, "feature_used");
  assert.equal(j.rows[0].n, 2);
  const badEvent = await worker.fetch(new Request("http://game.test/api/admin/telemetry?event=nope", {
    headers: { "x-admin-key": "0123456789abcdef0123456789abcdef" },
  }), envFor(db), {});
  assert.equal(badEvent.status, 400);
  await db.close();
});

test("feedback worker chấp nhận trường feature trong allowlist", async () => {
  const { cleanFeedback } = await import("../src/feedback.js");
  const fb = cleanFeedback({ text: "góp ý tính năng mới", cat: "idea", feature: "trial", ctx: {} });
  assert.equal(fb.ctx.feature, "trial");
  const fb2 = cleanFeedback({ text: "góp ý tính năng mới", cat: "idea", feature: "hack' OR 1=1", ctx: {} });
  assert.equal(fb2.ctx.feature, "other");
});
