import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';

const piece = (grp, n2) => `{set:{kind:'gold',grp:${grp},n1:1,n2:${n2},sid:0},d:1,k:1,lvl:60,s:0,base:[],req:[],mag:[],ext:[]}`;

test('CTC gets no set-mode bonus even with a complete set', () => {
  const g = game();
  g.run("fixture('ctc',60)");
  assert.deepEqual(g.json(`setModeBonus({a:${piece(1, 2)},b:${piece(1, 2)}})`), []);
});

test('PHLT bonus needs the set threshold n2 and applies once', () => {
  const g = game();
  g.run("fixture('phlt',60)");
  assert.deepEqual(g.json(`setModeBonus({a:${piece(1, 2)}})`), []);
  assert.deepEqual(g.json('setModeBonus({})'), []);
  assert.deepEqual(g.json(`setModeBonus({a:${piece(1, 2)},b:${piece(1, 2)}})`), [['lifemax_p', 6], ['allres_p', 5]]);
  // Unequipping one piece drops the set below n2 and removes the bonus at once.
  assert.deepEqual(g.json(`setModeBonus({a:${piece(1, 2)},b:null})`), []);
  assert.deepEqual(g.json(`setModeBonus({a:${piece(1, 2)},b:${piece(1, 2)},c:${piece(1, 2)},d:${piece(1, 2)}})`), [['lifemax_p', 6], ['allres_p', 5]]);
});

test('g2 uses its own combo bonus', () => {
  const g = game();
  g.run("fixture('g2',60)");
  assert.deepEqual(g.json(`setModeBonus({a:${piece(3, 2)},b:${piece(3, 2)}})`), [['deadlystrike_p', 4], ['weapondamageenhance_p', 5]]);
});

test('two active sets do not stack: only one set bonus applies', () => {
  const g = game();
  g.run("fixture('phlt',60)");
  const eq = `{a:${piece(1, 2)},b:${piece(1, 2)},c:${piece(2, 2)},d:${piece(2, 2)},e:${piece(2, 2)}}`;
  assert.deepEqual(g.json(`setModeBonus(${eq})`), [['lifemax_p', 6], ['allres_p', 5]]);
});

test('calc raises life only when the PHLT set is active', () => {
  const g = game();
  g.run("fixture('phlt',60)");
  const one = g.json(`calc({a:${piece(1, 2)}}).life`);
  const two = g.json(`calc({a:${piece(1, 2)},b:${piece(1, 2)}}).life`);
  const base = g.json('calc({}).life');
  assert.equal(one, base);
  assert.ok(Math.abs(two / base - 1.06) < 1e-9, `expected +6% life, got ratio ${two / base}`);
});

test('character sheet text names the active set effect or the missing condition', () => {
  const g = game();
  g.run("fixture('phlt',60)");
  assert.equal(g.json(`setModeText({a:${piece(1, 2)}})`), 'Hiệu ứng bộ (PHLT): chưa kích hoạt, cần đủ món cùng bộ');
  assert.equal(g.json(`setModeText({a:${piece(1, 2)},b:${piece(1, 2)}})`), 'Hiệu ứng bộ (PHLT): +6 Sinh lực %, +5 Kháng toàn bộ');
  g.run("fixture('ctc',60)");
  assert.equal(g.json(`setModeText({a:${piece(1, 2)},b:${piece(1, 2)}})`), '');
});

test('character sheet renders with an active PHLT set without errors', () => {
  const g = game();
  g.run("fixture('phlt',60)");
  g.run(`S.eq={a:${piece(1, 2)},b:${piece(1, 2)}}`);
  // Modal openers live in files this harness does not load; the sheet only wires them as click handlers.
  g.run('var powerModal=()=>{},suggestModal=()=>{},respecAttrs=()=>0');
  assert.doesNotThrow(() => g.run('renderChar()'));
});
