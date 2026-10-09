import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';
import {game} from '../../test/helpers/game.mjs';

const plain = x => JSON.parse(JSON.stringify(x));
// A valid build for a faction at a preset: spend the whole attribute budget evenly-ish and skills on a few leveled skills.
function build(facKey, presetId, tweak = {}) {
  const preset = GAME.CHALLENGE_PRESETS[presetId], budget = GAME.challengeBudgets(presetId), fac = GAME.FAC[facKey];
  const usable = fac.skills.filter(id => GAME.SK[id] && (GAME.SK[id].req || 1) <= preset.level);
  const main = usable.find(id => GAME.SK[id].kind !== 'passive') ?? usable[0], sk = {}; let left = budget.skill;
  for (const id of [main, ...usable.filter(i => i !== main)].slice(0, 6)) { const lv = Math.max(1, Math.min(GAME.SK[id].max || 20, Math.floor(left / 3))); if (left < 1) break; sk[id] = lv; left -= lv; }
  const per = Math.floor(budget.attr / 4);
  return {fac: facKey, sex: 0, attr: {str: per, dex: per, vit: per, eng: budget.attr - per * 3}, sk, main, ...tweak};
}
test('presets are a fixed versioned allowlist with level-based budgets', () => {
  assert.equal(GAME.CHALLENGE_VERSION, 'g2-challenge-v1'); assert.deepEqual(Object.keys(GAME.CHALLENGE_PRESETS), ['std40', 'std60', 'std100']);
  assert.throws(() => { GAME.CHALLENGE_PRESETS.std40.level = 1; }); assert.equal(GAME.CHALLENGE_PRESETS.std40.level, 40);
  assert.deepEqual(GAME.challengeBudgets('std60'), {attr: 59 * GAME.PTS_PER_LEVEL, skill: 59 * GAME.SKILL_PTS_PER_LEVEL + 1});
  assert.equal(GAME.challengeBudgets('__proto__'), null); assert.equal(GAME.challengeBudgets('constructor'), null); assert.equal(GAME.challengeBudgets('std61'), null);
  for (const p of Object.values(GAME.CHALLENGE_PRESETS)) assert.ok(p.waves >= 1 && p.waves <= 8 && p.scale > 0 && p.scale <= 10);
});
test('a valid build passes and comes back normalized; every malformed or over-budget build is refused', () => {
  const ok = GAME.challengeSpecCheck(build('shaolin', 'std60'), 'std60'); assert.equal(ok.ok, true);
  assert.deepEqual(Object.keys(ok.spec), ['fac', 'sex', 'attr', 'sk', 'main']); assert.deepEqual(Object.keys(ok.spec.attr), ['str', 'dex', 'vit', 'eng']);
  const bad = (code, spec, preset = 'std60') => { const r = GAME.challengeSpecCheck(spec, preset); assert.equal(r.ok, false, code); assert.equal(r.code, code, String(JSON.stringify(spec)).slice(0, 80)); };
  const b = () => build('shaolin', 'std60'), budget = GAME.challengeBudgets('std60');
  bad('bad_preset', b(), 'std61'); bad('bad_preset', b(), '__proto__'); bad('bad_preset', b(), null);
  for (const junk of [null, 5, 'x', [], undefined]) bad('bad_spec', junk);
  bad('bad_spec', {...b(), gold: 9999}); bad('bad_spec', {...b(), __proto__: {x: 1}, extra: 1});
  bad('bad_faction', {...b(), fac: 'nope'}); bad('bad_faction', {...b(), fac: '__proto__'}); bad('bad_faction', {...b(), fac: 5});
  bad('bad_sex', {...b(), sex: 2}); bad('bad_sex', {...b(), sex: '0'});
  bad('bad_attr', {...b(), attr: {str: 1, dex: 1, vit: 1}}); bad('bad_attr', {...b(), attr: {str: 1, dex: 1, vit: 1, eng: 1, luck: 1}});
  bad('bad_attr', {...b(), attr: {str: -1, dex: 0, vit: 0, eng: 0}}); bad('bad_attr', {...b(), attr: {str: 1.5, dex: 0, vit: 0, eng: 0}}); bad('bad_attr', {...b(), attr: {str: '5', dex: 0, vit: 0, eng: 0}});
  bad('attr_budget', {...b(), attr: {str: budget.attr + 1, dex: 0, vit: 0, eng: 0}}); bad('attr_budget', {...b(), attr: {str: 200, dex: 200, vit: 200, eng: 200}});
  bad('bad_skills', {...b(), sk: {}}); bad('bad_skills', {...b(), sk: null}); bad('bad_skills', {...b(), sk: []});
  const own = build('shaolin', 'std60'), foreign = GAME.FAC.emei.skills[0];
  bad('bad_skills', {...own, sk: {...own.sk, [foreign]: 1}}); bad('bad_skills', {...own, sk: {...own.sk, 99999: 1}}); bad('bad_skills', {...own, sk: {...own.sk, abc: 1}});
  const first = Object.keys(own.sk)[0];
  bad('bad_skills', {...own, sk: {...own.sk, [first]: 0}}); bad('bad_skills', {...own, sk: {...own.sk, [first]: 1.5}}); bad('bad_skills', {...own, sk: {...own.sk, [first]: GAME.SK[first].max + 1}});
  const high = GAME.FAC.shaolin.skills.find(id => GAME.SK[id] && GAME.SK[id].req > 60);
  if (high !== undefined) bad('bad_skills', {...own, sk: {...own.sk, [high]: 1}});
  bad('skill_budget', {...own, sk: Object.fromEntries(GAME.FAC.shaolin.skills.filter(id => GAME.SK[id] && (GAME.SK[id].req || 1) <= 60).map(id => [id, GAME.SK[id].max || 20]))});
  bad('bad_main', {...own, main: 99999}); bad('bad_main', {...own, main: '10'}); bad('bad_main', {...own, main: null});
  const passive = Object.keys(own.sk).find(id => GAME.SK[id].kind === 'passive');
  if (passive !== undefined) bad('bad_main', {...own, main: Number(passive)});
  bad('bad_main', {...own, main: GAME.FAC.emei.skills[0]});
  assert.equal(GAME.challengeSpecCheck(build('shaolin', 'std100'), 'std40').ok, false, 'a level-100 budget does not fit std40');
});
test('the standardized character is deterministic, gear-independent and identical in browser and Worker', () => {
  const g = game(13); let compared = 0;
  for (const fac of Object.values(GAME.FAC)) for (const presetId of Object.keys(GAME.CHALLENGE_PRESETS)) {
    const checked = GAME.challengeSpecCheck(build(fac.key, presetId), presetId); assert.equal(checked.ok, true, fac.key + presetId);
    const server = GAME.challengeSave(checked.spec, presetId), again = GAME.challengeSave(checked.spec, presetId);
    assert.deepEqual(plain(server), plain(again), 'deterministic ' + fac.key + presetId);
    // The caller's own save does not leak in: gear, gold, items and name come from the standard, not the player.
    const client = g.json(`challengeSave(${JSON.stringify(checked.spec)},${JSON.stringify(presetId)})`);
    for (const key of ['mode', 'fac', 'sex', 'lvl', 'attr', 'attrPts', 'sk', 'skPts', 'main', 'inv', 'eq', 'gold', 'cid', 'last']) assert.deepEqual(plain(server)[key], client[key], `parity ${key} ${fac.key}${presetId}`);
    // The Worker and the browser must also compute the same fighter from it.
    g.run(`S=challengeSave(${JSON.stringify(checked.spec)},${JSON.stringify(presetId)});recalc()`);
    const fighter = P => ({life: P.life, mana: P.mana, def: P.def, ar: P.ar, parts: P.main.parts, rate: P.main.rate, crit: P.main.crit});
    const previous0 = GAME.getS(); let serverFighter; try { GAME.setS(server); serverFighter = fighter(GAME.calc()); } finally { GAME.setS(previous0); }
    assert.deepEqual(plain(serverFighter), g.json('(P=>({life:P.life,mana:P.mana,def:P.def,ar:P.ar,parts:P.main.parts,rate:P.main.rate,crit:P.main.crit}))(calc())'), `fighter ${fac.key}${presetId}`); compared++;
    assert.equal(server.mode, 'g2'); assert.equal(server.lvl, GAME.CHALLENGE_PRESETS[presetId].level); assert.equal(server.attrPts, 0); assert.equal(server.skPts, 0); assert.equal(server.gold, 0); assert.deepEqual(server.inv, []);
    assert.ok(Object.keys(server.eq).length >= 8 && server.eq.weapon, 'reference gear incl. weapon: ' + fac.key + presetId);
    const previous = GAME.getS(); try { GAME.setS(server); const P = GAME.calc(); assert.ok(P.life > 0 && P.main && Number.isFinite(P.main.rate), fac.key + presetId); } finally { GAME.setS(previous); }
  }
  assert.equal(compared, 30);
});
test('standard gear does not disturb the caller state (S, RNG, lucky) and ignores the surrounding save', () => {
  const g = game(21); g.run("fixture('g2',77);S.fac='emei';S.gold=555;S.name='Người thật';var before=JSON.stringify(S);var r0=Math.random();Math.random=Math.random;");
  const spec = build('shaolin', 'std60'); g.run(`var out=challengeSave(${JSON.stringify(spec)},'std60')`);
  assert.equal(g.run('JSON.stringify(S)'), g.run('before'), 'S is restored'); assert.equal(g.run('out.fac'), 'shaolin'); assert.equal(g.run('out.gold'), 0); assert.equal(g.run('out.name'), 'Chuẩn hóa');
  const other = game(22); other.run("fixture('g2',20);S.fac='gaibang';S.sex=1");
  assert.deepEqual(other.json(`challengeSave(${JSON.stringify(spec)},'std60')`), g.json('out'), 'identical regardless of who asks (incl. cid and time)');
});
