import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(mode='ctc'){const g=game();g.run(`fixture('${mode}',100);setFeatureFlags({combat_policy:true});S.ctrl='auto';manual=()=>S.ctrl==='manual';combatPolicySave('${mode==='ctc'?'objective':mode==='phlt'?'conserve':'rotation'}',true)`);return g;}
test('objective target excludes dead targets and manual ignores the policy',()=>{
 const g=ready();g.run("H.x=0;H.y=0;var near={id:1,hp:1,x:1,y:0};var boss={id:2,hp:5,x:100,y:0,cls:'boss'};var dead={id:3,hp:0,x:0,y:0,objective:true}");
 assert.equal(g.run('combatPolicyTarget([near,boss,dead]).id'),2);
 g.run('boss.hp=0');assert.equal(g.run('combatPolicyTarget([near,boss,dead]).id'),1);
 g.run("boss.hp=5;S.ctrl='manual'");assert.equal(g.run('combatPolicyTarget([near,boss,dead]).id'),1);
});
test('mana/control reservation and g2 rotation select only affordable learned attacks',()=>{
 const g=ready('g2');g.run("var P={main:{id:10,cost:20,stun:100},basic:{id:0,cost:0},actives:[]};R.mana=0");assert.equal(g.run('pickAttack(P,true).id'),0);
 g.run('R.mana=100;R.policyTarget={stun:1,stunImm:0}');assert.equal(g.run('pickAttack(P,true).id'),0);
 g.run('R.policyTarget={stun:0,stunImm:0}');assert.equal(g.run('pickAttack(P,true).id'),10);
 g.run("S.slots=[10,319,0,0];S.rot=true;P.actives=[{id:10,cost:20,stun:0,dps:100},{id:319,cost:10,stun:0,dps:100}];R.rotI=0");
 assert.equal(g.run('pickAttack(P,true).id'),10);assert.equal(g.run('pickAttack(P,true).id'),319);
 g.run('R.mana=5');assert.equal(g.run('pickAttack(P,false).id'),0);
});
test('PHLT conserves gold, respects cooldown/HOT and does not consume missing stock',()=>{
 const g=ready('phlt'),gold=g.run('S.gold');g.run('R.life=1;autoPotion(.05)');assert.equal(g.run('S.gold'),gold);assert.equal(g.run('S.potUsed||0'),0);
 g.run("var potion=J.potions.find(p=>p.kind==='life');S.potStock={life:{[potion.tier]:2},mana:{}};autoPotion(.05)");assert.equal(g.run('S.potUsed'),1);assert.equal(g.run('stockCount("life")'),1);
 g.run('autoPotion(.05);autoPotion(.05)');assert.equal(g.run('S.potUsed'),1);assert.ok(g.run('R.life>1'));
 g.run('R.hot.lifeT=0;R.hot.cd=0;R.potCd={life:10};R.life=1;autoPotion(.05)');assert.equal(g.run('S.potUsed'),1);
});
test('siege quota, activity stop and challenge prevent potion usage',()=>{
 const g=ready();g.run("var potion=J.potions.find(p=>p.kind==='life');S.potStock={life:{[potion.tier]:2},mana:{}};S.siege={pots:999};R.life=1;autoPotion(.05)");assert.equal(g.run('S.potUsed||0'),0);
 g.run("S.siege=null;S.chal='nopot';autoPotion(.05)");assert.equal(g.run('S.potUsed||0'),0);
 g.run("S.chal='';R.deadT=5;autoPotion(.05)");assert.equal(g.run('S.potUsed||0'),0);
 g.run('R.deadT=0;R.town={};autoPotion(.05)');assert.equal(g.run('S.potUsed||0'),0);
});
test('policy save is atomic, mode scoped, preserves data when disabled and training stays native',()=>{
 const g=ready(),before=g.json('S');g.failWrites(true);assert.equal(g.run("combatPolicySave('balanced',false).ok"),false);assert.deepEqual(g.json('S'),before);
 g.failWrites(false);g.run('setFeatureFlags({combat_policy:false})');assert.equal(g.run('combatPolicy()'),null);assert.deepEqual(g.json('S'),before);
 g.run("setFeatureFlags({combat_policy:true});S.mode='g2'");assert.equal(g.run('combatPolicy()'),null);assert.equal(g.run("combatPolicySave('objective',false).ok"),false);
 g.run("S.mode='ctc';R.training=true");assert.equal(g.run('combatPolicy()'),null);
});
