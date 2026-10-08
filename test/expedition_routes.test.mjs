import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(seed=42){const g=game(seed);g.run(`fixture('phlt',80);S.gold=1e6;setFeatureFlags({expedition:true,expedition_travel:true,expedition_routes:true,build_advice:true});npcSfx=()=>{};`);return g;}
function clear(g){g.run('for(const e of R.enemies)e.hp=0;killCheck()');assert.equal(g.run('expeditionState().phase'),'rest');}
test('route preview is pure, per-mode/default-off and explicitly quotes actual bounded rewards',()=>{
  const g=ready();const before=g.json('S');
  for(const id of ['shelter','salvage'])for(const contract of [false,true]){
    if(id==='shelter'&&contract){assert.throws(()=>g.run('expeditionRoutePreview("shelter",true)'));continue;}
    const p=g.json(`expeditionRoutePreview('${id}',${contract})`);
    assert.ok(p.goldPerSegment*3<=p.cost*1.5);assert.ok(p.lootMax<=6);assert.ok(p.enemies.length);assert.ok(p.gear.survival);assert.deepEqual(g.json('S'),before);
  }
  for(const mode of ['ctc','g2']){g.run(`S.mode='${mode}'`);assert.equal(g.run('featureEnabled("expedition_routes")'),false);assert.equal(g.run('expeditionPrepare({route:"salvage"}).ok'),false);}
  g.run('S.mode="phlt";setFeatureFlags({})');assert.equal(g.run('featureEnabled("expedition_routes")'),false);
});
test('fee/save retry freezes route and contract; active selection/reset is rejected without paying twice',()=>{
  const g=ready(),gold=g.run('S.gold');g.failWrites(true);
  assert.equal(g.run('expeditionPrepare({route:"salvage",contract:true}).ok'),false);assert.equal(g.run('S.gold'),gold);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);
  const route=g.json('expeditionState().travel.route'),paid=g.run('S.gold');
  assert.deepEqual(route,{v:1,id:'salvage',contract:true});
  assert.equal(g.run('expeditionPrepare({route:"shelter"}).ok'),false);assert.equal(g.run('S.gold'),paid);assert.deepEqual(g.json('expeditionState().travel.route'),route);
});
test('fixed seed routes affect enemies/hazards and payout, preserve native loot legality/roll range and receipt across builds',()=>{
  for(const fac of ready().json('Object.keys(FAC)'))for(const [id,contract] of [['shelter',false],['salvage',false],['salvage',true]]){
    const g=ready(100);g.run(`S.fac='${fac}';S.sk={};S.sk[FAC[S.fac].starter]=1;S.main=FAC[S.fac].starter;recalc();expeditionPrepare({route:'${id}',contract:${contract}});var fee=expeditionState().travel.cost;expeditionDepart();`);
    assert.equal(g.run('R.enemies.length'),3);assert.equal(g.run('R.enemies[0].hp'),g.run('enemyStats(80,"normal").hp*diffOf().hp*expeditionRouteRules().hp'));
    g.run('expeditionState().elapsed=6;expeditionTravelHazard(.1)');assert.equal(g.run('expeditionState().travel.hazard.kind'),id==='shelter'?'cold':'fire');
    clear(g);for(let i=0;i<2;i++){g.run('expeditionDepart()');clear(g);}
    assert.ok(g.run('expeditionState().travel.items.length<=expeditionLootLimit(expeditionState())'));
    assert.ok(g.run('expeditionState().travel.items.every(it=>modeItemOk(it,"phlt"))'));
    const pending=g.json('expeditionState().travel.items');
    assert.equal(g.run('expeditionFinish("completed").ok'),true);assert.ok(g.run('expeditionState().travel.receipt.gold<=fee*1.5'));
    assert.deepEqual(g.json('S.inv'),pending);const gold=g.run('S.gold');assert.equal(g.run('expeditionFinish("completed").ok'),false);assert.equal(g.run('S.gold'),gold);
  }
});
test('deterministic native rolls survive failed clear without reroll or UID duplication',()=>{
  const normal=ready(72),retry=ready(72);
  for(const g of [normal,retry])g.run('expeditionPrepare({route:"salvage",contract:true});expeditionDepart()');
  clear(normal);retry.failWrites(true);retry.run('for(const e of R.enemies)e.hp=0;killCheck()');retry.failWrites(false);assert.equal(retry.run('expeditionRetrySave().ok'),true);
  assert.deepEqual(retry.json('expeditionState().travel.items'),normal.json('expeditionState().travel.items'));
  assert.equal(retry.run('S.uid'),normal.run('S.uid'));
});
test('malformed/future route, shutdown and reward inflation cannot pay or overwrite data',()=>{
  const g=ready();assert.equal(g.run('expeditionPrepare({route:"unknown"}).ok'),false);
  assert.equal(g.run('expeditionPrepare({route:"shelter",contract:true}).ok'),false);
  g.run('expeditionPrepare();expeditionState().travel.route.v=9;var raw=JSON.stringify(S);tick(.1);expeditionRecover()');assert.equal(g.run('JSON.stringify(S)===raw'),true);assert.equal(g.run('expeditionPrepare().ok'),false);assert.equal(g.run('expeditionRetrySave().ok'),false);
  g.run('expeditionState().travel.route.v=1;expeditionState().travel.route.id="invalid";var gold=S.gold;tick(.1)');assert.equal(g.run('expeditionActive()'),false);assert.equal(g.run('S.gold'),g.run('gold'));
  g.run('expeditionPrepare();expeditionDepart()');clear(g);g.run('expeditionState().travel.gold+=1');assert.equal(g.run('expeditionFinish("withdrawn").ok'),false);
  g.run('setFeatureFlags({expedition:true,expedition_travel:true});expeditionRetrySave()');assert.equal(g.run('expeditionState().outcome'),'interrupted');assert.equal(g.run('S.gold'),g.run('gold-expeditionState().travel.cost'));
});
