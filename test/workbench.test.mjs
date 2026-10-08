import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(mode='phlt'){const g=game(14);g.run(`fixture('${mode}',80);S.gold=1e8;setFeatureFlags({safe_workbench:true});S.inv=[makeItem(3,0,2,2),makeItem(4,0,2,2),makeItem(9,0,2,2)];`);return g;}
test('preview is pure, quotes native fee and rolls within native caps; receipt prevents double click',()=>{
  for(const mode of ['phlt','g2']){
    const g=ready(mode),before=g.json('S');g.run('var p=workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})');assert.deepEqual(g.json('S'),before);
    assert.equal(g.run('p.cost'),g.run('fuseCost()'));assert.equal(g.run('workbenchExecute(p).saved'),true);
    assert.equal(g.run('S.inv.length'),0);assert.equal(g.run('S.gold'),before.gold-g.run('fuseCost()'));
    assert.ok(g.run('Object.keys(S.mats.ht).every(l=>Number(l)>=1&&Number(l)<=HT_MAX)'));
    const after=g.json('S');assert.equal(g.run('workbenchExecute(p).replayed'),true);assert.deepEqual(g.json('S'),after);
  }
});
test('storage failure preserves inventory/gold/UID, retry saves the same rolled candidate once and stale retry is denied',()=>{
  const g=ready();g.run('var p=workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})');const before=g.json('S');g.failWrites(true);
  assert.equal(g.run('workbenchExecute(p).pending'),true);assert.deepEqual(g.json('S'),before);const candidate=g.json('WORKBENCH_PENDING.candidate');
  assert.equal(g.run('workbenchExecute(p).pending'),true);g.failWrites(false);assert.equal(g.run('workbenchRetry().saved'),true);assert.deepEqual(g.json('S.mats'),candidate.mats);
  assert.equal(g.run('workbenchExecute(p).replayed'),true);
  const h=ready();h.run('var p=workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})');h.failWrites(true);h.run('workbenchExecute(p)');h.failWrites(false);h.run('S.gold++');const state=h.json('S');
  assert.equal(h.run('workbenchRetry().ok'),false);assert.deepEqual(h.json('S'),state);assert.equal(h.run('workbenchDiscard().ok'),true);
});
test('locked/equipped/duplicate/stale/poor inventory and CTC mode cannot consume anything',()=>{
  const g=ready();g.run('var args={kind:"recycle",uids:S.inv.map(it=>it.uid)};var p=workbenchPreview(args);S.inv[0].locked=true');assert.throws(()=>g.run('workbenchPreview(args)'));
  const locked=g.json('S');assert.equal(g.run('workbenchExecute(p).ok'),false);assert.deepEqual(g.json('S'),locked);
  g.run('S.inv[0].locked=false;S.eq.ring1=S.inv[0]');assert.throws(()=>g.run('workbenchPreview(args)'));
  g.run('S.eq.ring1=null;S.gold=0');assert.throws(()=>g.run('workbenchPreview(args)'));
  const h=ready('ctc');const before=h.json('S');assert.throws(()=>h.run('workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})'));assert.deepEqual(h.json('S'),before);
});
test('reroll and enhancement retain native line/count/caps; missing stones fail without spending and enchase caps six',()=>{
  const g=ready();g.run('var p=workbenchPreview({kind:"reroll",uids:[S.inv[0].uid]});var count=S.inv[0].mag.length');assert.equal(g.run('workbenchExecute(p).saved'),true);assert.equal(g.run('S.inv[0].mag.length'),g.run('count'));
  g.run('var p=workbenchPreview({kind:"enhance",uids:[S.inv[0].uid]})');assert.equal(g.run('workbenchExecute(p).saved'),true);assert.ok(g.run('S.inv[0].enh<=ENH_MAX'));
  g.run('S.inv[0].enh=ENH_MAX');assert.throws(()=>g.run('workbenchPreview({kind:"enhance",uids:[S.inv[0].uid]})'));
  g.run(`S.inv=[makeItem(2,0,1,0)];S.mats.ht[5]=2;var key=null;
    for(const a of orePool(0)){const k=oreKey(0,a,1);S.mats.ore[k]=1;if(typeof enchaseCheck(S.inv[0],5,k)!=='string'){key=k;break;}delete S.mats.ore[k];}`);
  assert.ok(g.run('key'));g.run('var p=workbenchPreview({kind:"enchase",uids:[S.inv[0].uid],ht:5,key})');const r=g.json('workbenchExecute(p)');assert.equal(r.saved,true);
  assert.ok(g.run('S.inv[0].mag.length<=VIO_SLOTS'));assert.ok(g.run('modeItemOk(S.inv[0],"phlt")'));
  assert.throws(()=>g.run('workbenchPreview({kind:"upgradeHT",ht:0})'));
  g.run('S.mats.ht[1]=3;var p=workbenchPreview({kind:"upgradeHT",ht:1})');assert.equal(g.run('workbenchExecute(p).saved'),true);assert.ok(g.run('Object.keys(S.mats.ht).every(k=>+k<=HT_MAX)'));
});
test('future namespace, activity/flag/sandbox guards and reload receipts preserve ownership',()=>{
  const g=ready();g.run('var p=workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)});workbenchExecute(p);var receipt=p.id;save();S=migrate(unpack(localStorage.getItem(saveKey())).state)');const before=g.json('S');assert.equal(g.run('workbenchExecute(p).replayed'),true);assert.deepEqual(g.json('S'),before);
  g.run('S.extensions.workbench={v:9,keep:"future"}');assert.throws(()=>g.run('workbenchPreview({kind:"upgradeHT",ht:1})'));assert.equal(g.run('S.extensions.workbench.keep'),'future');
  const h=ready();h.run('setFeatureFlags({})');assert.throws(()=>h.run('workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})'));
  h.run('setFeatureFlags({safe_workbench:true});ADMV.sandbox=true');assert.throws(()=>h.run('workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})'));
  h.run('ADMV.sandbox=false;S.extensions.expedition={status:"active"}');assert.throws(()=>h.run('workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)})'));
});
test('mapped Hoang Kim and g2-only Platina recipes keep item ownership/caps and missing resources never consume bases',()=>{
  for(const mode of ['phlt','g2']){
    const g=ready(mode);g.run('S.inv=[];var key=Object.keys(SHARD_NEEDS)[0];S.mats.shard[key]=SHARD_NEEDS[key];var p=workbenchPreview({kind:"combineShards",key})');
    assert.equal(g.run('workbenchExecute(p).ok'),true);assert.equal(g.run('S.inv[0].r'),4);assert.equal(g.run('S.inv[0].refId'),g.run('key'));
    g.run(`var row=J.sets.gold.find(r=>{const i=makeSetItem('gold',r,0);return i&&platinaPairId(i)});S.inv=[makeSetItem('gold',row,0),makeSetItem('gold',row,0)];`);
    const before=g.json('S');assert.throws(()=>g.run('workbenchPreview({kind:"makePlatina",uids:S.inv.map(it=>it.uid)})'));assert.deepEqual(g.json('S'),before);
    if(mode==='g2'){
      g.run('S.mats.misc.wc=10;S.mats.misc.mys=10;var p=workbenchPreview({kind:"makePlatina",uids:S.inv.map(it=>it.uid)})');
      assert.equal(g.run('workbenchExecute(p).saved'),true);assert.ok(g.run('S.inv.every(it=>modeItemOk(it,"g2"))'));
      g.run(`var base=makeSetItem('gold',row,0);S.inv=[makeSetItem('platina',platBaseRows(platinaPairId(base))[0],0)];S.inv[0].plv=9;S.mats.misc.wc=1000;S.mats.misc.mys=1000;var p=workbenchPreview({kind:'upgradePlatina',uids:[S.inv[0].uid]})`);
      assert.equal(g.run('workbenchExecute(p).saved'),true);assert.ok(g.run('S.inv.every(it=>(it.plv||0)<=10)'));
    }
  }
});
test('remaining native forge/HT/ore operations validate prices, insurance and bounded quantities before atomic execution',()=>{
  const g=ready();g.run('var p=workbenchPreview({kind:"buyHT",ht:1,quantity:3});var gold=S.gold');assert.equal(g.run('workbenchExecute(p).saved'),true);assert.equal(g.run('S.gold'),g.run('gold-htBuyCost(1)*3'));
  assert.throws(()=>g.run('workbenchPreview({kind:"buyHT",ht:1,quantity:-1})'));assert.throws(()=>g.run('workbenchPreview({kind:"buyHT",ht:99})'));
  assert.throws(()=>g.run('workbenchPreview({kind:"upgradeHT",ht:1,insured:true})'));
  g.run('S.mats.misc.thbt=2;var p=workbenchPreview({kind:"upgradeHT",ht:1,insured:true})');assert.equal(g.run('workbenchExecute(p).saved'),true);assert.equal(g.run('S.mats.misc.thbt'),1);
  g.run('var key=oreKey(0,orePool(0)[0],1);S.mats.ore[key]=1;var p=workbenchPreview({kind:"upgradeOre",key})');assert.equal(g.run('workbenchExecute(p).saved'),true);
  g.run('var p=workbenchPreview({kind:"randomForge",key:"thuong"});var before=S.gold');assert.equal(g.run('workbenchExecute(p).saved'),true);assert.equal(g.run('S.gold'),g.run('before-p.cost'));assert.ok(g.run('S.inv.every(it=>modeItemOk(it,"phlt"))'));
});
