import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { game } from "./helpers/game.mjs";

test("weekly tasks are mode-specific, lock to one mode, and reward claims replay once", () => {
  const g=game();g.run("fixture('ctc');const before={gold:S.gold,fd:RW().fd};weeklySelect('hunt');questTick('kills',499)");
  assert.equal(g.json("weeklyRead().tasks.find(x=>x.id==='hunt').have"),499);
  assert.equal(g.run("weeklyClaim().ok"),false);
  g.run("questTick('kills',1)");
  assert.equal(g.run("weeklyClaim().ok"),true);
  const after=g.json("({gold:S.gold,fd:RW().fd,claims:weeklyRead().claims.length,selected:weeklyRead().selected})");
  assert.ok(after.gold>0);assert.equal(after.fd,5);assert.equal(after.claims,1);assert.equal(after.selected,"");
  assert.equal(g.run("weeklyClaim().ok"),false);
  g.run("S.mode='phlt'");
  assert.equal(g.run("weeklySelect('journey').ok"),false);
  assert.equal(g.run("weeklyRecord('journey',1)"),false);
});

test("weekly rollover advances monotonically and clock rollback cannot reset claims", () => {
  const g=game();g.run("fixture('g2');weeklySelect('rift');weeklyRecord('rift',1);weeklyClaim();globalThis.weekStart=Date.now();Date.now=()=>weekStart+14*86400000;weeklySync()");
  const advanced=g.json("({week:weeklyRead().week,claims:weeklyRead().claims.length,mode:weeklyRead().mode})");
  assert.equal(advanced.claims,0);assert.equal(advanced.mode,"g2");
  g.run("Date.now=()=>weekStart");
  assert.equal(g.run("weeklySelect('builds').code"),undefined);
  assert.equal(g.run("weeklySelect('builds').ok"),false);
  assert.equal(g.run("weeklyRead().week>weeklyWeekId()"),true);
  assert.equal(g.run("weeklyRecord('builds',3)"),false);
});

test("return bonus is bounded to one absence receipt and preserves old saves", () => {
  const g=game();g.run("fixture('phlt');S.last=Date.now()-8*86400000;weeklyObserveReturn()");
  assert.equal(g.json("weeklyReturnRead().eligibleAt>0"),true);
  assert.equal(g.run("weeklyReturnClaim().ok"),true);
  const once=g.json("({gold:S.gold,fd:RW().fd,claimed:weeklyReturnRead().claimedAt})");
  assert.ok(once.gold>0);assert.equal(once.fd,10);assert.ok(once.claimed>0);
  assert.equal(g.run("weeklyReturnClaim().ok"),false);
  g.run("const base=Date.now;Date.now=()=>base()+9*86400000;weeklyObserveReturn();Date.now=base");
  assert.equal(g.json("weeklyReturnRead().eligibleAt"),0);
  const old=game();old.run("fixture('ctc');delete S.extensions;weeklySync()");
  assert.equal(old.json("weeklyRead().tasks.length"),3);
});

test("weekly reward write failure rolls back claim, currency and future namespaces stay untouched", () => {
  const g=game();g.run("fixture('ctc');weeklySelect('boss');questTick('bosses',5)");
  const before=g.json("({gold:S.gold,fd:RW().fd,claims:weeklyRead().claims.length})");g.failWrites(true);
  assert.equal(g.run("weeklyClaim().ok"),false);
  const after=g.json("({gold:S.gold,fd:RW().fd,claims:weeklyRead().claims.length})");assert.deepEqual(after,before);
  g.failWrites(false);g.run("S.extensions.weeklyTasks={v:2,week:1,mode:'ctc',selected:'',claims:[],tasks:[]}");
  assert.equal(g.run("weeklySelect('hunt').ok"),false);
  assert.equal(g.json("S.extensions.weeklyTasks.v"),2);
});

test("weekly PHLT progress follows completed expedition checkpoints and G2 progress follows a completed rift", () => {
  const phlt=game();phlt.run(readFileSync(new URL('../js/mapobs.js',import.meta.url),'utf8'));
  phlt.run("fixture('phlt',60);setFeatureFlags({expedition:true});npcSfx=()=>{};skillSfx=()=>{};skillFx=()=>{};dirOf=()=>0;fxLine=()=>{};weeklySelect('checkpoints');expeditionPrepare()");
  for(let n=0;n<3;n++)phlt.run("expeditionDepart();for(const e of R.enemies)e.hp=0;killCheck()");
  assert.equal(phlt.run("expeditionFinish('completed').ok"),true);
  const journey=phlt.json("weeklyRead().tasks.map(x=>[x.id,x.have])");
  assert.equal(journey.find(x=>x[0]==='journey')[1],0);assert.equal(journey.find(x=>x[0]==='checkpoints')[1],3);
  assert.equal(phlt.run("weeklySelect('journey').ok&&weeklyRecord('journey',1)"),true);

  const g2=game();g2.run("fixture('g2',60);setFeatureFlags({skill_mutators:true,training_lab:true});weeklySelect('rift');riftPrepare(42);S.extensions.rift.phase='combat';S.extensions.rift.cleared=5;S.extensions.rift.modifiers=Object.keys(RIFT_MODIFIERS).slice(0,5)");
  assert.equal(g2.run("riftFinish('completed').ok"),true);
  assert.equal(g2.json("weeklyRead().tasks.find(x=>x.id==='rift').have"),1);
});
