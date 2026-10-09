import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Giá trị hardcode cũ trong js/session_combat.js trước khi chuyển sang JSON (mục 0.2).
// Parity: JSON phải cho đúng các số này — phần hiển thị (name/desc) là thêm mới.
const LEGACY = {
  version: "trial-v1", baseHp: 1200, growth: 1.35, damageGrowth: 0.3,
  lengths: { short: 3, long: 6 },
  rules: [
    { id: "iron", def: 2 },
    { id: "swift", interval: 0.75 },
    { id: "tough", hp: 1.25 },
    { id: "ward", taken: 0.9 },
  ],
};
const LEGACY_TEXT = {
  iron: "Giáp sắt: phòng thủ chủ tướng ×2",
  swift: "Ra đòn nhanh: chủ tướng đánh mỗi 0,75 giây",
  tough: "Trâu bò: HP chủ tướng ×1,25",
  ward: "Hộ thể: sát thương chủ tướng ×0,9",
};

test("trial rules JSON giữ parity với bản hardcode cũ", () => {
  const g = game();
  const t = g.json("JX_CONTENT.trial");
  assert.equal(t.version, LEGACY.version);
  assert.equal(t.baseHp, LEGACY.baseHp);
  assert.equal(t.growth, LEGACY.growth);
  assert.equal(t.damageGrowth, LEGACY.damageGrowth);
  assert.deepEqual(t.lengths, LEGACY.lengths);
  assert.equal(t.rules.length, LEGACY.rules.length);
  LEGACY.rules.forEach((r, i) => {
    assert.equal(t.rules[i].id, r.id);
    for (const k of Object.keys(r)) if (k !== "id") assert.equal(t.rules[i][k], r[k]);
  });
  // SESSION_TRIAL trong game đọc đúng từ JSON
  assert.deepEqual(g.json("SESSION_TRIAL"), t);
});

test("mô tả luật suy từ JSON khớp text cũ từng chữ", () => {
  const g = game();
  assert.deepEqual(g.json("TRIAL_RULE_TEXT"), LEGACY_TEXT);
});

test("sessionTrialRule vẫn xoay đúng theo tuần trên dữ liệu JSON", () => {
  const g = game();
  assert.equal(g.run("sessionTrialRule(0).id"), "iron");
  assert.equal(g.run("sessionTrialRule(3).id"), "ward");
  assert.equal(g.run("sessionTrialRule(4).id"), "iron");
});

test("validator từ chối JSON sai schema với lỗi rõ", () => {
  const g = game();
  const bad = [
    [{}, /version/],
    [{ version: "trial-v9", baseHp: 1, growth: 1, damageGrowth: 0, lengths: { short: 1, long: 1 }, rules: [] }, /rules/],
    [{ version: "v1", baseHp: 1, growth: 1, damageGrowth: 0, lengths: { short: 1, long: 1 }, rules: [{ id: "a", name: "A", desc: "d", def: 1 }] }, /version/],
    [{ version: "trial-v1", baseHp: 1, growth: 1, damageGrowth: 0, lengths: { short: 1, long: 1 }, rules: [{ id: "a", name: "A", desc: "d", def: 1 }, { id: "a", name: "B", desc: "d", def: 1 }] }, /trùng/],
    [{ version: "trial-v1", baseHp: 1, growth: 1, damageGrowth: 0, lengths: { short: 1, long: 1 }, rules: [{ id: "a", name: "A", desc: "d", hack: 1 }] }, /modifier lạ/],
    [{ version: "trial-v1", baseHp: 1, growth: 1, damageGrowth: 0, lengths: { short: 0, long: 1 }, rules: [{ id: "a", name: "A", desc: "d", def: 1 }] }, /lengths/],
  ];
  for (const [input, re] of bad) {
    assert.throws(() => g.run(`validateTrialRules(${JSON.stringify(input)})`), re);
  }
  const badEv = { version: "events-v1", slots: [{ id: "x", kind: "nope", cadence: "weekly", mode: "ctc", enabled: true, name: "X" }] };
  assert.throws(() => g.run(`validateEventFlags(${JSON.stringify(badEv)})`), /kind/);
});

test("contentVersionMismatch phát hiện lệch version (nguyên tắc 10)", () => {
  const g = game();
  assert.equal(g.run(`contentVersionMismatch("trial-v1","trial-v1")`), false);
  assert.equal(g.run(`contentVersionMismatch("trial-v1","trial-v2")`), true);
  assert.equal(g.run(`contentVersionMismatch("","trial-v2")`), false);
});
