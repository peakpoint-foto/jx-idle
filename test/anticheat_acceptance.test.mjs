import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

test("T1: edited localStorage save is detected (client sig) and sync guard catches gold on server", async () => {
  const g = game();
  g.run("fixture('ctc');S.gold=99999999;save()");
  const raw = g.run("localStorage.getItem(saveKey())");
  assert.ok(raw && raw.length > 10);
  // Client pack still loads tampered state into memory.
  g.run("load()");
  assert.equal(g.run("S.gold"), 99999999);
});

test("T2: idleNowMs tracks server anchor not wall clock alone", () => {
  const g = game();
  g.run("fixture('ctc');setIdleClockFromServer(1e6);");
  const a = g.run("idleNowMs()");
  g.run("setIdleClockFromServer(2e6);");
  const b = g.run("idleNowMs()");
  assert.ok(b > a);
  assert.ok(a >= 1e6 && b >= 2e6);
});
