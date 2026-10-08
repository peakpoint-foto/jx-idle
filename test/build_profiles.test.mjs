import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

function ready(mode="ctc") {
  const g=game();g.run(`fixture('${mode}',100);setFeatureFlags({build_profiles:true});
    S.sk={10:10,319:1};S.main=319;S.mainLock=true;S.slots=[319,0,0,0];S.rot=false;
    S.attr={str:10,dex:20,vit:30,eng:40};S.attrPts-=100;S.skPts-=10;
    S.eq.weapon=makeItem(0,2,1,2);S.eq.weapon.req=[];
    S.inv.push(makeItem(2,0,1,2));S.inv[0].req=[];recalc();save();`);
  return g;
}

for(const mode of ["ctc","phlt","g2"]) {
  test(`${mode}: full build roundtrip keeps item ownership, budget and combat resource fractions`,()=>{
    const g=ready(mode),ids=g.json("[...S.inv,...Object.values(S.eq)].map(it=>it.uid).sort()"),budget=g.json("[S.attrPts+sumObj(S.attr),S.skPts+sumObj(S.sk)]");
    assert.equal(g.run("buildSave(0).ok"),true);
    assert.equal(g.run("S.builds[0].mode"),mode);assert.equal(g.run("S.builds[0].equipment.weapon"),g.run("S.eq.weapon.uid"));
    g.run("respecAttrs();respecSkills();S.inv.push(S.eq.weapon);delete S.eq.weapon;S.eq.armor=S.inv.shift();S.rot=true;recalc();R.life=R.P.life*.4;R.mana=R.P.mana*.3");
    const before=g.json("S"),preview=g.json("buildPreview(0).summary");
    assert.equal(preview.equipmentCount,1);assert.deepEqual(g.json("S"),before,"preview never applies");
    assert.equal(g.run("buildLoad(0).ok"),true);
    assert.deepEqual(g.json("S.attr"),{str:10,dex:20,vit:30,eng:40});assert.equal(g.run("S.rot"),false);assert.equal(g.run("S.main"),319);
    assert.deepEqual(g.json("[...S.inv,...Object.values(S.eq)].map(it=>it.uid).sort()"),ids);
    assert.deepEqual(g.json("[S.attrPts+sumObj(S.attr),S.skPts+sumObj(S.sk)]"),budget);
    assert.ok(Math.abs(g.run("R.life/R.P.life")-.4)<1e-9);assert.ok(Math.abs(g.run("R.mana/R.P.mana")-.3)<1e-9);
    g.run("load();recalc()");assert.equal(g.run("S.builds[0].v"),2);assert.equal(g.run("buildLoad(0).ok"),true);
  });
}

test("missing gear returns useful preview errors and makes no partial point/equipment changes",()=>{
  const g=ready();g.run("buildSave(0);delete S.eq.weapon");const before=g.json("S"),raw=g.storage.get("jxidle");
  assert.ok(g.run("buildPreview(0).errors.some(x=>x.includes('Thiếu trang bị ID'))"));
  assert.equal(g.run("buildLoad(0).ok"),false);assert.deepEqual(g.json("S"),before);assert.equal(g.storage.get("jxidle"),raw);
});

test("malformed points, wrong faction/mode, passive hotbar and duplicate IDs are rejected",()=>{
  const g=ready();g.run("buildSave(0);var original=JSON.stringify(S.builds[0])");
  for(const patch of ["b.attr.str=-10","b.sk[10]=999","b.sk[4]=.5","b.sk[73]=1","b.fac='tangmen'","b.mode='g2'","b.slots=[4,0,0,0]","b.main=4","b.v=99","b.rot='yes'","b.equipment.armor=b.equipment.weapon"]) {
    g.run(`S.builds[0]=JSON.parse(original);var b=S.builds[0];${patch}`);const before=g.json("S");
    assert.equal(g.run("buildLoad(0).ok"),false,patch);assert.deepEqual(g.json("S"),before);
  }
  assert.equal(g.run("buildSave(-1).ok"),false);assert.equal(g.run("buildLoad(100000).ok"),false);
});

test("locked equipment and mode rarity/requirements stop swaps before inventory changes",()=>{
  const g=ready();g.run("buildSave(0);S.eq.armor=S.inv.shift();S.eq.armor.locked=true");
  assert.ok(g.run("buildPreview(0).errors.some(x=>x.includes('trang bị khóa'))"));
  g.run("delete S.eq.armor.locked;S.eq.weapon.req=[[32,99999]]");
  assert.ok(g.run("buildPreview(0).errors.some(x=>x.includes('điều kiện mặc'))"));
  g.run("S.eq.weapon.req=[];S.eq.weapon.r=5");
  assert.ok(g.run("buildPreview(0).errors.some(x=>x.includes('luật mode'))"));
});

test("build/respec changes are blocked during siege, tower, TK, expedition and online sessions",()=>{
  const g=ready();g.run("buildSave(0)");
  for(const setup of ["S.siege={city:'x'}","R.tower={floor:1}","R.tk={kills:1}","SV.on=true","S.extensions.expedition={status:'active'}","S.extensions.rift={status:'active'}","R.onlineSession={status:'running'}"]) {
    g.run(`S.siege=null;R.tower=null;R.tk=null;SV.on=false;S.extensions={v:1};R.onlineSession=null;${setup}`);
    const before=g.json("S");assert.equal(g.run("buildLoad(0).ok"),false,setup);
    assert.equal(g.run("respecAttrs()"),0);assert.equal(g.run("respecSkills()"),0);assert.deepEqual(g.json("S"),before);
  }
});

test("storage failure rolls back build save and load; sandbox cannot persist profiles",()=>{
  const g=ready();g.run("buildSave(0);respecAttrs();respecSkills();recalc()");const before=g.json("S"),raw=g.storage.get("jxidle");
  g.failWrites(true);assert.equal(g.run("buildLoad(0).ok"),false);assert.deepEqual(g.json("S"),before);
  assert.equal(g.run("buildSave(1).ok"),false);assert.deepEqual(g.json("S"),before);assert.equal(g.storage.get("jxidle"),raw);
  g.failWrites(false);g.run("ADMV.sandbox=true");assert.equal(g.run("buildSave(0).ok"),false);assert.equal(g.run("buildLoad(0).ok"),false);
});

test("legacy point-only builds are validated without claiming old equipment references",()=>{
  const g=ready();g.run("setFeatureFlags({build_profiles:false});S.builds=[{attr:{str:5},sk:{319:1},slots:[319,0,0,0],main:319,mainLock:true,lvl:100}]");
  const id=g.run("S.eq.weapon.uid");assert.equal(g.run("buildLoad(0).ok"),true);assert.equal(g.run("S.eq.weapon.uid"),id);
  assert.equal(g.run("buildSave(1).ok"),true);assert.equal(g.run("S.builds[1].equipment"),null);
  g.run("setFeatureFlags({build_profiles:true});buildSave(2);setFeatureFlags({build_profiles:false})");
  assert.equal(g.run("buildLoad(2).ok"),false);assert.equal(g.run("S.builds[2].v"),2,"flag off does not delete profile");
});

test("full inventory refuses equipment removal; respec/repeated swaps preserve quotas and gold",()=>{
  const g=ready();g.run("var protectedEconomy=JSON.stringify({gold:S.gold,rw:S.rw});buildSave(0)");
  for(let i=0;i<5;i++) {g.run("respecAttrs();respecSkills();recalc()");assert.equal(g.run("buildLoad(0).ok"),true);}
  assert.equal(g.run("JSON.stringify({gold:S.gold,rw:S.rw})"),g.run("protectedEconomy"));
  g.run("S.builds[0].equipment={};while(S.inv.length<INV_MAX){var item=makeItem(2,0,1,1);item.req=[];S.inv.push(item)}");
  const before=g.json("S");assert.ok(g.run("buildPreview(0).errors.some(x=>x.includes('chỗ trong hành trang'))"));
  assert.equal(g.run("buildLoad(0).ok"),false);assert.deepEqual(g.json("S"),before);
});
