import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

// Mutator đọc từ data/content/trial_mutators.v1.json (schema mục 0.2), engine thuần
// theo options.mutator — flag trial_mutators chỉ quyết định ở caller (worker).

test("mutator JSON hợp lệ, xoay theo tuần, từ chối JSON hỏng", () => {
  const g = game();
  const ms = g.json("JX_CONTENT.trialMutators.mutators");
  assert.ok(ms.length >= 2, "có nhiều mutator để xoay");
  assert.equal(g.run("sessionTrialMutator(0).id"), ms[0].id);
  assert.equal(g.run("sessionTrialMutator(1).id"), ms[1].id);
  assert.equal(g.run("sessionTrialMutator(3).id"), ms[0].id, "xoay vòng");
  const bad = [
    [{version: "trial-mutators-v1", mutators: []}, /không rỗng/],
    [{version: "trial-mutators-v1", mutators: [{id: "a", name: "A", desc: "d", hp: 99}]}, /phải là số/],
    [{version: "trial-mutators-v1", mutators: [{id: "a", name: "A", desc: "d", hack: 2}]}, /modifier lạ/],
    [{version: "trial-mutators-v1", mutators: [{id: "a", name: "A", desc: "d", hp: 1}, {id: "a", name: "B", desc: "d", hp: 1}]}, /trùng/],
  ];
  for (const [input, re] of bad) assert.throws(() => g.run(`validateTrialMutators(${JSON.stringify(input)})`), re);
});

test("sessionTrialWave áp đúng modifier của mutator", () => {
  const g = game();
  // week 0: rule iron (def ×2), mutator giant (hp ×1.5)
  const st = g.run(`(() => { const s = {objectives: {depth: 2}, trial: {week: 0, mutator: "giant"}, boss: {}}; sessionTrialWave(s); return s.boss; })()`);
  assert.equal(st.max, Math.round(1200 * Math.pow(1.35, 2) * 1.5));
  assert.equal(st.def, 200);
  assert.equal(st.dmgMul, 1.6); // (1+0.3*depth2), iron và giant đều không sửa taken
  // week 1: mutator frenzy (taken ×1.3, hp ×0.85)
  const st2 = g.run(`(() => { const s = {objectives: {depth: 0}, trial: {week: 1, mutator: "frenzy"}, boss: {}}; sessionTrialWave(s); return s.boss; })()`);
  assert.equal(st2.max, Math.round(1200 * 0.85));
  assert.equal(st2.dmgMul, 1.3);
  // không mutator: giữ nguyên như cũ
  const st3 = g.run(`(() => { const s = {objectives: {depth: 0}, trial: {week: 1, mutator: null}, boss: {}}; sessionTrialWave(s); return s.boss; })()`);
  assert.equal(st3.max, 1200);
});

test("sessionCombatNew từ chối mutator id lạ", () => {
  const g = game();
  assert.throws(() => g.run(`fixture('phlt',60);sessionCombatNew('phlt',[sessionActor('a','A',calc(),'damage')],1,'trial',{week:1,length:'short',mutator:'khongco'})`), /Unknown trial mutator/);
});

test("tính khả thi: fixture phái yếu hoàn thành trial với mọi mutator", () => {
  const g = game();
  g.run(`fixture('phlt',60);S.fac='emei';S.sk={};S.sk[FAC.emei.starter]=1;S.main=FAC.emei.starter;autoSpendAttrs();autoSpendSkills();recalc()`);
  const mutators = g.json("JX_CONTENT.trialMutators.mutators.map(m=>m.id)");
  for (const m of [null, ...mutators]) {
    const r = g.run(`(() => {
      let st = sessionCombatNew('phlt', [sessionActor('a','A',calc(),'damage')], 1234, 'trial', {week: 7, length: 'short', mutator: ${JSON.stringify(m)}});
      st.rng = 1; // pin seed: deterministic, không tăng loop che flakiness
      let ticks = 0;
      while (st.status === 'active' && ticks < 480) { st = sessionCombatStep(st, [], ['a']); ticks++; }
      return {depth: st.objectives.depth, status: st.status, bossMax: st.boss.max};
    })()`);
    assert.equal(r.depth, 3, `mutator ${m}: phái yếu vẫn qua hết 3 chặng`);
    assert.equal(r.status, 'completed');
    if (m === 'giant') assert.ok(r.bossMax > 1200, 'giant thực sự tăng HP boss');
  }
});
