import test from "node:test";
import assert from "node:assert/strict";
import { profile } from "../src/ladder.js";

function dbFor(row) {
  return { prepare() { return { bind() { return this; }, async first() { return row; } }; } };
}

test("profile không báo đang xếp hạng khi validation còn pending", async () => {
  const url = new URL("https://example.test/api/profile?name=legacy");
  const p = await profile({}, { DB: dbFor({ name: "legacy", fac: "shaolin", lvl: 60, power: 1, bracket: null, flagged: 0, validation_status: "pending_verification", updated_at: 1 }) }, null, url);
  assert.equal(p.ranked, false);
  assert.equal(p.validation_status, "pending_verification");
});

test("profile chỉ rank khi verified và có bracket", async () => {
  const url = new URL("https://example.test/api/profile?name=ok");
  const p = await profile({}, { DB: dbFor({ name: "ok", fac: "shaolin", lvl: 60, power: 1, bracket: "so", flagged: 0, validation_status: "verified", updated_at: 1 }) }, null, url);
  assert.equal(p.ranked, true);
});
