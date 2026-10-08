import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

const contracts = {
  ctc: { rarMax: 2, hk: false, platina: false, vio: false, lab: false, rforge: false, admin: false, speeds: [1], defSpeed: 1, diff: 1, expMul: 1, dropMul: 1, tx: 0 },
  phlt: { rarMax: 4, hk: true, platina: false, vio: true, lab: true, rforge: true, admin: false, speeds: [1], defSpeed: 1, diff: 2, expMul: .8, dropMul: 1, tx: 3 },
  g2: { rarMax: 5, hk: true, platina: true, vio: true, lab: true, rforge: true, admin: true, speeds: [1, 1.5, 2.5], defSpeed: 2.5, diff: null, expMul: 2, dropMul: 1.5, tx: 20 },
};

for (const [mode, expected] of Object.entries(contracts)) {
  test(`${mode}: config matches locked mode contract`, () => {
    const g = game();
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(g.json(`MODES['${mode}']['${key}']`), value, key);
  });
  test(`${mode}: rarity and provenance cannot cross mode boundary`, () => {
    const g = game();
    for (let r = 0; r <= 5; r++) assert.equal(g.run(`modeItemOk({r:${r},mo:'${mode}'},'${mode}')`), r <= expected.rarMax);
    for (const source of Object.keys(contracts)) assert.equal(g.run(`modeItemOk({r:2,mo:'${source}'},'${mode}')`), mode === "g2" || mode === source);
    assert.equal(g.run(`modeItemOk({r:2,vio:true},'${mode}')`), expected.vio);
    assert.equal(g.run(`modeItemOk({r:2,set:{kind:'gold'}},'${mode}')`), expected.hk);
    assert.equal(g.run(`modeItemOk({r:2,plv:1},'${mode}')`), expected.platina);
  });
  test(`${mode}: activity quotas stay independent of feature expansion`, () => {
    const g = game(); g.run(`fixture('${mode}',100);towerStart()`);
    assert.equal(g.run("towerTries().n"), mode === "g2" ? 0 : 1);
    g.run(`fixture('${mode}',100);towerTries().n=TOWER_TRIES;towerStart()`);
    assert.equal(g.run("!!R.tower"), mode === "g2");
    g.run(`fixture('${mode}',100);tkState().used=1;tkStart()`);
    assert.equal(g.run("!!R.tk"), mode === "g2");
    g.run(`fixture('${mode}',100);siegeState().used=1;siegeStart('kinh')`);
    assert.equal(g.run("!!S.siege"), mode === "g2");
    assert.equal(g.run("TOWER_TRIES"), 7);
    assert.equal(g.run("TOWER_MAX"), 50);
  });
  test(`${mode}: sanitize preserves legal gear and blocks privileged state`, () => {
    const g = game(); g.run(`fixture('${mode}');S.speed=10;S.diff=0;S.adminDay='2026-10-08';S.eq={weapon:{r:2,mo:'${mode}'}};modeSanitize(S)`);
    assert.equal(g.run("!!S.eq.weapon"), true);
    assert.equal(g.run("modeSpeedOk(S.speed)"), true);
    if (expected.diff !== null) assert.equal(g.run("S.diff"), expected.diff);
    if (!expected.admin) assert.equal(g.run("S.adminDay"), "");
  });
}

test("mode reconciliation selects the more restrictive rank, not trusted identity", () => {
  const g = game(); g.run("fixture('g2');sealWrite(0,'g2')");
  assert.equal(g.run("modeReconcile(0,'ctc')"), "ctc");
  // A more restrictive stored seal wins over an unsealed escalation.
  g.run("sealWrite(0,'ctc')");
  assert.equal(g.run("modeReconcile(0,'g2')"), "ctc");
  // modeReconcile enforces restrictive rank, not tamper-proof identity.
});

test("regular mode transfer is only toward g2 and keeps character identity", () => {
  for (const mode of ["ctc", "phlt"]) {
    const g = game(); g.run(`fixture('${mode}');save();const cidBefore=S.cid;modeTransferDo()`);
    assert.equal(g.run("S.mode"), "g2");
    assert.equal(g.run("S.cid===cidBefore"), true);
    g.run("modeTransferDo()"); assert.equal(g.run("S.mode"), "g2");
  }
});

test("sandbox activity does not persist its entry", () => {
  const g = game(); g.run("fixture('g2');save();const storedBefore=localStorage.getItem(saveKey());ADMV.sandbox=1;towerStart()");
  assert.equal(g.run("localStorage.getItem(saveKey())===storedBefore"), true);
});
