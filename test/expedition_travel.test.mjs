import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from './helpers/game.mjs';
function ready(){
  const g=game();g.run(readFileSync(new URL('../js/mapobs.js',import.meta.url),'utf8'));
  g.run(`fixture('phlt',60);S.gold=1e6;setFeatureFlags({expedition:true,expedition_travel:true,combat_reports:true});
    npcSfx=()=>{};skillSfx=()=>{};skillFx=()=>{};dirOf=()=>0;fxLine=()=>{};moveManual=()=>{};
    S.inv=[makeItem(2,0,10,2)];S.inv[0].locked=true;R.atkT=100;
  `);return g;
}
function clear(g){g.run('for(const enemy of R.enemies)enemy.hp=0;killCheck();');assert.equal(g.run('expeditionState().phase'),'rest');}

test('travel fee and finite supplies save atomically; cooldown/no-pot/auto/manual never spend persistent stock',()=>{
  const g=ready(),gold=g.run('S.gold');
  g.run('var cost=expeditionTravelPlan(R.P).cost');const cost=g.run('cost');
  g.failWrites(true);assert.equal(g.run('expeditionPrepare().ok'),false);assert.equal(g.run('S.gold'),gold);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);assert.equal(g.run('S.gold'),gold-cost);
  g.run('expeditionDepart();S.potStock.life={1:7};R.life=1');
  g.failWrites(true);assert.equal(g.run('expeditionUseSupply("life").ok'),false);assert.equal(g.run('expeditionState().supplies.life'),2);assert.equal(g.run('R.life'),1);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);assert.equal(g.run('expeditionState().supplies.life'),1);
  assert.equal(g.run('expeditionUseSupply("life").ok'),false);
  g.run('expeditionState().travel.cd=0;S.chal="nopot";R.life=1');
  assert.equal(g.run('expeditionUseSupply("life").ok'),false);g.run('autoPotion(.1)');assert.equal(g.run('expeditionState().supplies.life'),1);
  g.run('S.chal=null;S.ctrl="manual";manual=()=>S.ctrl==="manual";autoPotion(.1)');assert.equal(g.run('expeditionState().supplies.life'),1);
  g.run('S.ctrl="auto";autoPotion(.1)');assert.equal(g.run('expeditionState().supplies.life'),0);
  g.run('expeditionState().travel.cd=0;R.life=1');assert.equal(g.run('expeditionUseSupply("life").ok'),false);
  assert.deepEqual(g.json('S.potStock.life'),{1:7});assert.equal(g.run('S.gold'),gold-cost);
});

test('three stages bank bounded actual loot/gold once, rest is once per checkpoint, full bag/storage failures never partially pay',()=>{
  const g=ready();g.run('expeditionPrepare();var fee=expeditionState().travel.cost;var before=S.gold;');
  for(let i=0;i<3;i++){
    g.run('expeditionDepart()');clear(g);g.run('R.life=10;R.mana=0');
    assert.equal(g.run('expeditionRest().ok'),true);const life=g.run('R.life');
    assert.equal(g.run('expeditionRest().ok'),false);assert.equal(g.run('R.life'),life);
  }
  assert.equal(g.run('expeditionState().travel.gold'),g.run('Math.floor(fee*.5)*3'));
  // Guaranteed fixture item exercises loot transfer even if elite RNG produces no drops.
  g.run('expeditionState().travel.items=[makeItem(2,0,1,2)];var item=expeditionState().travel.items[0];var inventory=S.inv.slice();S.inv=Array.from({length:INV_MAX},(_,i)=>({...inventory[0],uid:10000+i}));');
  assert.equal(g.run('expeditionFinish("completed").ok'),false);assert.equal(g.run('S.gold'),g.run('before'));
  g.run('S.inv=inventory');g.failWrites(true);assert.equal(g.run('expeditionRetrySave().ok'),false);
  assert.equal(g.run('S.gold'),g.run('before'));assert.equal(g.run('S.inv.length'),1);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);
  assert.equal(g.run('S.gold'),g.run('before+Math.floor(fee*.5)*3'));
  assert.equal(g.run('S.inv[1].uid'),g.run('item.uid'));assert.equal(g.run('S.inv[0].locked'),true);
  const receipt=g.json('expeditionState().travel.receipt');
  assert.equal(receipt.items,1);assert.equal(g.run('expeditionFinish("completed").ok'),false);assert.deepEqual(g.json('expeditionState().travel.receipt'),receipt);
});

test('warning fire damage uses combat mitigation, storm spends useful mana and cold modifies speed only inside session',()=>{
  const g=ready();g.run('expeditionPrepare();expeditionDepart();S.ctrl="manual";manual=()=>true;R.atkT=100');
  g.run('var e=expeditionState();e.elapsed=6;expeditionTravelHazard(.1);var initial=R.life;');
  assert.equal(g.run('expeditionState().travel.hazard.kind'),'fire');assert.equal(g.run('R.life'),g.run('initial'));
  g.run('e.elapsed=7.6;expeditionTravelHazard(.1)');assert.ok(g.run('R.life<initial'));
  const hp=g.run('R.life');g.run('expeditionTravelHazard(.1)');assert.equal(g.run('R.life'),hp);
  g.run('e.segment=3;e.travel.hazard=null;e.elapsed=20;e.travel.nextHazard=20;expeditionTravelHazard(.1);e.elapsed=22;R.mana=.1;expeditionTravelHazard(.25)');
  assert.equal(g.run('R.mana'),0);
  assert.equal(g.run('R.combatTrace.events.filter(x=>x.reason==="expedition_storm_spend").at(-1).useful'),.1);
  g.run('e.segment=2;e.travel.hazard={kind:"cold",x:H.x,y:H.y,r:72,warnUntil:0,until:100};var speed=R.P.speed;tick(.1)');
  assert.equal(g.run('R.P.speed'),g.run('speed'));
  const parts=g.json('R.P.main.parts');g.run('expeditionFinish("interrupted")');assert.deepEqual(g.json('R.P.main.parts'),parts);
});

test('retreat requires reachable circle and hold, pursuit is delayed and duplicate withdrawal cannot bank early',()=>{
  const g=ready();g.run('expeditionPrepare();expeditionDepart();');clear(g);g.run('expeditionDepart();S.ctrl="manual";manual=()=>true');
  assert.equal(g.run('expeditionFinish("withdrawn").ok'),true);
  assert.equal(g.run('expeditionState().phase'),'retreat');
  assert.equal(g.run('expeditionFinish("withdrawn").ok'),false);
  assert.equal(g.run('expeditionState().travel.claimed'),false);
  const count=g.run('R.enemies.length');
  g.run('expeditionState().elapsed+=2.1;tick(.05)');assert.ok(g.run('R.enemies.length>=('+count+'+2)'));
  g.run('R.enemies=[];var point=expeditionState().travel.escape;H.x=point.x;H.y=point.y;for(let i=0;i<61&&expeditionActive();i++)tick(.05)');
  assert.equal(g.run('expeditionState().outcome'),'withdrawn');
  assert.equal(g.run('expeditionState().travel.receipt.gold'),g.run('Math.floor(expeditionState().travel.cost*.5)'));
  assert.equal(g.run('expeditionFinish("withdrawn").ok'),false);
});

test('death/reload/flag-off discard unbanked reward without refund and failed clear retries deterministic item properties',()=>{
  for(const ending of ['failed','reload','flag']){
    const g=ready();g.run('expeditionPrepare();var gold=S.gold;expeditionDepart();');clear(g);g.run('expeditionDepart()');
    if(ending==='failed')g.run('R.life=0;heroDeath()');
    if(ending==='reload')g.run('save();var raw=localStorage.getItem(saveKey());R.expeditionRuntime=null;S=migrate(unpack(raw).state);expeditionRecover()');
    if(ending==='flag'){g.run('setFeatureFlags({expedition:true});');g.failWrites(true);g.run('tick(.1)');g.failWrites(false);g.run('expeditionRetrySave()');}
    assert.equal(g.run('S.gold'),g.run('gold'));assert.equal(g.run('S.inv.length'),1);assert.equal(g.run('expeditionActive()'),false);
  }
  const g=ready();g.run('expeditionPrepare();expeditionDepart();var uid=S.uid');g.failWrites(true);g.run('for(const e of R.enemies)e.hp=0;killCheck()');
  assert.equal(g.run('S.uid'),g.run('uid'));assert.equal(g.run('expeditionState().travel.items.length'),0);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);
  assert.ok(g.run('expeditionState().travel.items.every(it=>modeItemOk(it,"phlt"))'));
});

test('escape planning rejects blocked routes and automatic steering reaches a walkable exit without modifying persistent build',()=>{
  const g=ready();g.run('expeditionPrepare();expeditionDepart()');
  g.run(`WORLD.w=WORLD.h=800;OBS.g={gw:20,gh:20,cw:40,ch:40,w:800,h:800,ok:new Uint8Array(400).fill(1)};
    for(let y=0;y<20;y++)OBS.g.ok[y*20+10]=0;H.x=250;H.y=400;
    var point=expeditionEscapePoint();
  `);
  assert.ok(g.run('point.x<400'));assert.equal(g.run('obsWalk(point.x,point.y)'),true);
  g.run('OBS.g=null;expeditionFinish("withdrawn");for(const e of R.enemies){e.dmg=0;e.spd=0};var attr=JSON.stringify(S.attr);for(let i=0;i<240&&expeditionActive();i++)tick(.05)');
  assert.equal(g.run('expeditionState().outcome'),'withdrawn');assert.equal(g.run('JSON.stringify(S.attr)===attr'),true);
});

test('future travel data is preserved and malformed/overstated rewards cannot execute or pay',()=>{
  const g=ready();g.run('expeditionPrepare();expeditionDepart();expeditionState().travel.v=9;expeditionState().travel.future="keep";var before=JSON.stringify(S);');
  g.run('tick(.1);expeditionRecover()');assert.equal(g.run('JSON.stringify(S)===before'),true);
  assert.equal(g.run('expeditionFinish("withdrawn").ok'),false);assert.equal(g.run('expeditionRetrySave().ok'),false);
  g.run('expeditionState().travel.v=1;expeditionState().travel.cd=-1;var gold=S.gold;tick(.1)');
  assert.equal(g.run('expeditionActive()'),false);assert.equal(g.run('S.gold'),g.run('gold'));
  g.run('expeditionPrepare();expeditionDepart()');clear(g);g.run('expeditionState().travel.gold=expeditionState().travel.cost');
  assert.equal(g.run('expeditionFinish("withdrawn").ok'),false);
});
