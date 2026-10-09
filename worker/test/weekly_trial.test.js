import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {room} from '../src/social.js';
import {sessions} from '../src/sessions.js';
import {trial, trialWeekId, trialWeekStart, trialTag, trialSeed, trialScore, recordTrialResult, TRIAL_RULES} from '../src/trial.js';

const FLAGS = () => ({party_lobby: true, party_combat: true, coop_rescue: true, weekly_trial: true});
const DAY = 864e5, MONDAY = Date.UTC(2026, 9, 5); // Monday 00:00 UTC
async function fixture(t, {flags = FLAGS(), at = MONDAY + 12 * 3600e3} = {}) {
  const DB = await localD1(); t.after(() => DB.close());
  const realNow = Date.now; let now = at; Date.now = () => now; t.after(() => { Date.now = realNow; });
  const env = {DB, FEATURE_FLAGS: flags}, people = {};
  async function add(key, {mode = 'phlt', flagged = 0, status = 'verified', fac = 'shaolin'} = {}) {
    const id = 'trial_' + key, token = 'local-trial-token-0123456789-' + key, state = {...GAME.newSave(), cid: 'c_trial_character_' + key, mode, fac, lvl: 60, attrPts: 295, skPts: 58, main: 10, sk: {10: 1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id, await sha256Hex(token), 'Trial' + key, now),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status,flagged,mode) VALUES(?1,?2,?3,?4,60,100,?5,?6,?7,?8)").bind(id, state.cid, JSON.stringify(state), fac, now, status, flagged, mode)]);
    const req = (method = 'POST', path = 'sessions') => new Request('https://game.test/api/' + path, {method, headers: {authorization: 'Bearer ' + token}});
    return people[key] = {id, post: body => sessions(req(), env, body), get: sid => sessions(req('GET'), env, undefined, new URL('https://game.test/api/sessions' + (sid ? '?id=' + sid : ''))), lobby: body => room(req('POST', 'room'), env, body), board: () => trial(req('GET', 'trial'), env)};
  }
  const solo = async key => { const p = await add(key); await p.lobby({action: 'create'}); await p.lobby({action: 'ready', ready: true}); return p; };
  const edit = async (id, fn) => { const r = await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first(), s = JSON.parse(r.state); fn(s); await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(id, JSON.stringify(s)).run(); };
  return {DB, env, add, solo, edit, people, tick: ms => { now += ms; }, setNow: v => { now = v; }, now: () => now};
}
// Plays a run to its end with the engine's own ticks; `setup` shapes the state first (e.g. a weaker or stronger boss).
async function finish(f, p, id, setup) {
  if (setup) await f.edit(id, setup);
  let v;
  for (let i = 0; i < 70; i++) { f.tick(8 * 250); v = (await p.get(id)).session; if (v.status !== 'active') break; }
  return v;
}
test('week, seed and rules are pure functions of the UTC week', () => {
  assert.equal(trialWeekId(MONDAY), trialWeekId(MONDAY + 7 * DAY - 1)); assert.equal(trialWeekId(MONDAY + 7 * DAY), trialWeekId(MONDAY) + 1);
  assert.equal(trialWeekStart(trialWeekId(MONDAY)), MONDAY); assert.equal(new Date(MONDAY).getUTCDay(), 1);
  assert.equal(trialSeed(2900), trialSeed(2900)); assert.notEqual(trialSeed(2900), trialSeed(2901));
  const tags = [0, 1, 2, 3].map(i => trialTag(2900 + i)); assert.equal(new Set(tags).size, 4, 'the four weekly rules rotate'); assert.equal(trialTag(2900), trialTag(2904));
  assert.match(trialTag(2900), /^trial-v1:/);
});
test('guards: flags, mode, lengths and solo-only', async t => {
  const off = await fixture(t, {flags: {party_lobby: true, party_combat: true, coop_rescue: true}});
  const a = await off.solo('a');
  await assert.rejects(() => a.post({action: 'create', activity: 'trial', length: 'short'}), {code: 'feature_disabled'});
  await assert.rejects(() => a.board(), {code: 'feature_disabled'});
  const f = await fixture(t), p = await f.solo('p');
  await assert.rejects(() => p.post({action: 'create', activity: 'trial'}), {code: 'bad_trial_length'});
  await assert.rejects(() => p.post({action: 'create', activity: 'trial', length: 'forever'}), {code: 'bad_trial_length'});
  await assert.rejects(() => p.post({action: 'create', activity: 'rescue', length: 'short'}), {code: 'forged_session_action'});
  await assert.rejects(() => p.post({action: 'create', activity: 'trial', length: 'short', score: 99}), {code: 'forged_session_action'});
  const run = await p.post({action: 'create', activity: 'trial', length: 'short'});
  assert.equal(run.session.activity, 'trial'); assert.equal(run.session.trial.length, 'short'); assert.equal(run.session.trial.waves, 3); assert.equal(run.session.objectives.depth, 0);
  assert.equal(run.session.trial.week, trialWeekId(f.now())); assert.match(run.session.loot_policy, /no reward/);
  await assert.rejects(() => p.post({action: 'claim', id: run.session.id}), {code: 'session_reward_unavailable'});
  // A party cannot run it: the second member makes the roster two.
  const q = await f.add('q'); await q.lobby({action: 'join', room_id: (await p.lobby({action: 'heartbeat'})).room.id}); await q.lobby({action: 'ready', ready: true});
  const g = await fixture(t), x = await g.solo('x'); const y = await g.add('y'); await y.lobby({action: 'join', room_id: (await x.lobby({action: 'heartbeat'})).room.id}); await y.lobby({action: 'ready', ready: true}); await x.lobby({action: 'ready', ready: true});
  await assert.rejects(() => x.post({action: 'create', activity: 'trial', length: 'short'}), {code: 'trial_solo_only'});
  const ctc = await g.add('ctc', {mode: 'ctc'}); await assert.rejects(() => ctc.post({action: 'create', activity: 'trial', length: 'short'}), {code: 'bad_session_activity'});
});
test('every player faces the same boss chain; results are server-made and the board ranks depth then progress', async t => {
  const f = await fixture(t), a = await f.solo('a'), b = await f.solo('b'), c = await f.solo('c');
  const [ra, rb, rc] = [await a.post({action: 'create', activity: 'trial', length: 'long'}), await b.post({action: 'create', activity: 'trial', length: 'long'}), await c.post({action: 'create', activity: 'trial', length: 'long'})];
  const stored = async id => JSON.parse((await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first()).state);
  const sa = await stored(ra.session.id), sb = await stored(rb.session.id);
  assert.equal(sa.rng, sb.rng, 'the seed is shared'); assert.equal(sa.boss.max, sb.boss.max); assert.equal(sa.trial.rule, sb.trial.rule);
  assert.equal(sa.boss.max, Math.round(GAME.SESSION_TRIAL.baseHp * (GAME.sessionTrialRule(sa.trial.week).hp || 1)), 'absolute HP, not scaled to the player');
  // a: strong (clears everything), b: weak boss ahead, c: dies on wave one.
  const va = await finish(f, a, ra.session.id, s => { s.actors[0].cooldown = 0; s.boss.hp = 1; s.boss.def = 0; s.actors[0].p.main.rate = 50; s.actors[0].p.basic.rate = 50; s.objectives.depth = 5; });
  assert.equal(va.status, 'completed'); assert.equal(va.objectives.depth, 6);
  const vb = await finish(f, b, rb.session.id, s => { s.objectives.depth = 2; s.actors[0].cooldown = 1e6; s.actors[0].hp = 0.001; });
  assert.equal(vb.status, 'aborted'); assert.equal(vb.objectives.depth, 2);
  const vc = await finish(f, c, rc.session.id, s => { s.actors[0].hp = 0.001; s.actors[0].cooldown = 1e6; });
  assert.equal(vc.objectives.depth, 0);
  const board = (await a.board()).boards.long;
  assert.deepEqual(board.rows.map(r => [r.placement, r.name, r.depth]), [[1, 'Triala', 6], [2, 'Trialb', 2], [3, 'Trialc', 0]]);
  assert.ok(board.rows[0].score > board.rows[1].score && board.rows[1].score > board.rows[2].score); assert.equal(board.rows[0].me, true);
  assert.deepEqual((await c.board()).boards.long.mine, {depth: 0, score: board.rows[2].score, placement: 3});
  assert.deepEqual((await a.board()).boards.short.rows, [], 'lengths have separate boards');
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM trial_recorded').first()).n, 3);
  // Re-reading finished runs never double counts, and the best score is kept per account.
  for (let i = 0; i < 3; i++) { await a.get(ra.session.id); await b.get(rb.session.id); }
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM trial_results').first()).n, 3);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM resource_ledger').first()).n, 0, 'the weekly trial pays nothing');
});
test('ties keep the earlier result and rank deterministically; a worse retry never lowers the best', async t => {
  const f = await fixture(t), a = await f.solo('a'), b = await f.solo('b');
  const make = async (p, setup) => { const r = await p.post({action: 'create', activity: 'trial', length: 'short'}); return finish(f, p, r.session.id, setup); };
  const frozen = s => { s.actors[0].cooldown = 1e6; s.actors[0].hp = 0.001; s.objectives.depth = 1; };
  const va = await make(a, frozen); f.tick(1000); const vb = await make(b, frozen);
  assert.equal(va.objectives.depth, vb.objectives.depth);
  const rows = (await a.board()).boards.short.rows; assert.deepEqual(rows.map(r => r.name), ['Triala', 'Trialb'], 'equal scores: whoever got there first ranks first');
  assert.equal((await b.board()).boards.short.mine.placement, 2);
  const best = rows[0].score;
  await make(a, s => { s.actors[0].cooldown = 1e6; s.actors[0].hp = 0.001; });
  assert.equal((await a.board()).boards.short.rows[0].score, best, 'a worse attempt cannot replace the best');
});
test('attempts per day are capped atomically and a repeated create returns the live run', async t => {
  const f = await fixture(t), p = await f.solo('p');
  const first = await p.post({action: 'create', activity: 'trial', length: 'short'});
  assert.equal((await p.post({action: 'create', activity: 'trial', length: 'short'})).session.id, first.session.id, 'a repeated create is the same run');
  await f.DB.prepare("UPDATE combat_sessions SET status='aborted',ended_at=?2 WHERE id=?1").bind(first.session.id, f.now()).run();
  for (let i = 1; i < TRIAL_RULES.attemptsPerDay; i++) {
    const r = await p.post({action: 'create', activity: 'trial', length: 'short'});
    await f.DB.prepare("UPDATE combat_sessions SET status='aborted',ended_at=?2 WHERE id=?1").bind(r.session.id, f.now()).run();
  }
  await assert.rejects(() => p.post({action: 'create', activity: 'trial', length: 'long'}), {code: 'trial_attempts_used'});
  assert.deepEqual((await p.board()).attempts, {used: 5, left: 0});
  f.tick(DAY); assert.equal((await p.board()).attempts.used, 0, 'the count resets at UTC midnight');
  await p.lobby({action: 'create'}); await p.lobby({action: 'ready', ready: true}); // the lobby room itself expired after two hours
  assert.equal((await p.post({action: 'create', activity: 'trial', length: 'short'})).session.status, 'active');
});
test('weekly rollover: a new week has a new rule and an empty board, and a run keeps the week it started in', async t => {
  const f = await fixture(t, {at: MONDAY + 7 * DAY - 1000}), a = await f.solo('a');
  const run = await a.post({action: 'create', activity: 'trial', length: 'short'}), week = trialWeekId(f.now());
  assert.equal(run.session.trial.week, week);
  f.tick(5000); // the run crosses into the next week while it is being played
  const done = await finish(f, a, run.session.id, s => { s.actors[0].cooldown = 1e6; s.actors[0].hp = 0.001; s.objectives.depth = 1; });
  assert.equal(done.trial.week, week);
  const row = await f.DB.prepare('SELECT week,rules FROM trial_results').first();
  assert.equal(row.week, week); assert.equal(row.rules, trialTag(week));
  const next = await a.board();
  assert.equal(next.week.id, week + 1); assert.equal(next.week.tag, trialTag(week + 1)); assert.notEqual(next.week.rule, GAME.sessionTrialRule(week).id);
  assert.deepEqual(next.boards.short.rows, [], 'the new week starts empty');
  f.setNow(MONDAY + 12 * 3600e3); assert.equal((await a.board()).boards.short.rows.length, 1, 'the old week keeps its own board');
});
test('only verified PHLT characters appear; flagged players vanish from the board and nothing can be submitted', async t => {
  const f = await fixture(t), a = await f.solo('a'), b = await f.solo('b');
  const ra = await a.post({action: 'create', activity: 'trial', length: 'short'}), rb = await b.post({action: 'create', activity: 'trial', length: 'short'});
  await finish(f, a, ra.session.id, s => { s.actors[0].cooldown = 1e6; s.actors[0].hp = 0.001; s.objectives.depth = 2; });
  await finish(f, b, rb.session.id, s => { s.actors[0].cooldown = 1e6; s.actors[0].hp = 0.001; s.objectives.depth = 1; });
  assert.equal((await a.board()).boards.short.rows.length, 2);
  await f.DB.prepare("UPDATE chars SET flagged=1,validation_status='flagged' WHERE account_id=?1").bind(a.id).run();
  assert.deepEqual((await b.board()).boards.short.rows.map(r => r.name), ['Trialb'], 'a flagged player leaves the board');
  await assert.rejects(() => a.board(), {code: 'trial_locked'});
  await assert.rejects(() => b.post({action: 'result', score: 99999}), {code: 'forged_session_action'});
  await assert.rejects(() => b.post({action: 'command', id: rb.session.id, seq: 1, tick: 1, kind: 'attack', score: 99999}), {code: 'forged_session_action'});
  const stateCopy = JSON.parse((await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(rb.session.id).first()).state);
  assert.equal(await recordTrialResult(f.DB, rb.session.id, stateCopy), false, 'recording the same session again is a no-op');
  assert.ok(trialScore({...stateCopy, status: 'active'}) >= 0);
});
test('mutator gating: flag tắt thì không có mutator; flag bật thì tag kèm mutator và boss chịu mutator', async t => {
  const f = await fixture(t), p = await f.solo('p'), week = trialWeekId(f.now());
  const off = await p.board();
  assert.equal(off.week.mutator, null);
  assert.equal(off.week.tag, trialTag(week));
  f.env.FEATURE_FLAGS = {...f.env.FEATURE_FLAGS, trial_mutators: true};
  const on = await p.board();
  assert.ok(on.week.mutator && on.week.mutator.id, 'endpoint trả mutator khi flag bật');
  assert.equal(on.week.tag, trialTag(week, on.week.mutator.id));
  const run = await p.post({action: 'create', activity: 'trial', length: 'short'});
  assert.equal(run.session.trial.mutator, on.week.mutator.id);
  const s = JSON.parse((await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(run.session.id).first()).state);
  const mut = GAME.sessionTrialMutator(week), rule = GAME.sessionTrialRule(week);
  assert.equal(s.boss.max, Math.round(1200 * Math.pow(1.35, 0) * (rule.hp || 1) * (mut.hp || 1)));
  assert.equal(s.boss.def, 100 * (rule.def || 1) * (mut.def || 1));
});
test('sự kiện ngoài lịch tuần không chạy (event_not_scheduled), trong lịch thì chạy', async t => {
  const f = await fixture(t), p = await f.solo('p'), week = trialWeekId(f.now());
  const orig = GAME.JX_CONTENT;
  const mk = weeks => ({...orig, events: {version: 'events-v2', slots: [{id: 'weekly_trial', kind: 'trial', mode: 'phlt', name: 'T', enabled: true, schedule: {weeks}, limits: {perDay: 5}}]}});
  try {
    GAME.JX_CONTENT = mk(week % 2 === 0 ? 'odd' : 'even'); // tuần này KHÔNG có lịch
    assert.equal(GAME.eventScheduled(GAME.JX_CONTENT.events, 'weekly_trial', week), false);
    await assert.rejects(() => p.post({action: 'create', activity: 'trial', length: 'short'}), {code: 'event_not_scheduled'});
    assert.equal((await p.board()).attempts.used, 0, 'lịch chặn thì không trừ quota');
    GAME.JX_CONTENT = mk(week % 2 === 0 ? 'even' : 'odd'); // tuần này CÓ lịch
    const run = await p.post({action: 'create', activity: 'trial', length: 'short'});
    assert.equal(run.session.status, 'active');
  } finally { GAME.JX_CONTENT = orig; }
});
