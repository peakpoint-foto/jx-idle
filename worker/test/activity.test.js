import test from "node:test";
import assert from "node:assert/strict";
import { utcPeriod } from "../src/activity.js";

const T0 = Date.UTC(2026, 9, 8, 12);

test("activity ledger uses UTC day and week periods", () => {
  assert.equal(utcPeriod("tower", T0), "2026-10-08");
  assert.equal(utcPeriod("survival", T0), "2026-10-08");
  assert.equal(utcPeriod("siege", T0), utcPeriod("tk", T0));
  assert.notEqual(utcPeriod("siege", T0), utcPeriod("siege", T0 + 8 * 86400e3));
});
