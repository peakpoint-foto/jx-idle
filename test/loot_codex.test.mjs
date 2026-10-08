import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(mode='ctc'){const g=game();g.run(`fixture('${mode}',100);setFeatureFlags({loot_codex:true})`);return g;}
test('source catalog uses drop/recipe config and mode caps without claiming item probabilities',()=>{
 for(const mode of ['ctc','phlt','g2']){
  const g=ready(mode),catalog=g.json('lootCodex()'),before=g.json('S');assert.ok(catalog.sources.every(s=>s.rarities.every(r=>r<=catalog.rarityCap)));
  assert.equal(catalog.sources.some(s=>s.id==='gold'),mode!=='ctc');assert.equal(catalog.sources.some(s=>s.id==='platina'),mode==='g2');
  g.run('var file=dropFile(100);file.main.MaxItemLevel=7');assert.ok(g.run('lootCodex().sources[0].detail.includes("–7")'));assert.deepEqual(g.json('S'),before);
 }
});
test('wishlist AND/OR and hidden active lines reuse actual loot filter',()=>{
 const g=ready();g.run("var item=makeItem(2,0,2,0);item.req=[];item.base=[];var hpId=+Object.keys(J.attr).find(id=>attrName(+id)==='lifemax_v');var manaId=+Object.keys(J.attr).find(id=>attrName(+id)==='manamax_v');item.mag=[{a:hpId,p:[10],h:0},{a:manaId,p:[0],h:0}];item.r=1;S.inv=[item];var raw={minRar:1,ruleMode:'any',activeOnly:false,rules:[{attr:'lifemax_v',min:1},{attr:'manamax_v',min:1}]}");
 assert.equal(g.run('lootWishlistSave(raw).ok'),true);assert.equal(g.run('lootWishlistApply().ok'),true);assert.equal(g.run('lootMatch(item)'),true);
 g.run("raw.ruleMode='all';lootWishlistSave(raw);lootWishlistApply()");assert.equal(g.run('lootMatch(item)'),false);
 g.run("raw.rules=[{attr:'lifemax_v',min:1}];raw.activeOnly=true;item.mag=[{a:manaId,p:[0]},{a:hpId,p:[10]}];item.s=4");
 g.run('lootWishlistSave(raw);lootWishlistApply()');const values=g.json('itemAttributeValues(item,true)');assert.equal(g.run('lootMatch(item)'),(values.lifemax_v||0)>=1);
});
test('stale mode/faction, future namespace, bad rules and sandbox deny writes; locked items remain',()=>{
 const g=ready(),filter={minRar:1,ruleMode:'any',activeOnly:true,rules:[{attr:'lifemax_v',min:1}]};
 g.run(`var raw=${JSON.stringify(filter)};S.eq.armor=makeItem(2,0,2,0);S.eq.armor.locked=true;lootWishlistSave(raw)`);const armor=g.json('S.eq');
 assert.equal(g.run('lootWishlistApply().ok'),true);assert.deepEqual(g.json('S.eq'),armor);
 g.run("S.mode='g2'");assert.equal(g.run('lootWishlistApply().ok'),false);g.run("S.mode='ctc';S.fac='wudu'");assert.equal(g.run('lootWishlistApply().ok'),false);
 g.run("S.fac='shaolin';raw.minRar=5");assert.throws(()=>g.run('lootWishlistSave(raw)'),/mode/);
 g.run('raw.minRar=1;S.extensions.lootWishlist={v:2}');assert.equal(g.run('lootWishlistSave(raw).ok'),false);
 g.run('S.extensions.lootWishlist=null;ADMV.sandbox=true');assert.equal(g.run('lootWishlistSave(raw).ok'),false);
});
test('wishlist persistence rolls back on storage failure and flag off keeps stored criteria',()=>{
 const g=ready();g.run("var raw=lootWishlistForGoal('survival');lootWishlistSave(raw)");const before=g.json('S');g.failWrites(true);assert.equal(g.run('lootWishlistApply().ok'),false);assert.deepEqual(g.json('S'),before);
 g.run('setFeatureFlags({})');assert.throws(()=>g.run('lootCodex()'),/chưa mở/);assert.deepEqual(g.json('S'),before);
});
