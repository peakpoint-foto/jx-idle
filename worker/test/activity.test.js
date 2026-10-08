import test from "node:test";
import assert from "node:assert/strict";
import { utcPeriod, validateActivityClaim } from "../src/activity.js";

const T0 = Date.UTC(2026, 9, 8, 12);

test("activity ledger uses UTC day and week periods", () => {
  assert.equal(utcPeriod("tower", T0), "2026-10-08");
  assert.equal(utcPeriod("survival", T0), "2026-10-08");
  assert.equal(utcPeriod("siege", T0), utcPeriod("tk", T0));
  assert.notEqual(utcPeriod("siege", T0), utcPeriod("siege", T0 + 8 * 86400e3));
});

test("activity claims are bounded by activity and replay keys are validated", () => {
  assert.deepEqual(validateActivityClaim({ activity: "siege", event_key: "siege-2026-10-08", contribution: 12, cleared: 3, won: true }), {
    kind: "siege", eventKey: "siege-2026-10-08", contribution: 12, cleared: 3, won: 1,
  });
  assert.throws(() => validateActivityClaim({ activity: "siege", event_key: "siege-2026-10-08", contribution: 12, cleared: 4 }), /bad_cleared/);
  assert.throws(() => validateActivityClaim({ activity: "tower", event_key: "tower-2026-10-08", contribution: 10_000_001, cleared: 1 }), /bad_contribution/);
});
