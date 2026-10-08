import test from "node:test";
import assert from "node:assert/strict";
import { GAME } from "../gen/game.js";
import { featureConfig, assertAccountFeature, guardedFeature } from "../src/capabilities.js";
import { sha256Hex } from "../src/http.js";

test("new features default closed and overrides cannot escape mode/sandbox rules", () => {
  for (const mode of ["ctc","phlt","g2"]) {
    const config=GAME.featureConfigSnapshot(mode,undefined);
    for (const key of ["build_profiles","training_lab","expedition","skill_mutators","party_combat","seasonal_challenge","trading"]) assert.equal(config.capabilities[key],false);
    assert.equal(GAME.featureEnabled("expedition",mode,{expedition:true}),mode==="phlt");
    assert.equal(GAME.featureEnabled("async_duels",mode,{async_duels:true}),mode==="ctc");
    assert.equal(GAME.featureEnabled("async_duels",mode,{async_duels:true},true),false);
  }
  assert.equal(GAME.featureEnabled("not_registered","ctc",{not_registered:true}),false);
  assert.equal(GAME.featureEnabled("__proto__","ctc",{}),false);
  assert.equal(GAME.featureEnabled("expedition","not_a_mode",{expedition:true}),false);
  assert.equal(GAME.featureEnabled("training_lab","g2",'{broken'),false);
  assert.equal(GAME.featureEnabled("training_lab","g2",{training_lab:"true"}),false);
});

test("public config is versioned, validates mode and exposes only boolean flag allowlist", () => {
  const cfg=featureConfig(new Request("https://game.test/api/config?mode=phlt"),{FEATURE_FLAGS:'{"expedition":true,"unknown":true,"secret":"private"}'});
  assert.equal(cfg.capabilities.expedition,true);
  assert.equal(cfg.capabilities.async_duels,false);
  assert.deepEqual(cfg.feature_flags,{expedition:true});
  assert.equal(cfg.combat_version,GAME.COMBAT_MODEL_VERSION);
  assert.throws(()=>featureConfig(new Request("https://game.test/api/config?mode=unknown"),{}),e=>e.code==="bad_mode");
});

async function fixture(mode,flags,stateOverrides={}) {
  const hash=await sha256Hex("private-test-token-valid-012345");
  return {FEATURE_FLAGS:flags,DB:{prepare(query){return {bind(value){return {async first(){
    if(query.includes("FROM accounts"))return value===hash?{id:"test"}:null;
    if(query.includes("SELECT snapshot"))return value==="test"?{snapshot:JSON.stringify({mode,...stateOverrides})}:null;
    throw new Error("Unexpected query "+query);
  }}}}}}};
}
const request=()=>new Request("https://game.test/api/room?mode=ctc",{headers:{authorization:"Bearer private-test-token-valid-012345"}});
test("account guard trusts stored mode, not request claims; rejects disabled features and sandbox",async()=>{
  assert.equal((await assertAccountFeature(request(),await fixture("ctc",{}),"room_presence")).id,"test");
  const fixtureEnv=await fixture("phlt",{room_presence:true});
  await assert.rejects(()=>assertAccountFeature(request(),fixtureEnv,"room_presence"),e=>e.code==="feature_disabled");
});

test("guard does not call handler when flag is off or character is sandbox",async()=>{
  let called=0;const handler=guardedFeature("room_presence",()=>{called++;return "ok"});
  const off=await fixture("ctc",{room_presence:false});
  const sandbox=await fixture("ctc",{}, {sandbox:true});
  await assert.rejects(()=>handler(request(),off),e=>e.code==="feature_disabled");
  await assert.rejects(()=>handler(request(),sandbox),e=>e.code==="feature_disabled");
  assert.equal(called,0);
  assert.equal(await handler(request(),await fixture("ctc",{})),"ok");
  assert.equal(called,1);
});
