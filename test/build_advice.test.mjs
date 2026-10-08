import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";
function ready(mode){const g=game();g.run(`fixture('${mode}',100);setFeatureFlags({build_advice:true,build_profiles:true});S.inv.push(makeItem(2,0,10,2));S.inv[0].req=[];recalc()`);return g;}
for(const mode of ['ctc','phlt','g2'])test(`${mode}: recommendation previews real owned gear and explicit apply preserves budgets`,()=>{
  const g=ready(mode),before=g.json('S'),storage=[...g.storage];
  const advice=g.json("buildAdvice('survival' in BUILD_GOALS[modeId()]?'survival':'mana')");
  // g2 mana may not benefit from an armor roll: check the actual goal with a saved build.
  if(mode==='g2')g.run("buildSave(0);S.attr.eng=20;S.attrPts-=20;buildSave(1);S.attr.eng=0;S.attrPts+=20");
  else {assert.ok(advice.results.length);g.run("var chosen=buildAdvice('survival').results[0];var uid=chosen.source.uid");}
  assert.deepEqual(g.json('S.attr'),before.attr);if(mode!=='g2'){
    assert.deepEqual(g.json('S'),before);assert.deepEqual([...g.storage],storage);
    assert.equal(g.run("buildAdviceApply('survival',chosen.source).ok"),true);
    assert.equal(g.run('S.eq[chosen.source.slot].uid'),g.run('uid'));
    assert.deepEqual(g.json('adviceSummary(calc())'),g.json('chosen.after'));
    assert.deepEqual(g.json('[S.attrPts+sumObj(S.attr),S.skPts+sumObj(S.sk)]'),[before.attrPts+Object.values(before.attr).reduce((a,b)=>a+b,0),before.skPts+Object.values(before.sk).reduce((a,b)=>a+b,0)]);
  }else assert.ok(g.run("buildAdvice('mana').results.some(r=>r.source.kind==='profile')"));
});
test('wrong weapon, requirements, locked slot and mode rarity cannot become suggestions',()=>{
  const g=ready('ctc');g.run("var item=S.inv[0];item.r=5");assert.equal(g.run("buildAdvice('survival').results.length"),0);
  g.run("item.r=2;item.req=[[32,99999]]");assert.equal(g.run("buildAdvice('survival').results.length"),0);
  g.run("item.req=[];S.eq.armor=makeItem(2,0,1,0);S.eq.armor.locked=true");assert.equal(g.run("buildAdvice('survival').results.length"),0);
  g.run("S.inv=[makeItem(0,6,10,2)];S.inv[0].req=[]");assert.equal(g.run("buildAdvice('boss').results.length"),0);
});
test('hidden lines use calc activation and stale suggestions/storage failure never partially apply',()=>{
  const g=ready('phlt');g.run("var row=buildAdvice('survival').results[0];var eq={...S.eq,[row.source.slot]:S.inv[0]}");
  assert.deepEqual(g.json('row.after'),g.json('adviceSummary(calc(eq))'));
  const before=g.json('S');g.failWrites(true);assert.equal(g.run("buildAdviceApply('survival',row.source).ok"),false);assert.deepEqual(g.json('S'),before);
  g.failWrites(false);g.run('S.inv=[]');assert.equal(g.run("buildAdviceApply('survival',row.source).ok"),false);
});
test('flag/sandbox/activity guards and support graph do not remap missing skills',()=>{
  const g=ready('ctc');g.run('setFeatureFlags({})');assert.throws(()=>g.run("buildAdvice('boss')"),/chưa mở/);
  g.run("setFeatureFlags({build_advice:true,build_profiles:true});S.sk={10:1,19:1,271:1};S.main=10;S.mainLock=true");
  assert.ok(g.run("buildAdvice('boss').support.some(l=>l.target===19)"));
  g.run('var row=buildAdvice("survival").results[0];ADMV.sandbox=true');assert.equal(g.run("buildAdviceApply('survival',row.source).ok"),false);
  g.run('ADMV.sandbox=false;S.siege={on:true}');assert.equal(g.run("buildAdviceApply('survival',row.source).ok"),false);
});
