import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {sessions} from '../src/sessions.js';
import {challenge, challengeSeed, recordChallengeResult, CHALLENGE_RULES} from '../src/challenge.js';

const FLAGS = () => ({community_challenge: true, online_account_g2: true});
const DAY = 864e5, NOON = Date.UTC(2026, 9, 5, 12);
function build(facKey, presetId, tweak = {}) {
  const preset = GAME.CHALLENGE_PRESETS[presetId], budget = GAME.challengeBudgets(presetId), fac = GAME.FAC[facKey];
  const usable = fac.skills.filter(id => GAME.SK[id] && (GAME.SK[id].req || 1) <= preset.level);
  const main = usable.find(id => GAME.SK[id].kind !== 'passive') ?? usable[0], sk = {}; let left = budget.skill;
  for (const id of [main, ...usable.filter(i => i !== main)].slice(0, 6)) { const lv = Math.max(1, Math.min(GAME.SK[id].max || 20, Math.floor(left / 3))); if (left < 1) break; sk[id] = lv; left -= lv; }
  const per = Math.floor(budget.attr / 4);
  return {fac: facKey, sex: 0, attr: {str: per, dex: per, vit: per, eng: budget.attr - per * 3}, sk, main, ...tweak};
}
async function fixture(t, {flags = FLAGS()} = {}) {
  const DB = await localD1(); t.after(() => DB.close());
  const realNow = Date.now; let now = NOON; Date.now = () => now; t.after(() => { Date.now = realNow; });
  const env = {DB, FEATURE_FLAGS: flags}, people = {};
  async function add(key, {mode = 'g2', flagged = 0, status = 'verified'} = {}) {
    const id = 'chal_' + key, token = 'local-challenge-token-0123456789-' + key, state = {...GAME.newSave(), cid: 'c_challenge_character_' + key, mode, fac: 'shaolin', lvl: 60, main: 10, sk: {10: 1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id, await sha256Hex(token), 'Chal' + key, now),
      DB.prepare('INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status,flagged,mode) VALUES(?1,?2,?3,?4,60,100,?5,?6,?7,?8)').bind(id, state.cid, JSON.stringify(state), 'shaolin', now, status, flagged, mode)]);
    const req = (method = 'POST', path = 'challenge', q = '') => new Request('https://game.test/api/' + path + q, {method, headers: {authorization: 'Bearer ' + token}});
    return people[key] = {id,
      post: body => challenge(req(), env, body),
      get: code => challenge(req('GET', 'challenge', code ? '?code=' + code : ''), env),
      sess: body => sessions(req('POST', 'sessions'), env, body),
      view: sid => sessions(req('GET', 'sessions'), env, undefined, new URL('https://game.test/api/sessions' + (sid ? '?id=' + sid : '')))};
  }
  const edit = async (id, fn) => { const r = await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first(), s = JSON.parse(r.state); fn(s); await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(id, JSON.stringify(s)).run(); };
  return {DB, env, add, edit, people, tick: ms => { now += ms; }, setNow: v => { now = v; }, now: () => now};
}
async function finish(f, p, id, setup) {
  if (setup) await f.edit(id, setup);
  let v;
  for (let i = 0; i < 160; i++) { f.tick(8 * 250); v = (await p.view(id)).session; if (v.status !== 'active') break; }
  return v;
}
const publishOk = async (p, spec = build('shaolin', 'std40'), preset = 'std40') => (await p.post({action: 'publish', preset, spec})).code;

test('guards: flag, account mode, verification and malformed actions', async t => {
  const off = await fixture(t, {flags: {online_account_g2: true}}), a = await off.add('a');
  await assert.rejects(() => a.get(), {code: 'feature_disabled'}); await assert.rejects(() => a.post({action: 'publish', preset: 'std40', spec: build('shaolin', 'std40')}), {code: 'feature_disabled'});
  await assert.rejects(() => a.view(), {code: 'feature_disabled'});
  const noAccount = await fixture(t, {flags: {community_challenge: true}}), n = await noAccount.add('n');
  await assert.rejects(() => n.get(), {code: 'feature_disabled'}); // requires online_account_g2
  const f = await fixture(t), ctc = await f.add('ctc', {mode: 'ctc'}), phlt = await f.add('phlt', {mode: 'phlt'});
  for (const p of [ctc, phlt]) { await assert.rejects(() => p.get(), {code: 'feature_disabled'}); await assert.rejects(() => p.post({action: 'start', code: 'CH-AAAAAAAA'}), {code: 'feature_disabled'}); }
  const flagged = await f.add('flagged', {flagged: 1}), pending = await f.add('pending', {status: 'pending'});
  await assert.rejects(() => flagged.get(), {code: 'challenge_locked'}); await assert.rejects(() => pending.get(), {code: 'challenge_locked'});
  const p = await f.add('p');
  const view = await p.get(); assert.equal(view.rules.version, 'g2-challenge-v1'); assert.deepEqual(view.presets.map(x => x.id), ['std40', 'std60', 'std100']); assert.deepEqual(view.mine, []);
  for (const body of [{}, {action: 'nope'}, {action: 'publish', preset: 'std40', spec: build('shaolin', 'std40'), score: 9}, {action: 'start', code: 'CH-AAAAAAAA', score: 9}, {action: 'retire', code: 'CH-AAAAAAAA', x: 1}])
    await assert.rejects(() => p.post(body), {code: 'bad_challenge_action'});
  await assert.rejects(() => p.post({action: 'start', code: 'nope'}), {code: 'bad_challenge_code'}); await assert.rejects(() => p.get('nope'), {code: 'bad_challenge_code'});
  await assert.rejects(() => p.get('CH-AAAAAAAA'), {code: 'challenge_not_found'}); await assert.rejects(() => p.post({action: 'start', code: 'CH-AAAAAAAA'}), {code: 'challenge_not_found'});
  // 2.0 sessions can be viewed but never created through the room path.
  await assert.rejects(() => p.sess({action: 'create', activity: 'challenge'}), {code: 'bad_session_activity'});
  await assert.rejects(() => p.sess({action: 'create'}), {code: 'bad_session_activity'});
});

test('publish validates strictly, is idempotent per build, capped per day, and can be retired', async t => {
  const f = await fixture(t), a = await f.add('a'), b = await f.add('b');
  const bad = async (code, body) => assert.rejects(() => a.post({action: 'publish', ...body}), {code});
  await bad('challenge_bad_preset', {preset: 'std61', spec: build('shaolin', 'std40')}); await bad('challenge_bad_spec', {preset: 'std40', spec: {...build('shaolin', 'std40'), gold: 9}});
  await bad('challenge_attr_budget', {preset: 'std40', spec: build('shaolin', 'std100')}); await bad('challenge_bad_faction', {preset: 'std40', spec: {...build('shaolin', 'std40'), fac: 'nope'}});
  await bad('challenge_bad_skills', {preset: 'std40', spec: {...build('shaolin', 'std40'), sk: {}}});
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenges').first()).n, 0);
  const code = await publishOk(a); assert.match(code, /^CH-[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(await publishOk(a), code, 'the same build by the same author is the same challenge');
  assert.notEqual(await publishOk(b), code, 'another author gets another code');
  const view = await a.get(); assert.equal(view.mine.length, 1); assert.equal(view.mine[0].code, code); assert.equal(view.mine[0].author, 'Chala'); assert.equal(view.recent.length, 2);
  assert.deepEqual(Object.keys(view.mine[0].spec), ['fac', 'sex', 'attr', 'sk', 'main']);
  const cap = await fixture(t), c = await cap.add('c'); const facs = Object.keys(GAME.FAC);
  for (let i = 0; i < CHALLENGE_RULES.publishPerDay; i++) await publishOk(c, build(facs[i], 'std40'));
  await assert.rejects(() => publishOk(c, build(facs[CHALLENGE_RULES.publishPerDay], 'std40')), {code: 'challenge_publish_limit'});
  assert.equal(await publishOk(c, build(facs[0], 'std40')), (await c.get()).mine.find(x => x.spec.fac === facs[0]).code, 'an existing build is still returned at the cap');
  cap.tick(DAY); await publishOk(c, build(facs[CHALLENGE_RULES.publishPerDay], 'std40'));
  // Retiring hides it from the lists and starts, and a retired build reopens under the same code.
  await a.post({action: 'retire', code}); assert.equal((await a.get()).mine.length, 0); await assert.rejects(() => a.post({action: 'start', code}), {code: 'challenge_not_found'});
  await assert.rejects(() => b.post({action: 'retire', code}), {code: 'challenge_not_found'}); // only the author can retire
  assert.equal(await publishOk(a), code, 'reopened');
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM resource_ledger').first()).n, 0);
});

test('a run is simulated by the server from the stored build; results count once and the best run stays', async t => {
  const f = await fixture(t), a = await f.add('a'), b = await f.add('b'), code = await publishOk(a, build('shaolin', 'std40'), 'std40');
  const started = await b.post({action: 'start', code}); assert.ok(started.session_id);
  const view = (await b.view(started.session_id)).session;
  assert.equal(view.activity, 'challenge'); assert.equal(view.mode, 'g2'); assert.equal(view.challenge.code, code); assert.equal(view.trial.waves, 6); assert.equal(view.trial.scale, GAME.CHALLENGE_PRESETS.std40.scale);
  assert.equal(view.actors.length, 1); assert.equal(view.actors[0].id, b.id); assert.match(view.loot_policy, /no reward/);
  // The fighter is the published build at the preset level, not the caller's own character.
  const expected = (() => { const prev = GAME.getS(); try { GAME.setS(GAME.challengeSave(GAME.challengeSpecCheck(build('shaolin', 'std40'), 'std40').spec, 'std40')); return GAME.calc().life; } finally { GAME.setS(prev); } })();
  assert.equal(view.actors[0].maxHp, expected);
  const row = await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(started.session_id).first(), st = JSON.parse(row.state);
  assert.equal(st.rng, challengeSeed(code)); assert.equal(st.trial.version, 'g2-challenge-v1:std40');
  assert.equal((await b.post({action: 'start', code})).session_id, started.session_id, 'a repeated start is the same run');
  const other = await a.post({action: 'publish', preset: 'std60', spec: build('shaolin', 'std60')});
  await assert.rejects(() => b.post({action: 'start', code: other.code}), {code: 'session_member_busy'});
  await assert.rejects(() => b.sess({action: 'claim', id: started.session_id}), {code: 'session_reward_unavailable'});
  const done = await finish(f, b, started.session_id);
  assert.notEqual(done.status, 'active'); const score = done.trial.score;
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_results').first()).n, 1); assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_attempts WHERE recorded_at IS NOT NULL').first()).n, 1);
  await b.view(started.session_id); await b.view(started.session_id); // reading again does not record again
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_results').first()).n, 1);
  assert.equal(await recordChallengeResult(f.DB, started.session_id, JSON.parse((await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(started.session_id).first()).state)), false, 'direct replay is a no-op');
  const board = await b.get(code); assert.equal(board.board.rows.length, 1); assert.equal(board.board.rows[0].name, 'Chalb'); assert.equal(board.board.rows[0].score, score); assert.equal(board.board.mine.placement, 1); assert.equal(board.challenge.finishers, 1);
  // A weaker second run never replaces the best one; a stronger one does.
  const second = await b.post({action: 'start', code});
  await finish(f, b, second.session_id, s => { s.boss.hp = s.boss.max = s.boss.max * 1000; });
  assert.equal((await b.get(code)).board.mine.score, score, 'the weaker run is attempted but not kept');
  const third = await b.post({action: 'start', code});
  const strong = await finish(f, b, third.session_id, s => { s.boss.hp = 1; s.trial.waves = 1; });
  assert.equal(strong.status, 'completed'); assert.ok((await b.get(code)).board.mine.score >= score);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_results').first()).n, 1); assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_attempts').first()).n, 3);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM resource_ledger').first()).n, 0, 'challenges pay nothing'); assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_rewards').first()).n, 0);
});

test('every runner faces the identical fight; a flagged runner is hidden from the board; commands are validated', async t => {
  const f = await fixture(t), a = await f.add('a'), b = await f.add('b'), c = await f.add('c'), code = await publishOk(a);
  const [ra, rb] = [await a.post({action: 'start', code}), await b.post({action: 'start', code})];
  const [sa, sb] = [ra, rb].map(x => f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(x.session_id));
  const [ja, jb] = [JSON.parse((await sa.first()).state), JSON.parse((await sb.first()).state)];
  assert.equal(ja.rng, jb.rng); assert.equal(ja.boss.max, jb.boss.max); assert.equal(ja.trial.rule, jb.trial.rule); assert.equal(ja.trial.week, jb.trial.week);
  assert.deepEqual(ja.actors[0].p.main, jb.actors[0].p.main, 'same build, same fighter');
  await assert.rejects(() => a.sess({action: 'command', id: ra.session_id, seq: 1, tick: 0, kind: 'rescue', target: 'boss'}), {code: 'bad_session_command'});
  await assert.rejects(() => a.sess({action: 'command', id: ra.session_id, seq: 1, tick: 0, kind: 'capture', target: 'p1'}), {code: 'bad_session_command'});
  await assert.rejects(() => a.sess({action: 'command', id: ra.session_id, seq: 1, tick: 0, kind: 'attack', target: 'boss', score: 99}), {code: 'forged_session_action'});
  await assert.rejects(() => a.sess({action: 'command', id: rb.session_id, seq: 1, tick: 0, kind: 'attack', target: 'boss'}), {code: 'session_not_found'});
  const ok = await a.sess({action: 'command', id: ra.session_id, seq: 1, tick: 0, kind: 'guard', target: 'boss'}); assert.equal(ok.command.seq, 1);
  await finish(f, a, ra.session_id); await finish(f, b, rb.session_id);
  assert.equal((await a.get(code)).board.rows.length, 2);
  await f.DB.prepare("UPDATE chars SET flagged=1 WHERE account_id=?1").bind(b.id).run();
  const board = (await a.get(code)).board; assert.equal(board.rows.length, 1); assert.equal(board.rows[0].name, 'Chala');
  const pc = await c.get(code); assert.equal(pc.board.mine, null);
});

test('attempt cap, outdated versions, expiry and flag rollback', async t => {
  const f = await fixture(t), a = await f.add('a'), code = await publishOk(a);
  const ids = [];
  for (let i = 0; i < CHALLENGE_RULES.attemptsPerDay; i++) { const r = await a.post({action: 'start', code}); ids.push(r.session_id); await a.sess({action: 'leave', id: r.session_id}); f.tick(2000); }
  assert.equal(new Set(ids).size, CHALLENGE_RULES.attemptsPerDay);
  await assert.rejects(() => a.post({action: 'start', code}), {code: 'challenge_attempts_used'});
  assert.equal((await a.get()).attempts.left, 0);
  f.tick(DAY); assert.equal((await a.get()).attempts.left, CHALLENGE_RULES.attemptsPerDay);
  const again = await a.post({action: 'start', code, id: 'my-session-id-001'}); assert.equal(again.session_id, 'my-session-id-001');
  assert.equal((await a.post({action: 'start', code, id: 'my-session-id-001'})).session_id, 'my-session-id-001', 'client request id is idempotent');
  const b = await f.add('b'), other = await publishOk(a, build('emei', 'std40'));
  await assert.rejects(() => a.post({action: 'start', code: other, id: 'my-session-id-001'}), {code: 'session_activity_conflict'});
  await assert.rejects(() => b.post({action: 'start', code, id: 'my-session-id-001'}), {code: 'session_activity_conflict'});
  // Expiry aborts the run and records nothing.
  f.tick(6 * 60e3); const expired = (await a.view('my-session-id-001')).session; assert.equal(expired.status, 'aborted');
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_results').first()).n, 0);
  // A challenge from an older rules version cannot be run, and its results never mix with the current ones.
  await f.DB.prepare("UPDATE challenges SET version='g2-challenge-v0' WHERE id=?1").bind(other).run();
  await assert.rejects(() => b.post({action: 'start', code: other}), {code: 'challenge_outdated'});
  assert.equal((await b.get()).recent.every(x => x.code !== other), true);
  assert.equal((await b.get(other)).challenge.outdated, true);
  // Turning the flag off aborts a live run and keeps its frozen state.
  const live = await b.post({action: 'start', code}); f.env.FEATURE_FLAGS = {online_account_g2: true};
  await assert.rejects(() => b.view(live.session_id), {code: 'feature_disabled'});
  assert.equal((await f.DB.prepare('SELECT status FROM combat_sessions WHERE id=?1').bind(live.session_id).first()).status, 'aborted');
  f.env.FEATURE_FLAGS = FLAGS();
  assert.equal((await b.view(live.session_id)).session.status, 'aborted');
});

test('the same build cannot be farmed into a better rank by a different account without playing', async t => {
  const f = await fixture(t), a = await f.add('a'), code = await publishOk(a);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM challenge_results').first()).n, 0);
  for (const body of [{action: 'record', code, score: 99}, {action: 'result', code, depth: 6}]) await assert.rejects(() => a.post(body), {code: 'bad_challenge_action'});
  assert.equal((await a.get(code)).board.rows.length, 0);
});
