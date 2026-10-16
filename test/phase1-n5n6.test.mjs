import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

// Phase 1 — N5 (user chốt 16/10/2026: BỎ PHÍ đặc quyền hẳn, để med/v tự cân
// chênh hit-rate: chiêu nội công đo ở hit=1, vật lý ở hit mục tiêu 85%)
// + N6 (crit mở cho mọi loại sát thương trừ poison DoT).
// Test chỉ kiểm tra CƠ CHẾ.

test("N5: không còn phí đặc quyền (đã bỏ theo quyết định user 16/10/2026)", () => {
  const g = game();
  assert.equal(g.json(`typeof N5_PRIVILEGE_FEE_PCT`), "undefined");
  const hit = g.json(`N5_TARGET_HIT_PCT`);
  assert.equal(typeof hit, "number");
  assert.ok(hit > 50 && hit <= 100, `hit mục tiêu trong (50,100], got ${hit}`);
});

test("N5: refDps KHÔNG trừ phí — med/v tự định giá chênh hit-rate", () => {
  const g = game();
  const r = g.json(`(() => {
    const atk = FACTIONS.flatMap(f => f.skills).map(id => SK[id])
      .filter(s => s && isAttack(s) && s.req >= 10 && s.req <= 30);
    const sI = atk.find(s => skillUsesAR(s) === 0); // chiêu nội công: luôn trúng
    const sP = atk.find(s => skillUsesAR(s) === 1); // chiêu vật lý: roll chính xác
    if (!sI || !sP) throw new Error("thiếu skill mẫu cho test N5");
    function manual(s) {
      let best = 0;
      for (const k of [0, 1]) {
        const a = activeInfo(refChar(Math.max(10, s.req), s.fac, k), s, 20);
        const eff = a.tot - (a.parts.poison || 0) * (1 - POISON_EFF);
        const hit = a.useAR ? (s.fac.wcode === 7 ? REF_HIT_RANGED : N5_TARGET_HIT_PCT / 100) : 1;
        best = Math.max(best, eff * expectedHits(a) * a.rate * (a.melee ? MELEE_UPTIME : 1) * hit);
      }
      return best;
    }
    const mI = manual(sI), mP = manual(sP);
    const rI = refDps(sI), rP = refDps(sP);
    return {
      sI: sI.n, sP: sP.n,
      relI: Math.abs(rI - mI) / Math.max(1e-9, mI),
      relP: Math.abs(rP - mP) / Math.max(1e-9, mP),
    };
  })()`);
  assert.ok(r.relI < 1e-9, `chiêu nội công không chịu phí: refDps phải bằng manual, rel err=${r.relI} (${r.sI})`);
  assert.ok(r.relP < 1e-9, `chiêu vật lý đo ở hit mục tiêu, rel err=${r.relP} (${r.sP})`);
});

test("N6: activeInfo cộng crit cho mọi loại sát thương trừ poison", () => {
  const g = game();
  // SK[82] "Tứ Tượng Đồng Quy": cold thuần (không phys, không poison)
  // SK[69] "Vô Hình Độc": poison thuần
  const r = g.json(`(() => {
    const withCrit = (s, c) => activeInfo(Object.assign(refChar(20, s.fac, 0), {crit: c}), s, 20);
    const sE = SK[82], sPo = SK[69];
    const out = {};
    {
      const i0 = withCrit(sE, 0);
      if ((i0.parts.phys || 0) !== 0 || (i0.parts.poison || 0) !== 0 || i0.tot <= 0)
        throw new Error("giả thiết skill 82 cold thuần bị phá vỡ");
      const i40 = withCrit(sE, 40);
      const base = i0.tot - (i0.parts.poison || 0); // nền crit: tot TRỪ poison
      const expDelta = base * 0.40 * (CRIT_MULT - 1) * expectedHits(i0) * i0.rate * (i0.melee ? MELEE_UPTIME : 1);
      out.elem = { n: sE.n, delta: i40.dps - i0.dps, expDelta,
        rel: Math.abs((i40.dps - i0.dps) - expDelta) / Math.max(1e-9, expDelta) };
    }
    {
      const p0 = withCrit(sPo, 0);
      if ((p0.parts.poison || 0) <= 0 || (p0.tot - (p0.parts.poison || 0)) !== 0)
        throw new Error("giả thiết skill 69 poison thuần bị phá vỡ");
      const p100 = withCrit(sPo, 100);
      out.poison = { n: sPo.n, delta: p100.dps - p0.dps }; // độc thuần -> crit không cộng gì
    }
    return out;
  })()`);
  assert.ok(r.elem.delta > 0, `chiêu nguyên tố phải được hưởng crit (trước fix = 0), skill=${r.elem.n}`);
  assert.ok(r.elem.rel < 1e-9, `nền crit = tot trừ poison, rel err=${r.elem.rel}`);
  assert.ok(Math.abs(r.poison.delta) < 1e-9, `poison DoT không crit, skill=${r.poison.n}, delta=${r.poison.delta}`);
});

test("N6: heroHit crit nhân mọi loại sát thương trừ poison", () => {
  const g = game();
  const r = g.json(`(() => {
    R.P = {ar: 10000, crit: 100, series5: 0, bossDmg: 1, ignRes: {}, curseDef: 0};
    const admv = ADMV.heroDmg;
    const mkE = () => ({x: 0, y: 0, r: 10, hp: 1e12, tid: "0", act: "at", def: 0,
      res: {phys: 0, poison: 0, cold: 0, fire: 0, light: 0}, series: 0, cls: "normal", poison: 0, poisonDmg: 0});
    const mkA = parts => ({id: 901, useAR: 0, crit: 100, parts, series: 0, series5: 0, ignore: 0});
    const dFire = heroHit(mkA({fire: 1000}), mkE()) / (1000 * admv);
    const dPhys = heroHit(mkA({phys: 1000}), mkE()) / (1000 * admv);
    const eP = mkE();
    const dPoisonRet = heroHit(mkA({poison: 1000}), eP);
    return {dFire, dPhys, dPoisonRet, poisonTick: eP.poisonDmg / (1000 * admv)};
  })()`);
  // crit=100 (luôn crit), rnd(.85,1.15): có crit -> tỉ lệ trong [1.7, 2.3]; không crit -> [0.85, 1.15]
  assert.ok(r.dFire >= 1.7 && r.dFire <= 2.3, `fire phải được crit x2, got ${r.dFire}`);
  assert.ok(r.dPhys >= 1.7 && r.dPhys <= 2.3, `phys vẫn crit x2, got ${r.dPhys}`);
  assert.equal(r.dPoisonRet, 1, "chiêu độc thuần không vào tot -> trả về 1");
  assert.ok(r.poisonTick >= 0.85 / 3 && r.poisonTick <= 1.15 / 3, `poison DoT không crit, got ${r.poisonTick}`);
});

test("N6: sessionCombatHit crit nhất quán với heroHit (trừ poison)", () => {
  const g = game();
  const r = g.json(`(() => {
    const boss = {hp: 1e12, max: 1e12, def: 0, res: {phys: 0, poison: 0, cold: 0, fire: 0, light: 0},
      series: 0, stun: 0, stunImm: 0, ward: 0};
    const state = {rng: 987654321, boss, activity: "test", tick: 0, events: [], mode: "ctc"};
    const P = {ar: 10000, crit: 100, series5: 0, bossDmg: 1, ignRes: {}, curseDef: 0,
      main: {id: 911, cost: 0, useAR: 0, crit: 100, parts: {fire: 1000}, series: 0, series5: 0, ignore: 0},
      basic: {id: 0, cost: 0, useAR: 1, crit: 0, parts: {phys: 1}, series: 0, series5: 0, ignore: 0}};
    const actor = {id: "t1", p: P, mp: 100, hp: 1000, cooldown: 0, role: "tank",
      utilityCooldown: 0, contribution: {damage: 0, heal: 0, control: 0}, aggro: 0};
    const before = boss.hp;
    sessionCombatHit(state, actor);
    return {raw: (before - boss.hp) / 1000};
  })()`);
  // sessionRandom (.85+.3r) + crit x2 cho fire -> tỉ lệ trong [1.7, 2.3]
  assert.ok(r.raw >= 1.7 && r.raw <= 2.3, `session fire phải được crit x2 như heroHit, got ${r.raw}`);
});
