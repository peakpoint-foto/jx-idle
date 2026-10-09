import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';
import {game} from '../../test/helpers/game.mjs';

test('equipment playstyle stats match shared Worker calculation',()=>{
  const g=game();
  g.run("fixture('phlt',80);S.eq={helm:{base:[],req:[],mag:[],ext:[],set:{kind:'gold',grp:7,n1:99,n2:2}},armor:{base:[],req:[],mag:[],ext:[],set:{kind:'gold',grp:7,n1:99,n2:2}}}");
  const state=g.json('S');
  const client=g.json("(()=>{setFeatureFlags({equipment_playstyles:true});return calc().statusRes})()");
  GAME.setS(state);
  const worker=GAME.calc(undefined,{featureFlags:{equipment_playstyles:true}}).statusRes;
  assert.deepEqual(worker,client);
  assert.ok(worker.poison>0);
});
