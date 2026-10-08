import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

for (const mode of ["ctc", "phlt", "g2"]) {
  test(`${mode}: legacy migration preserves character, gear, points and raw backup`, () => {
    const g=game();
    g.run(`fixture('${mode}');S.v=1;S.extensions=undefined;S.gold=12345;S.attrPts=7;S.skPts=9;S.eq={weapon:{r:2,mo:'${mode}',uid:99,base:[],mag:[]}};var oldCid=S.cid;var oldRaw=pack(S);localStorage.setItem(saveKey(),oldRaw);localStorage.setItem(onlKey(),JSON.stringify({token:'do-not-copy'}));load()`);
    assert.equal(g.run("S.v"),2);
    assert.equal(g.run("S.cid===oldCid"),true);
    assert.deepEqual(g.json("[S.mode,S.gold,S.attrPts,S.skPts,S.eq.weapon.uid,S.extensions]"),[mode,12345,7,9,99,{v:1}]);
    assert.equal(g.run("localStorage.getItem(saveKey()+'_pre_v2')===oldRaw"),true);
    assert.equal(g.run("onlGet().token"),"do-not-copy");
    g.run("var migrated=migrate(S);var twice=migrate(migrated)");
    assert.deepEqual(g.json("migrated"),g.json("twice"));
    g.run("save();load()");
    assert.equal(g.run("localStorage.getItem(saveKey()+'_pre_v2')===oldRaw"),true);
  });
}

test("future save is blocked before sanitization or storage overwrite", () => {
  const g=game();g.run("fixture();S.v=99;var original=pack(S);localStorage.setItem(saveKey(),original);load()");
  assert.equal(g.run("SAVE_LOCK"),true);
  assert.ok(g.run("window.__saveBlocked.includes('mới hơn')"));
  g.run("S.fac='shaolin';save()");
  assert.equal(g.run("localStorage.getItem(saveKey())===original"),true);
});

test("backup write failure aborts migration and keeps raw legacy save", () => {
  const g=game();g.run("fixture();S.v=1;var original=pack(S);localStorage.setItem(saveKey(),original)");g.failWrites(true);
  g.run("load()");
  assert.equal(g.run("SAVE_LOCK"),true);
  assert.equal(g.run("localStorage.getItem(saveKey())===original"),true);
});

test("corrupted primary preserves the legacy backup before recovery", () => {
  const g=game();g.run("fixture();S.v=1;var original=pack(S);localStorage.setItem(saveKey(),'broken');localStorage.setItem(saveKey()+'_bak',original);load()");
  assert.equal(g.run("S.v"),2);
  assert.equal(g.run("localStorage.getItem(saveKey()+'_pre_v2')===original"),true);
});

test("future import and replacement leave current slot and online identity unchanged", () => {
  const g=game();g.run("fixture();save();var original=localStorage.getItem(saveKey());var cid=S.cid;localStorage.setItem(onlKey(),JSON.stringify({token:'private'}));var incoming=Object.assign({},S,{v:99,cid:'c_different_12345'})");
  assert.throws(()=>g.run("writeSlot(0,incoming)"),/mới hơn/);
  assert.throws(()=>g.run("importSave(btoa(unescape(encodeURIComponent(pack(incoming)))))"),/mới hơn/);
  assert.equal(g.run("S.cid===cid"),true);
  assert.equal(g.run("localStorage.getItem(saveKey())===original"),true);
  assert.equal(g.run("onlGet().token"),"private");
});

test("extension migrations are nonmutating and reject unknown schema", () => {
  const g=game();
  g.run("var legacy={v:1,fac:'shaolin',mode:'ctc',lvl:1};var migrated=migrateSaveSchema(legacy)");
  assert.equal(g.run("legacy.v"),1);
  assert.equal(g.run("legacy.extensions===undefined"),true);
  assert.deepEqual(g.json("migrated.extensions"),{v:1});
  assert.throws(()=>g.run("migrateSaveSchema({v:2,extensions:{v:99}})"),/chưa được hỗ trợ/);
});

test("backup-only recovery is preserved and unsupported extensions fail closed", () => {
  const g=game();g.run("fixture();S.v=1;var original=pack(S);localStorage.setItem(saveKey()+'_bak',original);load()");
  assert.equal(g.run("S.v"),2);
  assert.equal(g.run("localStorage.getItem(saveKey()+'_pre_v2')===original"),true);
  g.run("fixture();S.extensions={v:99};var invalid=pack(S);localStorage.setItem(saveKey(),invalid);load()");
  assert.equal(g.run("SAVE_LOCK"),true);
  assert.equal(g.run("localStorage.getItem(saveKey())===invalid"),true);
});

test("migration keeps existing activity identity and consumed quotas across reload", () => {
  for (const mode of ["ctc","phlt","g2"]) {
    const g=game();g.run(`fixture('${mode}',100);S.v=1;S.siege={city:'kinh',layer:2,score:100,kills:3,pots:0};towerTries().n=2;tkState().used=1;siegeState().used=1;save();load()`);
    assert.deepEqual(g.json("[S.siege.city,S.siege.layer,towerTries().n,tkState().used,siegeState().used]"),["kinh",2,2,1,1]);
    assert.equal(g.run("requireIdle()"),false);
  }
});

test("sandbox import/replacement cannot write migration backups or unlink tokens", () => {
  const g=game();g.run("fixture('g2');S.v=1;save();var original=localStorage.getItem(saveKey());localStorage.setItem(onlKey(),JSON.stringify({token:'private'}));var replacement=Object.assign({},S,{cid:'c_replacement_12345'});ADMV.sandbox=1");
  assert.throws(()=>g.run("writeSlot(0,replacement)"),/thử nghiệm/);
  assert.throws(()=>g.run("importSave(btoa(unescape(encodeURIComponent(pack(replacement)))))"),/thử nghiệm/);
  assert.equal(g.run("localStorage.getItem(saveKey())===original"),true);
  assert.equal(g.run("localStorage.getItem(saveKey()+'_pre_v2')"),null);
  assert.equal(g.run("onlGet().token"),"private");
});
