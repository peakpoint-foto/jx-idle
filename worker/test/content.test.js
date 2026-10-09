import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { GAME } from "../gen/game.js";

function clientContent() {
  const src = fs.readFileSync(new URL("../../js/content.gen.js", import.meta.url), "utf8");
  const window = {};
  vm.runInNewContext(src, { window }, { filename: "js/content.gen.js" });
  return window.JX_CONTENT;
}

test("worker và client đọc cùng định nghĩa trial (parity qua build-game.mjs)", () => {
  const cli = clientContent();
  // So sánh qua JSON vì object client được tạo trong vm context khác (prototype khác).
  assert.equal(JSON.stringify(GAME.SESSION_TRIAL), JSON.stringify(cli.trial));
  assert.equal(JSON.stringify(GAME.JX_CONTENT.events), JSON.stringify(cli.events));
  // Worker giữ nguyên semantics bất biến như bản hardcode Object.freeze lồng nhau.
  assert.ok(Object.isFrozen(GAME.SESSION_TRIAL));
  assert.ok(Object.isFrozen(GAME.SESSION_TRIAL.rules));
  assert.ok(GAME.SESSION_TRIAL.rules.every(Object.isFrozen));
});

test("validator dùng ở build time từ chối JSON hỏng", () => {
  const src = fs.readFileSync(new URL("../../js/content.js", import.meta.url), "utf8");
  const ctx = {};
  vm.runInNewContext(src, ctx, { filename: "js/content.js" });
  assert.throws(() => ctx.validateTrialRules({ version: "trial-v1" }), /baseHp/);
  assert.throws(() => ctx.validateEventFlags({ version: "events-v1", slots: "nope" }), /slots/);
  // JSON hiện tại phải pass
  const trial = JSON.parse(fs.readFileSync(new URL("../../data/content/trial.v1.json", import.meta.url), "utf8"));
  const events = JSON.parse(fs.readFileSync(new URL("../../data/content/events.v1.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => ctx.validateTrialRules(trial));
  assert.doesNotThrow(() => ctx.validateEventFlags(events));
});
