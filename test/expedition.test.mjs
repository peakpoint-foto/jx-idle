import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from './helpers/game.mjs';
function ready(){
  const g=game();
  g.run(readFileSync(new URL('../js/mapobs.js',import.meta.url),'utf8'));
  g.run(`fixture('phlt',60);setFeatureFlags({expedition:true,combat_reports:true});
    npcSfx=()=>{};skillSfx=()=>{};skillFx=()=>{};dirOf=()=>0;fxLine=()=>{};
    S.inv=[makeItem(2,0,10,2)];S.inv[0].locked=true;S.eq.weapon=makeItem(0,2,1,2);S.eq.weapon.req=[];recalc();
    R.ground=[{it:makeItem(2,0,1,0),x:100,y:100,age:1}];R.atkT=.8;
  `);return g;
}
const protectedState=g=>g.json('[S.cid,S.eq,S.inv,S.mats,S.gold,S.xp,S.lvl,S.stage,S.maxStage,S.wave,S.potStock,S.totalKills]');

test('expedition transitions prepare/three native combat segments/rest/end are isolated and report activity is correct',()=>{
  const g=ready(),before=protectedState(g),world=g.json('[R.life,R.mana,H.x,H.y,R.ground]');
  assert.equal(g.run('expeditionPrepare().ok'),true);
  assert.equal(g.run('activityBusy()'),true);
  assert.match(g.run('buildChangeProblem()'),/chuyến đi/);
  assert.equal(g.run('expeditionFinish("completed").ok'),false);
  for(let i=1;i<=3;i++){
    assert.equal(g.run('expeditionDepart().ok'),true);
    assert.equal(g.run('expeditionState().segment'),i);
    assert.equal(g.run('R.enemies.length'),i+2);
    g.run('tick(.1)');
    // Kill through actual heroHit + killCheck, exercising production reward interception.
    g.run(`for(const enemy of R.enemies){enemy.x=H.x;enemy.y=H.y;enemy.def=0;enemy.hp=1;for(let n=0;n<20&&enemy.hp>0;n++)heroHit({...R.P.main,parts:{phys:1e9},tot:1e9},enemy);}killCheck();`);
    assert.equal(g.run('expeditionState().phase'),'rest');
    assert.equal(g.run('expeditionState().cleared'),i);
    assert.deepEqual(protectedState(g),before);
  }
  assert.equal(g.run('expeditionFinish("completed").ok'),true);
  assert.equal(g.run('expeditionState().history.length'),1);
  assert.equal(g.run('expeditionState().kills'),12);
  assert.equal(g.run('combatReportHistory()[0].activity'),'expedition');
  assert.equal(g.run('combatReportHistory()[0].outcome'),'won');
  assert.deepEqual(g.json('[R.life,R.mana,H.x,H.y,R.ground]'),world);
  assert.deepEqual(protectedState(g),before);
  assert.equal(g.run('expeditionFinish("completed").ok'),false);
  assert.equal(g.requests.length,0);
});

test('expedition death/withdraw do not consume persistent pots or world loot and simultaneous final kills still fail',()=>{
  for(const outcome of ['failed','withdrawn']){
    const g=ready(),before=protectedState(g);g.run('expeditionPrepare();expeditionDepart();');
    g.run('S.potStock.life={1:5};S.potStock.mana={1:5};R.life=1;R.mana=0;autoPotion(.1)');
    g.run('takeStock("life");bestPotion("life");usePotion("life",J.potions.find(p=>p.kind==="life"),false)');
    assert.deepEqual(g.json('S.potStock'),{life:{1:5},mana:{1:5}});
    g.run('S.potStock={life:{},mana:{}}');
    if(outcome==='failed')g.run('R.life=0;for(const enemy of R.enemies)enemy.hp=0;killCheck();');
    else g.run('expeditionFinish("withdrawn")');
    assert.equal(g.run('S.extensions.expedition.outcome'),outcome);
    assert.deepEqual(protectedState(g),before);
    assert.equal(g.run('R.deadT'),0);
  }
});

test('expedition storage failures roll back entry/transition/end, pause combat and retry the same action once',()=>{
  const g=ready(),before=protectedState(g);
  g.failWrites(true);assert.equal(g.run('expeditionPrepare().ok'),false);assert.equal(g.run('expeditionActive()'),false);
  assert.deepEqual(protectedState(g),before);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);
  g.failWrites(true);assert.equal(g.run('expeditionDepart().ok'),false);assert.equal(g.run('expeditionState().phase'),'prepare');
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);
  g.run('R.life-=100');
  g.failWrites(true);g.run('for(const enemy of R.enemies)enemy.hp=0;killCheck();');
  assert.equal(g.run('expeditionState().phase'),'segment');const elapsed=g.run('expeditionState().elapsed');g.run('tick(.1)');assert.equal(g.run('expeditionState().elapsed'),elapsed);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);assert.equal(g.run('expeditionState().phase'),'rest');
  g.failWrites(true);assert.equal(g.run('expeditionFinish("withdrawn").ok'),false);assert.equal(g.run('expeditionState().status'),'active');
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);assert.equal(g.run('expeditionState().history.length'),1);
  assert.deepEqual(protectedState(g),before);
});

test('expedition crash/reload ends any active phase once and migration/future schemas preserve character assets',()=>{
  for(const phase of ['prepare','segment','rest']){
    const g=ready();g.run('expeditionPrepare()');
    if(phase!=='prepare')g.run('expeditionDepart()');
    if(phase==='rest')g.run('for(const enemy of R.enemies)enemy.hp=0;killCheck();');
    g.run('save();var raw=localStorage.getItem(saveKey());var savedGround=JSON.stringify(S.ground);var before=JSON.stringify([S.eq,S.inv,S.cid,S.mode]);R.expeditionRuntime=null;S=migrate(unpack(raw).state);expeditionRecover();');
    assert.equal(g.run('expeditionState().outcome'),'interrupted');
    assert.equal(g.run('JSON.stringify([S.eq,S.inv,S.cid,S.mode])===before'),true);
    assert.equal(g.run('JSON.stringify(unpack(localStorage.getItem(saveKey())).state.ground)===savedGround'),true);
    g.run('expeditionRecover()');assert.equal(g.run('expeditionState().history.length'),1);
  }
  const g=ready();g.run('S.extensions={v:1,expedition:{v:9,status:"active",future:"keep"}};var old=JSON.stringify(S.extensions);expeditionRecover()');
  assert.equal(g.run('JSON.stringify(S.extensions)===old'),true);
  assert.equal(g.run('expeditionPrepare().ok'),false);
  g.run('S.extensions.expedition={v:1,status:"active",mode:"phlt",character:"another_character"};expeditionRecover()');
  assert.equal(g.run('S.extensions.expedition.outcome'),'invalid_interrupted');
});

test('expedition mode/flag/sandbox/activity guards; flag-off interrupts without loot and stale retry cannot follow a new character',()=>{
  const g=ready();
  for(const mode of ['ctc','g2']){g.run(`S.mode='${mode}'`);assert.equal(g.run('expeditionPrepare().ok'),false);}
  g.run('S.mode="phlt";setFeatureFlags({})');assert.equal(g.run('expeditionPrepare().ok'),false);
  g.run('setFeatureFlags({expedition:true});ADMV.sandbox=true');assert.equal(g.run('expeditionPrepare().ok'),false);
  g.run('ADMV.sandbox=false;S.siege={active:true}');assert.equal(g.run('expeditionPrepare().ok'),false);
  g.run('S.siege=null;expeditionPrepare();expeditionDepart();setFeatureFlags({});tick(.1)');
  assert.equal(g.run('S.extensions.expedition.outcome'),'interrupted');
  g.run('setFeatureFlags({expedition:true})');g.failWrites(true);g.run('expeditionPrepare();S.cid="c_another_character"');g.failWrites(false);
  assert.equal(g.run('expeditionRetrySave().ok'),false);assert.equal(g.run('expeditionActive()'),false);
});

test('expedition flag-off storage failure pauses once, can terminate on retry, and save lock never loops writes',()=>{
  const g=ready();g.run('expeditionPrepare();expeditionDepart();setFeatureFlags({})');
  g.failWrites(true);g.run('tick(.1)');assert.equal(g.run('R.expeditionBlocked'),true);
  const failures=g.run('saveFailN');g.run('for(let i=0;i<10;i++)tick(.1)');assert.equal(g.run('saveFailN'),failures);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);assert.equal(g.run('S.extensions.expedition.outcome'),'interrupted');
  g.run('setFeatureFlags({expedition:true});expeditionPrepare();expeditionDepart();SAVE_LOCK=true;for(let i=0;i<10;i++)tick(.1)');
  assert.equal(g.run('expeditionActive()'),true);assert.equal(g.run('expeditionRetrySave().ok'),false);
});
