import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';

function equip(mode,kind){
  const g=game();
  g.run(`fixture('${mode}',80);setFeatureFlags({equipment_playstyles:true});
    const item={base:[],req:[],mag:[],ext:[],set:{kind:'${kind}',grp:7,n1:99,n2:2}};
    S.eq={helm:item,armor:{...item},weapon:null};`);
  return g;
}

test('PHLT gold set grants bounded survival stats and unequipping removes them',()=>{
  const g=equip('phlt','gold');
  const before=g.json('calc({}).statusRes');
  const active=g.json('calc().statusRes');
  assert.equal(active.poison,Math.min(75,before.poison+5));
  assert.equal(active.cold,Math.min(75,before.cold+5));
  assert.ok(g.run('calc().regen>calc({}).regen'));
  assert.deepEqual(g.json('calc({helm:S.eq.helm}).statusRes'),before);
});

test('2.0 platinum set grants a bounded attack tempo bonus; CTC never receives it',()=>{
  const g=equip('g2','platina');
  assert.ok(g.run('calc().aspd>calc({}).aspd'));
  g.run("S.mode='ctc'");
  assert.equal(g.run('calc().aspd'),g.run('calc({}).aspd'));
});

test('feature defaults off and wrong set family grants no effect',()=>{
  const g=equip('phlt','gold');
  g.run('setFeatureFlags({})');
  assert.equal(g.run('calc().regen'),g.run('calc({}).regen'));
  g.run("setFeatureFlags({equipment_playstyles:true});S.mode='g2'");
  assert.equal(g.run('calc().aspd'),g.run('calc({}).aspd'));
});
