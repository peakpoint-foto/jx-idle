import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

function ready(mode="ctc") {const g=game();g.run(`fixture('${mode}',100);setFeatureFlags({combat_reports:true});`);return g;}
for(const mode of ["ctc","phlt","g2"])test(`${mode}: direct/DOT/overkill and overheal use actual amounts, report reloads safely`,()=>{
  const g=ready(mode);g.run("var enemy={hp:5,max:5,poison:0,poisonDmg:0,act:'at',cls:'normal',series:0,res:{phys:0,poison:0,cold:0,fire:0,light:0},x:0,y:0,r:1};var attack={id:10,useAR:false,crit:0,series:0,series5:0,parts:{phys:100,poison:10}};heroHit(attack,enemy);heal(100,true);var report=combatFinish('won')");
  const direct=g.json("report.totals['damage:outgoing:direct']");assert.equal(direct.useful,5);assert.ok(direct.excess>0);
  const heal=g.json("report.totals['heal:incoming:heal']");assert.equal(heal.useful,0);assert.equal(heal.excess,100);
  assert.equal(g.run("report.totals['damage:outgoing:dot_tick']"),undefined,"poison cast does not count scheduled damage");
  g.run("enemy={hp:5,max:5,poison:.03,poisonDmg:100};tickEnemyStatuses(enemy,.05);var dotReport=combatFinish('won')");
  assert.equal(g.run("dotReport.totals['damage:outgoing:dot_tick'].useful"),3);
  g.run("save();load()");assert.equal(g.run("combatReportHistory().length"),2);assert.equal(g.run("combatReportHistory()[0].mode"),mode);
});

test("mana shield and mana-on-hit have separate raw/capped events",()=>{
  const g=ready();g.run("R.P.res={phys:0,poison:0,cold:0,fire:0,light:0};R.P.statusRes={};R.P.def=0;R.P.block=0;R.P.curseDR=0;R.P.flatDR=0;R.P.manaShield=50;R.P.manaFromHit=100;R.mana=10;var enemy={tid:1,n:'test',hp:100,max:100,cls:'normal',series:0,dmg:100,ar:100000,ranged:false};Math.random=()=>.5;enemyHit(enemy);var report=combatFinish('won')");
  assert.equal(g.run("report.totals['mana:incoming:shield_spend'].raw"),10);
  assert.ok(g.run("report.totals['mana:incoming:hit_recover'].raw>0"));
  assert.ok(g.run("report.totals['damage:incoming:hit'].raw>0"));
});

test("death reasoning requires a recorded lethal event, and abort cannot be mistaken for victory",()=>{
  const g=ready();g.run("combatRecord('damage',{sourceId:'enemy',targetId:'player',raw:1,capacity:100,reason:'hit'});combatRecord('death',{targetId:'player'});var report=combatFinish('defeated')");
  assert.equal(g.run("report.deathReason"),null);
  g.run("combatRecord('damage',{sourceId:'npc_1',targetId:'player',raw:100,capacity:1,reason:'hit_fatal'});combatRecord('death',{targetId:'player'});report=combatFinish('defeated')");
  assert.equal(g.run("report.deathReason.sourceId"),"npc_1");
  g.run("combatRecord('phase',{reason:'started'});var abort=combatFinish('aborted')");assert.equal(g.run("abort.outcome"),"aborted");assert.equal(g.run("abort.deathReason"),null);
});

test("timeline/history are bounded in UTF-8 bytes and export defaults exclude identity/save/token",()=>{
  const g=ready();g.run("S.name='private';S.cid='c_private_identity';for(var j=0;j<8;j++){for(var i=0;i<400;i++)combatRecord('damage',{sourceId:'đ'.repeat(100),targetId:'enemy',skillId:'x'.repeat(100),reason:'y'.repeat(100),raw:1,capacity:1});combatFinish('won')}");
  assert.ok(g.run("combatReportHistory().length<=COMBAT_HISTORY_MAX"));
  assert.ok(g.run("combatReportHistory().every(report=>report.events.length<=COMBAT_TIMELINE_MAX)"));
  assert.ok(g.run("new TextEncoder().encode(JSON.stringify(combatReportHistory())).length<=COMBAT_HISTORY_BYTES"));
  const exported=JSON.parse(g.run("combatDiagnosticExport()"));assert.equal("events" in exported,false);assert.equal("stats" in exported,false);assert.equal("character" in exported,false);assert.equal("name" in exported,false);
  assert.ok(g.run("combatDiagnosticExport(0,{timeline:true,stats:true}).includes('events')"));
  assert.equal(g.run("combatDiagnosticExport(0,{timeline:true,stats:true}).includes('c_private_identity')"),false);
});

test("flag-off preserves archive and isolated training never writes combat reports",()=>{
  const g=ready("g2");g.run("combatRecord('phase',{reason:'started'});combatFinish('won');setFeatureFlags({training_lab:true,combat_reports:true});var before=JSON.stringify(S.extensions.combatReports);trainingRun({duration:2})");
  assert.equal(g.run("JSON.stringify(S.extensions.combatReports)"),g.run("before"));
  g.run("setFeatureFlags({combat_reports:false});combatRecord('phase',{reason:'ignored'});combatFinish('won')");
  assert.equal(g.run("JSON.stringify(S.extensions.combatReports)"),g.run("before"));
});

test("control counts observed alive ticks, potions clip overheal and unknown archives are preserved",()=>{
  const g=ready();g.run("var enemy={hp:10,max:10,stun:.2,stunImm:0,poison:0,combatStunSkill:10};enemyAI(enemy,.05);var report=combatFinish('won')");
  assert.equal(g.run("report.totals['control:outgoing:stun_tick'].duration"),.05);
  g.run("enemy={hp:1,max:10,stun:.2,stunImm:0,poison:1,poisonDmg:100};enemyAI(enemy,.05);report=combatFinish('won')");
  assert.equal(g.run("report.totals['control:outgoing:stun_tick']"),undefined);
  g.run("R.P.life=100;R.life=99;R.P.mana=100;R.mana=99;R.hot={life:100,mana:100,lifeT:.5,manaT:.5};S.potOff=true;autoPotion(1);report=combatFinish('won')");
  assert.equal(g.run("report.totals['heal:incoming:potion'].useful"),1);assert.equal(g.run("report.totals['heal:incoming:potion'].excess"),49);
  assert.equal(g.run("report.totals['mana:incoming:potion_recover'].useful"),1);
  g.run("S.extensions.combatReports={v:99,unknown:'preserve'};combatRecord('phase',{reason:'started'});combatFinish('won')");
  assert.deepEqual(g.json("S.extensions.combatReports"),{v:99,unknown:"preserve"});
});

test("selected diagnostics sanitize extra imported fields and ignore malformed history rows",()=>{
  const g=ready();g.run("combatRecord('damage',{sourceId:'player',targetId:'enemy',raw:1,capacity:1});combatFinish('won');var report=S.extensions.combatReports.history[0];report.events[0].token='private';Object.values(report.totals)[0].save='private';report.stats.token='private';report.deathReason={sourceId:'enemy',reason:'hit_fatal',at:1,token:'private'};S.extensions.combatReports.history.push({bad:true})");
  assert.equal(g.run("combatReportHistory().length"),1);
  assert.equal(g.run("combatDiagnosticExport(0,{timeline:true,stats:true}).includes('private')"),false);
});

test("revival is observed as a phase and activity abort closes one report without awarding victory",()=>{
  const g=ready();g.run("window.obsFrame=()=>{};spawnWave=()=>{};R.sweepT=0;R.deadT=.05;R.life=0;R.dirty=false;tick(.1);var revived=combatFinish('resumed')");
  assert.equal(g.run("revived.events.some(event=>event.kind==='phase'&&event.reason==='revived')"),true);
  assert.equal(g.run("revived.deathReason"),null);
  g.run("R.tower={floor:1};combatRecord('phase',{reason:'started'});towerExit(false);var ended=combatReportHistory()[0]");
  assert.equal(g.run("ended.activity"),"tower");assert.equal(g.run("ended.outcome"),"aborted");
  g.run("combatRecord('phase',{reason:'farm'});towerExit(false)");assert.equal(g.run("R.combatTrace.activity"),"farm","inactive exit cannot end a different activity");
});

test("survival DOT keeps the last partial tick and never records negative skill contribution",()=>{
  const g=ready("phlt");g.run("SV.on=true;SV.maxhp=100;SV.hp=100;SV.pas={};SV.up={};SV.dmg={};SV.en=[{hp:1,max:1,poisonT:.03,poison:100,poisonId:10,cls:'normal',x:0,y:0}];Math.random=()=>1;svMoveEnemies(.05);var report=combatFinish('won')");
  assert.equal(g.run("SV.dmg[10]"),1);assert.equal(g.run("SV.en[0].poisonT"),0);
  assert.equal(g.run("report.activity"),"survival");assert.equal(g.run("report.totals['damage:outgoing:survival_dot_tick'].raw"),3);
  assert.equal(g.run("report.totals['damage:outgoing:survival_dot_tick'].useful"),1);
  g.run("svDamage(SV.en[0],10,10,true)");assert.equal(g.run("SV.dmg[10]"),1,"hitting a dead target cannot reduce accumulated contribution");
});

test("companion damage is recorded separately with useful HP clipping",()=>{
  const g=ready();g.run("window.dirOf=()=>0;H.x=0;H.y=0;RW().pet={tid:Object.keys(MON)[0],lvl:1,xp:0};R.petPos={x:0,y:0,t:0};R.enemies=[{hp:1,max:1,x:0,y:0,r:100}];petTick(.05);var report=combatFinish('won')");
  assert.equal(g.run("report.totals['damage:outgoing:pet'].useful"),1);assert.ok(g.run("report.totals['damage:outgoing:pet'].excess>0"));
});
