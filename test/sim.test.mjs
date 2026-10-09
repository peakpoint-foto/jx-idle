import test from "node:test";
import assert from "node:assert/strict";
import { runCell, factionKeys } from "../scripts/sim/lib.mjs";
import { compareCells, checkBudgetTotal } from "../scripts/sim/check.mjs";

test("sim cho cùng kết quả với cùng seed (tiêu chí xong 0.1)", () => {
  const a = runCell("shaolin", 100, "mid", 424242);
  const b = runCell("shaolin", 100, "mid", 424242);
  assert.deepEqual(a, b);
});

test("sim bao phủ 10 phái", () => {
  assert.equal(factionKeys().length, 10);
});

test("compareCells bắt lệch vượt ngưỡng và baseline thiếu", () => {
  const cells = [{ fac: "shaolin", lvl: 60, tier: "mid", dps: 1000 }];
  const base = { "shaolin/60/mid": { dps: 1000 } };
  assert.deepEqual(compareCells(cells, base, 0.1), []);
  const drifted = [{ fac: "shaolin", lvl: 60, tier: "mid", dps: 1150 }];
  const bad = compareCells(drifted, base, 0.1);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].key, "shaolin/60/mid");
  assert.ok(bad[0].dev > 10);
  const missing = compareCells(cells, {}, 0.1);
  assert.equal(missing[0].reason, "missing_baseline");
});

test("checkBudgetTotal fail khi vượt trần, warn khi vào vùng dự trữ", () => {
  const ok = checkBudgetTotal([{ id: "a", value: 0.5, status: "active" }], 1.5, 0.25);
  assert.equal(ok.fail, false);
  assert.equal(ok.warn, false);
  const warn = checkBudgetTotal([{ id: "a", value: 1.2, status: "active" }], 1.5, 0.25);
  assert.equal(warn.fail, false);
  assert.equal(warn.warn, true); // 1.2 > 1.125 nhưng <= 1.5
  const fail = checkBudgetTotal(
    [{ id: "a", value: 1.0, status: "active" }, { id: "b", value: 0.6, status: "active" }], 1.5, 0.25);
  assert.equal(fail.fail, true); // tổng 1.6 > trần 1.5: vượt riêng lẻ cộng dồn cũng bắt
  const inactive = checkBudgetTotal([{ id: "a", value: 5, status: "planned" }], 1.5, 0.25);
  assert.equal(inactive.total, 0); // chỉ tính status active
});
