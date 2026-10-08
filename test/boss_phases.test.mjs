import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run("fixture('ctc',100);setFeatureFlags({phased_boss:true,combat_reports:true});manual=()=>S.ctrl==='manual';var boss={id:'phase-test',tid:0,n:'Boss',cls:'boss',hp:1000,max:1000,x:0,y:0,r:20,regen:0,def:0,res:{phys:0,poison:0,cold:0,fire:0,light:0},series:0,act:'at',L:100,stun:0,stunImm:0};R.enemies=[boss];phaseBossAttach(boss)");return g;}
test('thresholds only advance and ward death interrupts regeneration without drops/rewards',()=>{
 const g=ready(),before=g.json('[S.gold,S.xp,S.totalKills]');g.run('boss.hp=600;phaseBossTick(.05)');assert.equal(g.run('boss.phaseBoss.phase'),2);assert.equal(g.run('R.enemies.length'),2);assert.ok(g.run('boss.regen>0'));
 g.run('var ward=R.enemies[1];ward.hp=0;onKill(ward);onKill(ward)');assert.equal(g.run('boss.regen'),0);assert.equal(g.run('boss.phaseBoss.broken'),1);assert.deepEqual(g.json('[S.gold,S.xp,S.totalKills]'),before);
 g.run('boss.hp=250;phaseBossTick(.05);boss.hp=900;phaseBossTick(.05)');assert.equal(g.run('boss.phaseBoss.phase'),3);assert.equal(g.run('R.enemies.filter(e=>e.phaseFlagOwner).length'),1);
});
test('telegraph provides reaction time, damage only inside area and records actual useful amount',()=>{
 const g=ready();g.run("S.ctrl='manual';H.x=0;H.y=0;boss.phaseBoss.next=0;phaseBossTick(.05);var hp=R.life");assert.equal(g.run('R.life'),g.run('hp'));
 g.run('phaseBossTick(1.5)');assert.ok(g.run('R.life<hp'));
 g.run('H.x=0;boss.phaseBoss.next=0;phaseBossTick(.05);H.x=1000;var safe=R.life;phaseBossTick(1.5)');assert.equal(g.run('R.life'),g.run('safe'));
 assert.ok(g.run("R.combatTrace.events.some(e=>e.reason==='boss_warning')"));
});
test('contribution clips overkill/overheal and works for all ten factions without role locks',()=>{
 for(const fac of game().json('Object.keys(FAC)')){
  const g=ready();g.run(`phaseBossAbort();S.fac='${fac}';R.enemies=[boss];boss.phaseBoss=null;phaseBossAttach(boss);combatRecord('damage',{sourceId:'player',targetId:'enemy',raw:100,capacity:10});combatRecord('heal',{sourceId:'player',targetId:'player',raw:100,capacity:5});combatRecord('control',{sourceId:'player',targetId:'enemy',duration:.5})`);
  assert.equal(g.run('boss.phaseBoss.damage'),10);assert.equal(g.run('boss.phaseBoss.healing'),5);assert.equal(g.run('boss.phaseBoss.control'),.5);
  g.run("S.sk={[FAC[S.fac].starter]:1};S.main=FAC[S.fac].starter;S.mainLock=true;recalc();boss.hp=600;phaseBossTick(.05);var ward=R.enemies[1];for(var hits=0;ward.hp>0&&hits<200;hits++){ward.act='at';heroHit(R.P.main,ward);tickEnemyStatuses(ward,.2)};onKill(ward)");
  assert.ok(g.run('ward.hp<=0'),fac+' can break ward with learned starter');assert.equal(g.run('boss.phaseBoss.broken'),1);
 }
});
test('boss kill pays existing completion once, abort/wipe do not pay and modes/flags deny',()=>{
 const g=ready();g.run('var paid=0;payKill=()=>{paid++};rwOnKill=()=>{};dexMark=()=>{};onKill(boss);onKill(boss)');assert.equal(g.run('paid'),1);assert.equal(g.run('R.phaseBossResult.outcome'),'won');
 for(const outcome of ['aborted','defeated']){const p=ready();p.run(`var paid=0;payKill=()=>{paid++};phaseBossAbort('${outcome}');onKill(boss)`);assert.equal(p.run('paid'),0);assert.equal(p.run('R.phaseBossResult.outcome'),outcome);assert.equal(p.run('R.enemies.length'),0);}
 const p=ready();p.run('phaseBossAbort();boss.phaseBoss=null;boss.hp=1000');for(const mode of ['phlt','g2']){p.run(`S.mode='${mode}'`);assert.equal(p.run('phaseBossAttach(boss)'),false);}
 p.run("S.mode='ctc';setFeatureFlags({})");assert.equal(p.run('phaseBossAttach(boss)'),false);
});
test('flag off and character switch cancel mechanics without carrying old reward ownership',()=>{
 const g=ready();g.run('boss.hp=600;phaseBossTick(.05);setFeatureFlags({});phaseBossTick(.05)');assert.equal(g.run('boss.regen'),0);assert.equal(g.run('R.enemies.length'),1);assert.equal(g.run('R.phaseBossCurrent'),null);
 const p=ready();p.run("S.cid='another-character';var paid=0;payKill=()=>{paid++};onKill(boss)");assert.equal(p.run('paid'),0);
});
