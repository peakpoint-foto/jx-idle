import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(mode='phlt'){const g=game();g.run(`fixture('${mode}',80);S.gold=1e7;setFeatureFlags({resource_summary:true,safe_workbench:true});save()`);return g;}
test('local summary records bounded net deltas only once between persisted saves, segregates modes and never grants resources',()=>{
  for(const mode of ['ctc','phlt','g2']){
    const g=ready(mode);g.run('S.gold+=100;save()');assert.equal(g.run('resourceSummary().entries[0].delta.gold'),100);
    const before=g.json('S');g.run('resourceSummary();save()');assert.equal(g.run('resourceSummary().entries.length'),1);assert.deepEqual(g.json('S'),before);
    g.run('S.mode='+JSON.stringify(mode==='ctc'?'g2':'ctc'));assert.equal(g.run('resourceSummary().unsupported'),true);
  }
});
test('workbench commits ledger with resources, rollback/retry is atomic and unknown namespaces remain untouched',()=>{
  const g=ready();g.run('S.inv=[makeItem(3,0,2,2),makeItem(4,0,2,2),makeItem(9,0,2,2)];save();var p=workbenchPreview({kind:"recycle",uids:S.inv.map(it=>it.uid)});var n=resourceSummary().entries.length');const before=g.json('S');g.failWrites(true);
  assert.equal(g.run('workbenchExecute(p).pending'),true);assert.deepEqual(g.json('S'),before);g.failWrites(false);assert.equal(g.run('workbenchRetry().saved'),true);
  assert.equal(g.run('resourceSummary().entries.length'),g.run('n+1'));assert.equal(g.run('resourceSummary().entries[0].source'),'workbench');assert.equal(g.run('resourceSummary().entries[0].delta.gold'),-g.run('fuseCost()'));
  g.run('S.extensions.resourceLedger={v:9,private:"preserve"};var raw=JSON.stringify(S.extensions.resourceLedger);S.gold++;save()');assert.equal(g.run('JSON.stringify(S.extensions.resourceLedger)===raw'),true);assert.equal(g.run('resourceSummary().unsupported'),true);
});
test('32 entries, sanitized aggregate counts, flag/sandbox guards, and expedition supplies do not enter persistent balances',()=>{
  const g=ready();g.run('for(let n=0;n<40;n++){S.gold++;save()}');assert.equal(g.run('resourceSummary().entries.length'),32);
  assert.ok(g.run('resourceSummary().entries.every(x=>Object.keys(x.delta).every(k=>RESOURCE_FIELDS.includes(k)))'));
  g.run('setFeatureFlags({});var before=JSON.stringify(S.extensions.resourceLedger);S.gold++;save()');assert.equal(g.run('resourceSummary()'),null);assert.equal(g.run('JSON.stringify(S.extensions.resourceLedger)===before'),true);
  g.run('setFeatureFlags({resource_summary:true,expedition:true,expedition_travel:true});ADMV.sandbox=true;save()');assert.equal(g.run('JSON.stringify(S.extensions.resourceLedger)===before'),true);
  g.run('ADMV.sandbox=false;var balance=JSON.stringify(resourceBalances());expeditionPrepare();var fee=expeditionState().travel.cost;var pots=resourceBalances().lifePots;expeditionDepart();R.life=1;expeditionUseSupply("life")');
  assert.equal(g.run('resourceBalances().lifePots'),g.run('pots'));assert.equal(g.run('resourceSummary().entries[0].source'),'expedition');assert.equal(g.run('resourceSummary().entries[0].delta.gold'),-g.run('fee'));
  g.run('S.gold=-1');assert.equal(g.run('resourceSummary().unsupported'),true);
});
