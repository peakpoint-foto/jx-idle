import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';
import {game} from '../../test/helpers/game.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
test('rift modifier stats and damage parts have Worker/browser parity for ten factions and bounded combinations',()=>{
  const g=game();for(const fac of Object.values(GAME.FAC)){
    g.run(`fixture('g2',60);S.fac='${fac.key}';recalc()`);GAME.setS(g.json('S'));const p=GAME.calc();
    for(const mods of [[],['venom','venom','tempo','control','reserve'],['sustain','sustain','echo','echo','reserve']]){
      const before=JSON.stringify(p),server=GAME.riftStats(p,mods);assert.equal(JSON.stringify(p),before);
      assert.deepEqual(plain(server),g.json(`riftStats(calc(),${JSON.stringify(mods)})`),fac.key);
      for(const [el,amount] of Object.entries(server.main.parts))assert.equal(GAME.applyPart(amount,el,server.main.series,0,{[el]:30},75,server.main.series5),g.run(`applyPart(${amount},'${el}',${server.main.series},0,{${el}:30},75,${server.main.series5})`));
    }
  }
  assert.throws(()=>GAME.riftStats(GAME.calc(),['unknown']));assert.equal(GAME.riftModifiersValid(['echo','echo','echo']),false);
});
