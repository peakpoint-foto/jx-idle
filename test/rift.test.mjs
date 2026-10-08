import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run("fixture('g2',60);setFeatureFlags({skill_mutators:true,training_lab:true});var originalSK=JSON.stringify(SK),assets=JSON.stringify([S.sk,S.eq,S.inv,S.gold,S.xp,S.stage,S.wave,RW()]);");return g;}
test('five stages use bounded seeded choices; completion/replay preserve assets, quotas and native skill data',()=>{
  const g=ready();assert.equal(g.run('riftPrepare(42).ok'),true);
  for(let stage=0;stage<5;stage++){
    const choices=g.json('riftChoices(riftState().seed,riftState().cleared,riftState().modifiers)');assert.equal(choices.length,3);
    assert.equal(g.run(`riftChoose('${choices[0]}').ok`),true);
    g.run('for(const e of R.riftRun.runtime.enemies)e.hp=0;riftStep(.05)');assert.equal(g.run('riftState().cleared'),stage+1);
  }
  assert.equal(g.run('riftState().outcome'),'completed');assert.equal(g.run('riftState().badge'),'rift-five');assert.equal(g.run('riftState().history.length'),1);
  assert.equal(g.run("riftFinish('completed').ok"),false);assert.equal(g.run('JSON.stringify(SK)'),g.run('originalSK'));assert.equal(g.run('JSON.stringify([S.sk,S.eq,S.inv,S.gold,S.xp,S.stage,S.wave,RW()])'),g.run('assets'));
  assert.equal(g.run('riftPrepare(42).ok'),true);assert.equal(g.run('riftState().modifiers.length'),0);assert.equal(g.run('riftState().history.length'),1);
});
test('modifier combinations are temporary and repeat native combat deterministically without applying to the live build',()=>{
  const g=ready();const before=g.json('calc()');g.run("var sample=S;var a=trainingCreate({seed:42,duration:2,hp:10000},sample,{riftModifiers:['venom','tempo']});var reportA=trainingAdvance(a,2);var b=trainingCreate({seed:42,duration:2,hp:10000},sample,{riftModifiers:['venom','tempo']});var reportB=trainingAdvance(b,2)");
  assert.deepEqual(g.json('reportA'),g.json('reportB'));assert.deepEqual(g.json('calc()'),before);assert.equal(g.run('JSON.stringify(SK)'),g.run('originalSK'));
  assert.equal(g.run("riftModifiersValid(['tempo','tempo','tempo'])"),false);assert.throws(()=>g.run("riftStats(calc(),['malicious'])"));
});
test('a seeded five-stage run resolves through real native attacks without forcing enemy death',()=>{
  const g=ready();g.run('S.sk[10]=20;S.skPts-=19;S.attr={str:90,dex:90,vit:35,eng:80};S.attrPts=0;recalc();assets=JSON.stringify([S.sk,S.eq,S.inv,S.gold,S.xp,S.stage,S.wave,RW()]);riftPrepare(42)');
  for(let n=0;n<5;n++){
    const options=g.json('riftChoices(riftState().seed,riftState().cleared,riftState().modifiers)'),key=options.includes('sustain')?'sustain':options.includes('reserve')?'reserve':options[0];
    assert.equal(g.run(`riftChoose('${key}').ok`),true);
    g.run('for(let i=0;i<1201&&riftState().status==="active"&&riftState().phase==="combat";i++)riftStep(.05)');
    assert.equal(g.run('riftState().cleared'),n+1,JSON.stringify(g.json('riftState()')));
  }
  assert.equal(g.run('riftState().outcome'),'completed');assert.equal(g.run('JSON.stringify([S.sk,S.eq,S.inv,S.gold,S.xp,S.stage,S.wave,RW()])'),g.run('assets'));
});
test('storage failure rolls back choose/finish, preserves cleared stage for retry, and cannot duplicate history',()=>{
  const g=ready();g.run('riftPrepare(42)');const before=g.json('S');g.failWrites(true);assert.equal(g.run("riftChoose(riftChoices(42,0,[])[0]).ok"),false);assert.deepEqual(g.json('S'),before);
  g.failWrites(false);assert.equal(g.run("riftChoose(riftChoices(42,0,[])[0]).ok"),true);g.failWrites(true);g.run('for(const e of R.riftRun.runtime.enemies)e.hp=0;riftStep(.05)');assert.equal(g.run('riftState().cleared'),0);
  g.failWrites(false);g.run('R.riftBlocked=false;riftStep(.05)');assert.equal(g.run('riftState().cleared'),1);
  g.failWrites(true);assert.equal(g.run("riftFinish('withdrawn').ok"),false);g.failWrites(false);assert.equal(g.run("riftFinish('withdrawn').ok"),true);assert.equal(g.run('riftState().history.length'),1);
});
test('death, reload and flag rollback end without victory; wrong mode/sandbox/future state cannot execute or claim',()=>{
  for(const reason of ['death','reload','flag']){const g=ready();g.run('riftPrepare(42);riftChoose(riftChoices(42,0,[])[0])');
    if(reason==='death')g.run('R.riftRun.runtime.life=0;riftStep(.05)');
    if(reason==='reload')g.run('R.riftRun=null;riftRecover()');
    if(reason==='flag')g.run('setFeatureFlags({});riftStep(.05)');
    assert.equal(g.run('riftState().outcome'),reason==='death'?'failed':'interrupted');assert.equal(g.run('riftState().badge'),undefined);
  }
  const g=ready();g.run("S.mode='ctc'");assert.equal(g.run('riftPrepare(42).ok'),false);g.run("S.mode='g2';ADMV.sandbox=true");assert.equal(g.run('riftPrepare(42).ok'),false);
  g.run('ADMV.sandbox=false;S.extensions={v:1,rift:{v:999,status:"active",private:"preserve"}};var raw=JSON.stringify(S.extensions.rift);riftRecover()');assert.equal(g.run('riftPrepare(42).ok'),false);assert.equal(g.run('JSON.stringify(S.extensions.rift)'),g.run('raw'));
});
