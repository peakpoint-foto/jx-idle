import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

function ready(){const g=game();g.run("fixture('g2',100);setFeatureFlags({training_lab:true});buildSave(0);S.attr.vit=10;S.attrPts-=10;buildSave(1)");return g;}

test("A/B uses identical conditions and repeats without applying builds or rewards",()=>{
  const g=ready(),state=g.json("S"),runtime=g.json("R"),storage=[...g.storage];
  const result=g.json("buildCompare(0,1,{duration:3,seed:87,incomingDamage:10})");
  assert.deepEqual(result.reports[0].parameters,result.reports[1].parameters);
  assert.deepEqual(result,g.json("buildCompare(0,1,{duration:3,seed:87,incomingDamage:10})"));
  assert.equal(result.delta.dps,result.reports[1].dps-result.reports[0].dps);
  assert.deepEqual(g.json("S"),state);assert.deepEqual(g.json("R"),runtime);assert.deepEqual([...g.storage],storage);
  assert.equal(g.requests.length,0);assert.deepEqual(result.reward,{xp:0,gold:0,items:0});
});

test("sandbox comparison performs no storage/network writes and preserves live save on exit",()=>{
  const g=ready(),before=g.json("S");g.run("ADMV.sandbox=true;ADMV.god=1;ADMV.heroDmg=1000;var writes=0;localStorage.setItem=()=>{writes++;throw Error('write forbidden')};localStorage.removeItem=()=>{writes++;throw Error('write forbidden')}");
  const result=g.json("buildCompare(-1,-1,{duration:2})");
  assert.deepEqual(result.reports[0],result.reports[1]);assert.equal(g.run("writes"),0);assert.equal(g.requests.length,0);
  assert.deepEqual(g.json("S"),before);g.run("ADMV.sandbox=false");assert.deepEqual(g.json("S"),before);
});

test("missing item/empty build and wrong mode/flag reject before changes",()=>{
  const g=ready(),before=g.json("S");
  assert.throws(()=>g.run("buildCompare(0,2)"),/trống/);
  g.run("setFeatureFlags({training_lab:true,build_profiles:true});S.builds[1].equipment={weapon:987654}");
  assert.throws(()=>g.run("buildCompare(0,1)"),/Thiếu trang bị/);
  assert.deepEqual(g.json("S.attr"),before.attr);
  for(const mode of ["ctc","phlt"]){g.run(`S.mode='${mode}'`);assert.throws(()=>g.run("buildCompare(-1,-1)"),/2.0/);}
  g.run("S.mode='g2';setFeatureFlags({training_lab:false})");assert.throws(()=>g.run("buildCompare(-1,-1)"),/2.0/);
});
