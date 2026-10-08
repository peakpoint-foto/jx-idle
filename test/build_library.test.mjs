import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run("fixture('g2',100);setFeatureFlags({build_library:true,training_lab:true});S.eq.armor=makeItem(2,0,10,2);S.eq.armor.req=[];S.sk={10:5,319:1};S.skPts-=5;S.main=319;S.mainLock=true;S.slots=[319,0,0,0];var code=buildShareExport()");return g;}
test('share roundtrip contains only template data and imports no equipment/gold/identity',()=>{
 const g=ready(),before=g.json('S');const payload=g.json("JSON.parse(atob(code.slice(5)))");
 for(const key of ['cid','token','name','gold','inv','eq','extensions'])assert.equal(key in payload,false);
 assert.equal(JSON.stringify(payload).includes('uid'),false);assert.equal(g.run('buildSharePreview(code).summary.main'),319);
 assert.equal(g.run("buildLibraryAdd(code,'a').ok"),true);g.run('S.sk={10:1};S.skPts+=5;S.main=10;S.slots=[10,0,0,0]');
 assert.equal(g.run('buildLibraryApply(0).ok'),true);assert.equal(g.run('S.sk[10]'),5);assert.deepEqual(g.json('S.eq'),before.eq);assert.equal(g.run('S.gold'),before.gold);
 assert.equal(g.requests.length,0);g.run('load();recalc()');assert.equal(g.run('buildLibraryEntries().length'),1);
});
test('tampered, oversized, unknown schema/skill/faction and overspent points are rejected',()=>{
 const g=ready();for(const patch of ["p.v=2","p.fac='wudu'","p.mode='ctc'","p.token='private'","p.sk[999999]=1","p.attr.str=999999","p.recipe.armor.attrs=[{attr:'unknown',value:1}]","p.recipe.armor.uid=1"]){
  g.run(`var p=JSON.parse(atob(code.slice(5)));${patch};var bad='JXB1:'+btoa(JSON.stringify(p))`);assert.throws(()=>g.run('buildSharePreview(bad)'));
 }assert.throws(()=>g.run("buildSharePreview('JXB1:'+ 'a'.repeat(20000))"),/quá lớn/);assert.throws(()=>g.run("buildSharePreview('JXB1:abc')"));
});
test('bounded library/measurement history preserves gameplay and rolls back storage failure',()=>{
 const g=ready();assert.equal(g.run("buildLibraryAdd(code,'a').ok"),true);assert.equal(g.run("buildLibraryAdd(code,'a').ok"),false);
 const before=g.json('[S.eq,S.gold,S.xp,S.sk,S.attr,R.life,R.mana]');for(let i=0;i<6;i++)assert.equal(g.run('buildLibraryMeasure(0,{duration:1}).ok'),true);
 assert.equal(g.run('buildLibraryEntries()[0].measurements.length'),5);assert.deepEqual(g.json('[S.eq,S.gold,S.xp,S.sk,S.attr,R.life,R.mana]'),before);
 const state=g.json('S');g.failWrites(true);assert.equal(g.run('buildLibraryRemove(0).ok'),false);assert.deepEqual(g.json('S'),state);
 g.failWrites(false);g.run('ADMV.sandbox=true;var writes=0;localStorage.setItem=()=>{writes++}');assert.equal(g.run('buildLibraryMeasure(0,{duration:1}).ok'),false);assert.equal(g.run('writes'),0);
});
test('mode/flag, future namespace and activity guards deny writes',()=>{
 const g=ready();for(const mode of ['ctc','phlt']){g.run(`S.mode='${mode}'`);assert.throws(()=>g.run('buildShareExport()'),/2.0/);}
 g.run("S.mode='g2';S.extensions.buildLibrary={v:2,entries:[]}");assert.equal(g.run("buildLibraryAdd(code,'a').ok"),false);
 g.run('S.extensions.buildLibrary=null;R.tower={}');assert.equal(g.run("buildLibraryAdd(code,'a').ok"),false);
 g.run('R.tower=null;setFeatureFlags({})');assert.throws(()=>g.run('buildSharePreview(code)'),/2.0/);
});
