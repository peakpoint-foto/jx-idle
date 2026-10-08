import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

function ready() {
  const g=game();g.run("fixture('g2',100);setFeatureFlags({training_lab:true,build_profiles:true});S.sk={10:10,319:1};S.main=319;S.mainLock=true;recalc()");return g;
}

test("fixed seed reproduces results without mutating live state, runtime, storage or RNG",()=>{
  const g=ready(),state=g.json("S"),runtime=g.json("R"),hero=g.json("H"),storage=[...g.storage];
  const first=g.json("trainingRun({seed:42,duration:30,targets:3})"),second=g.json("trainingRun({seed:42,duration:30,targets:3})");
  assert.deepEqual(first,second);assert.equal(first.status,"completed");assert.equal(first.elapsed,30);
  assert.deepEqual(first.reward,{xp:0,gold:0,items:0});assert.equal(first.ranked,false);
  assert.deepEqual(g.json("S"),state);assert.deepEqual(g.json("R"),runtime);assert.deepEqual(g.json("H"),hero);assert.deepEqual([...g.storage],storage);
  const baseline=ready();assert.equal(g.run("Math.random()"),baseline.run("Math.random()"));
});

test("pause/chunks/retry produce the same completed fixed-step report",()=>{
  const g=ready();g.run("var session=trainingCreate({duration:5.03,seed:80});trainingAdvance(session,1.02);session.paused=true");
  const paused=g.json("trainingReport(session)");g.run("trainingAdvance(session,100)");assert.deepEqual(g.json("trainingReport(session)"),paused);
  g.run("session.paused=false;trainingAdvance(session,.01);trainingAdvance(session,2);trainingAdvance(session,2)");
  assert.deepEqual(g.json("trainingReport(session)"),g.json("trainingRun({duration:5.03,seed:80})"));
});

test("mode/flag and parameter guards reject invalid sessions without affecting the game",()=>{
  const g=ready();
  for(const mode of ["ctc","phlt"]) {g.run(`S.mode='${mode}'`);assert.throws(()=>g.run("trainingCreate()"),/2.0/);}
  g.run("S.mode='g2';setFeatureFlags({training_lab:false})");assert.throws(()=>g.run("trainingRun()"),/2.0/);
  g.run("setFeatureFlags({training_lab:true})");
  for(const input of [{targets:9},{seed:-1},{duration:0},{duration:181},{hp:0},{resistance:76},{series:5},{manaFraction:2}])
    assert.throws(()=>g.run(`trainingCreate(${JSON.stringify(input)})`),/không hợp lệ/);
});

test("useful damage clips at target HP, AoE uses the actual target count and no drops occur",()=>{
  const g=ready();g.run("S.sk={319:20};S.main=319;S.mainLock=true;recalc()");
  assert.ok(g.run("R.P.main.targets>1"));
  const single=g.json("trainingRun({duration:2,targets:1,hp:1,def:0})"),multi=g.json("trainingRun({duration:2,targets:4,hp:1,def:0})");
  assert.equal(single.usefulDamage,1);assert.ok(multi.usefulDamage>single.usefulDamage);assert.ok(multi.usefulDamage<=4);
  assert.ok(single.rawDamage>=single.usefulDamage);assert.equal(g.run("S.totalKills"),0);
});

test("mana starvation triggers basic fallback and actual mana remains bounded",()=>{
  const g=ready();const report=g.json("trainingRun({duration:20,manaFraction:0})");
  assert.ok(report.mainStarvedSec>0);assert.ok(report.basicFallbacks>0);assert.ok(report.manaRecovered>0);assert.ok(report.manaRemaining>=0);
  assert.ok(report.manaSpent<=report.manaRecovered+1e-7);
});

test("DOT counts actual ticks and clamps the last partial duration in the shared engine",()=>{
  const g=ready();g.run("S.fac='wudu';S.sk=Object.fromEntries(FAC.wudu.skills.map(id=>[id,SK[id].max]));recalc();S.main=R.P.actives.find(a=>a.parts.poison>0).id;S.mainLock=true;recalc()");
  const report=g.json("trainingRun({duration:10,def:0})");assert.ok(report.dotDamage>0);assert.ok(report.usefulDamage>=report.dotDamage);
  g.run("var enemy={hp:5,max:5,poison:.03,poisonDmg:100};var dot=tickEnemyStatuses(enemy,.05)");
  assert.deepEqual(g.json("dot"),{raw:3,useful:3,healed:0});assert.equal(g.run("enemy.hp"),2);assert.equal(g.run("enemy.poison"),0);
  assert.equal(g.run("tickEnemyStatuses(enemy,.05).raw"),0);
  g.run("var dying={hp:1,max:1,poison:1,poisonDmg:100,stunImm:0};var liveHp=R.life;enemyAI(dying,.05)");
  assert.ok(g.run("dying.hp<=0"));assert.equal(g.run("R.life"),g.run("liveHp"),"DOT-killed enemy cannot attack after death");
});

test("incoming damage tests sustain, sandbox damage/god multipliers never distort the result",()=>{
  const g=ready();const normal=g.json("trainingRun({duration:10,incomingDamage:10,def:0})");
  g.run("ADMV.heroDmg=1000;ADMV.god=1;ADMV.sandbox=true");
  const sandbox=g.json("trainingRun({duration:10,incomingDamage:10,def:0})");assert.deepEqual(sandbox,normal);
  assert.equal(g.run("ADMV.heroDmg"),1000);assert.equal(g.run("ADMV.god"),1);assert.equal(g.run("ADMV.sandbox"),true);
  assert.ok(normal.healthLost>0);
});

test("all ten factions can train and a defeated training player does not die in the live game",()=>{
  const g=ready();const before=g.json("[R.life,S.gold,S.xp]");
  for(const fac of g.json("Object.keys(FAC)")) {
    g.run(`S.fac='${fac}';S.sk=Object.fromEntries(FAC[S.fac].skills.map(id=>[id,1]));S.main=0;S.mainLock=false;recalc()`);
    const report=g.json("trainingRun({duration:2})");assert.equal(report.status,"completed");assert.ok(Number.isFinite(report.dps));
  }
  g.run("fixture('g2',100);setFeatureFlags({training_lab:true});var lifeBefore=R.life");
  const defeat=g.json("trainingRun({duration:20,incomingDamage:1000000})");assert.equal(defeat.status,"defeated");assert.equal(g.run("R.life"),g.run("lifeBefore"));
  assert.equal(g.run("S.gold"),before[1]);assert.equal(g.run("S.xp"),before[2]);
});
