import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateDuel, leagueTierFor, LEAGUE_TIERS} from '../src/league.js';

test('league tier theo điểm', () => {
  assert.equal(leagueTierFor(0), "dong");
  assert.equal(leagueTierFor(300), "bac");
  assert.equal(leagueTierFor(700), "vang");
  assert.equal(leagueTierFor(1200), "bachkim");
  assert.equal(leagueTierFor(2000), "kimcuong");
  assert.equal(LEAGUE_TIERS.length, 5);
});

test('simulateDuel deterministic theo seed', () => {
  const p1 = {accountId: "a1", power: 1000};
  const p2 = {accountId: "a2", power: 1000};
  const w1 = simulateDuel(p1, p2, 12345);
  const w2 = simulateDuel(p1, p2, 12345);
  assert.equal(w1, w2, "cùng seed -> cùng kết quả");
  // power vượt trội thắng hầu hết
  const p3 = {accountId: "a3", power: 10000};
  let wins = 0;
  for (let s = 0; s < 20; s++) if (simulateDuel(p3, p2, s) === "a3") wins++;
  assert.ok(wins >= 18, `power 10x thắng ${wins}/20`);
});
