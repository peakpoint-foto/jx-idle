import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';

const piece = grp => ({set:{kind:'gold',grp,n1:1,n2:2,sid:0},d:1,k:1,lvl:60,s:0,base:[],req:[],mag:[],ext:[]});

function serverLife(mode, eq) {
  const previous = GAME.getS();
  try {
    GAME.setS({...GAME.newSave(), mode, fac:'shaolin', lvl:60, eq});
    return GAME.calc().life;
  } finally {
    GAME.setS(previous);
  }
}

test('server calc applies the PHLT set bonus exactly like the client (+6% life)', () => {
  const base = serverLife('phlt', {});
  const withSet = serverLife('phlt', {a:piece(1), b:piece(1)});
  assert.ok(Math.abs(withSet / base - 1.06) < 1e-9, `ratio ${withSet / base}`);
});

test('server calc gives CTC no set-mode bonus', () => {
  const base = serverLife('ctc', {});
  assert.equal(serverLife('ctc', {a:piece(1), b:piece(1)}), base);
});
