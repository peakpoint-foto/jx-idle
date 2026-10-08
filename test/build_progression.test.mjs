import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run("fixture('g2',60);setFeatureFlags({skill_mutators:true,training_lab:true,build_library:true,build_progression:true});riftPrepare(42);var before=JSON.stringify([S.attr,S.sk,S.gold,S.xp,S.eq,S.inv,RW()]);S.extensions.rift.status='ended';S.extensions.rift.phase='ended';S.extensions.rift.cleared=5;S.extensions.rift.modifiers=['tempo','venom','sustain','reserve','control'];S.extensions.rift.history=[{id:'source',seed:42,cleared:5,outcome:'completed',modifiers:['tempo','venom','sustain','reserve','control'],finished:Date.now()}]");return g;}
test('axis, seed and build collections are finite; achievement claims retry once without stats or resources',()=>{
  const g=ready();assert.equal(g.run('buildProgressionSync().ok'),true);assert.equal(g.run('buildProgressionState().axes.length'),5);
  assert.equal(g.run("buildAchievementClaim('axis_tempo').ok"),true);assert.equal(g.run("buildAchievementClaim('axis_tempo').replayed"),true);assert.equal(g.run('buildProgressionState().claims.length'),1);
  assert.equal(g.run("buildAchievementClaim('axis_echo').ok"),false);assert.equal(g.run("buildAchievementClaim('unknown').ok"),false);
  g.run("S.extensions.rift.history.push({id:'other',seed:7,cleared:5,outcome:'completed',modifiers:['echo','reserve','reserve','sustain','control']},{id:'third',seed:8,cleared:5,outcome:'completed',modifiers:['tempo','tempo','venom','venom','sustain']});buildProgressionSync()");
  assert.equal(g.run('buildProgressionState().axes.length'),6);assert.equal(g.run("buildAchievementClaim('seed_three').ok"),true);
  assert.equal(g.run('JSON.stringify([S.attr,S.sk,S.gold,S.xp,S.eq,S.inv,RW()])'),g.run('before'));
});
test('only distinct valid measured templates count; removing library samples and replaying a seed preserves collections',()=>{
  const g=ready();g.run("var code=buildShareExport();buildLibraryAdd(code,'A');buildLibraryMeasure(0,{duration:1});S.mainLock=true;code=buildShareExport();buildLibraryAdd(code,'A settings');buildLibraryMeasure(1,{duration:1});buildProgressionSync()");assert.equal(g.run('buildProgressionState().builds.length'),1);
  g.run("S.attr.str=1;S.attrPts--;code=buildShareExport();buildLibraryAdd(code,'B');buildLibraryMeasure(2,{duration:1});S.attr.dex=1;S.attrPts--;code=buildShareExport();buildLibraryAdd(code,'C');buildLibraryMeasure(3,{duration:1});buildProgressionSync()");
  assert.equal(g.run('buildProgressionState().builds.length'),3);assert.equal(g.run("buildAchievementClaim('build_three').ok"),true);
  g.run('buildLibraryRemove(3);buildLibraryRemove(2);buildLibraryRemove(1);buildLibraryRemove(0);buildProgressionSync()');assert.equal(g.run('buildProgressionState().builds.length'),3);
  const p=g.json('buildProgressionState()');assert.equal(g.run('buildProgressionReset(42).ok'),true);assert.deepEqual(g.json('buildProgressionState()'),p);assert.equal(g.run('riftState().cleared'),0);
});
test('storage failure, reload/old save and malformed or future namespaces preserve claims and unrelated collections',()=>{
  const g=ready();const state=g.json('S');g.failWrites(true);assert.equal(g.run("buildAchievementClaim('rift_first').ok"),false);assert.deepEqual(g.json('S'),state);
  g.failWrites(false);assert.equal(g.run("buildAchievementClaim('rift_first').ok"),true);const p=g.json('buildProgressionState()');g.run('modeAfterLoad();buildProgressionSync()');assert.deepEqual(g.json('buildProgressionState()'),p);
  g.run("S.extensions.buildProgression={v:999,private:'keep'};var unknown=JSON.stringify(S.extensions.buildProgression)");assert.equal(g.run('buildProgressionSync().ok'),false);assert.equal(g.run('buildProgressionReset().ok'),false);assert.equal(g.run('JSON.stringify(S.extensions.buildProgression)'),g.run('unknown'));
  g.run('delete S.extensions.buildProgression');assert.equal(g.run('buildProgressionSync().ok'),true);
});
test('abort cannot mint achievements; wrong mode/flag/sandbox prevents progress writes and quota changes',()=>{
  const g=ready();g.run("S.extensions.rift.history[0].outcome='withdrawn'");assert.equal(g.run("buildAchievementClaim('rift_first').ok"),false);assert.equal(g.run('buildProgressionObserve().axes.length'),0);
  for(const script of ["S.mode='ctc'","S.mode='phlt'","S.mode='g2';ADMV.sandbox=true","ADMV.sandbox=false;setFeatureFlags({})"]){g.run(script);const before=g.json('S');assert.equal(g.run('buildProgressionSync().ok'),false);assert.equal(g.run("buildAchievementClaim('rift_first').ok"),false);assert.deepEqual(g.json('S'),before);}
});
