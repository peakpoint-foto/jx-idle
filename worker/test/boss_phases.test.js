import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';

// 2.6: boss trial nhiều phase — session engine deterministic.
function trialState(seed = 12345) {
  const stats = {life: 50000, mana: 5000, ar: 5000, def: 200, regen: 500, manaRegen: 100,
    series: 0, bossDmg: 1, series5: 0, leech: 0, manaLeech: 0, curseAR: 0, curseDef: 0,
    curseDR: 0, flatDR: 0, manaShield: 0, absorb: 0, res5: 0, block: 0,
    res: {phys: 10, poison: 10, cold: 10, fire: 10, light: 10}, statusRes: {}, ignRes: {},
    main: {id: 1, parts: {phys: 200}, rate: 2, cost: 0, series: 0}, basic: {id: 2, parts: {phys: 100}, rate: 1, cost: 0, series: 0}};
  const actor = GAME.sessionActor('a1', 'Hero', stats);
  const week = 2900;
  const state = GAME.sessionCombatNew('phlt', [actor], seed, 'trial', {week, length: 'short', mutator: null});
  state.rng = 1; // pin RNG như test siege
  return state;
}
const step = s => GAME.sessionCombatStep(s, [], ['a1']);
const reasons = s => s.events.map(e => e.reason).filter(Boolean);

test('boss trial: 3 phase theo % HP + sự kiện boss_phase', () => {
  let s = trialState();
  s.boss.hp = s.boss.max; s.boss.def = 0;
  for (const a of s.actors) a.cooldown = 0;
  let phases = [];
  for (let i = 0; i < 200 && s.status === 'active'; i++) {
    s = step(s);
    for (const e of s.events) if (e.reason === 'boss_phase') phases.push(e.phase);
  }
  assert.deepEqual([...new Set(phases)].sort(), [1, 2], 'phase 1 ở 66%, phase 2 ở 33%');
});

test('boss trial: telegraph 1s trước tuyệt chiêu', () => {
  let s = trialState();
  s.boss.hp = s.boss.max; s.boss.def = 100000; // boss không chết
  for (const a of s.actors) a.p.regen = 1e9; // actor không chết
  let telegraphAt = -1, ultimateAt = -1;
  for (let i = 0; i < 100 && s.status === 'active'; i++) {
    s = step(s);
    for (const e of s.events) {
      if (e.reason === 'boss_telegraph' && telegraphAt < 0) telegraphAt = s.tick;
      if (e.reason === 'boss_ultimate' && ultimateAt < 0) ultimateAt = s.tick;
    }
  }
  assert.ok(telegraphAt > 0 && telegraphAt % 40 === 0, 'telegraph mỗi 40 tick');
  assert.equal(ultimateAt, telegraphAt + 4, 'tuyệt chiêu nổ đúng 1s sau cảnh báo');
});

test('boss trial: enrage sau 90s (360 tick)', () => {
  let s = trialState();
  s.boss.def = 100000;
  for (const a of s.actors) a.p.regen = 1e9;
  s.tick = 355; // tua nhanh tới gần enrage
  for (let i = 0; i < 20 && s.status === 'active' && !s.boss.enraged; i++) s = step(s);
  assert.ok(s.boss.enraged, 'enrage sau 90s');
  assert.ok(s.events.some(e => e.reason === 'boss_enrage'), 'có sự kiện boss_enrage');
});

test('boss trial: deterministic — cùng seed cho cùng chuỗi sự kiện', () => {
  const run = () => {
    let s = trialState(777);
    s.boss.hp = s.boss.max; s.boss.def = 0;
    for (const a of s.actors) a.cooldown = 0;
    for (let i = 0; i < 100 && s.status === 'active'; i++) s = step(s);
    return JSON.stringify(s.events.map(e => [e.reason, e.phase]));
  };
  assert.equal(run(), run(), 'cùng seed → cùng sự kiện');
});
