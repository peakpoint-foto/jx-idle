import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {room} from '../src/social.js';
import {sessions} from '../src/sessions.js';
import {economy} from '../src/economy.js';

const FLAGS = () => ({party_lobby: true, party_combat: true, coop_rescue: true});
async function fixture(t, count = 2, flags = FLAGS(), mode = 'phlt') {
  const DB = await localD1(); t.after(() => DB.close());
  const realNow = Date.now; let now = Date.UTC(2026, 9, 8, 12); Date.now = () => now; t.after(() => { Date.now = realNow; });
  const env = {DB, FEATURE_FLAGS: flags}, players = [];
  const enroll = async (key, m = mode) => {
    const id = 'coop_' + key, token = 'local-coop-token-0123456789-' + key, state = {...GAME.newSave(), cid: 'c_coop_character_' + key, mode: m, fac: 'shaolin', lvl: 60, attrPts: 295, skPts: 58, main: 10, sk: {10: 1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id, await sha256Hex(token), 'Coop' + key, now),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status,mode) VALUES(?1,?2,?3,'shaolin',60,100,?4,'verified',?5)").bind(id, state.cid, JSON.stringify(state), now, m)]);
    const req = (method = 'POST', path = 'sessions') => new Request('https://game.test/api/' + path, {method, headers: {authorization: 'Bearer ' + token}});
    const p = {id, req, post: body => sessions(req(), env, body), get: sid => sessions(req('GET'), env, undefined, new URL('https://game.test/api/sessions' + (sid ? '?id=' + sid : ''))), lobby: body => room(req('POST', 'room'), env, body), economy: () => economy(req('GET', 'economy'), env)};
    return p;
  };
  for (let i = 0; i < count; i++) players.push(await enroll('p' + i));
  const created = await players[0].lobby({action: 'create'}), roomId = created.room.id;
  for (const p of players.slice(1)) await p.lobby({action: 'join', room_id: roomId});
  for (const p of players) await p.lobby({action: 'ready', ready: true});
  const edit = async (id, fn) => { const r = await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first(), s = JSON.parse(r.state); fn(s); await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(id, JSON.stringify(s)).run(); };
  return {DB, env, players, roomId, edit, enroll, start: () => players[0].post({action: 'create'}), tick: ms => { now += ms; }, now: () => now};
}
test('co-op lobby and sessions open for PHLT only when coop_rescue (and the shared lobby/combat flags) are on', async t => {
  const off = await fixture(t, 1, {party_lobby: true, party_combat: true}).catch(e => e);
  assert.equal(off.code, 'feature_disabled', 'no PHLT room without coop_rescue');
  const noLobby = await fixture(t, 1, {coop_rescue: true}).catch(e => e);
  assert.equal(noLobby.code, 'feature_disabled', 'PHLT never falls back to the legacy room path');
  const f = await fixture(t);
  assert.equal((await f.DB.prepare('SELECT mode FROM rooms WHERE id=?1').bind(f.roomId).first()).mode, 'phlt');
  assert.equal((await f.DB.prepare('SELECT objective FROM lobby_rooms WHERE room_id=?1').bind(f.roomId).first()).objective, 'rescue');
  f.env.FEATURE_FLAGS.coop_rescue = false;
  await assert.rejects(() => f.start(), {code: 'feature_disabled'});
  await assert.rejects(() => f.players[0].lobby({action: 'heartbeat'}), {code: 'feature_disabled'});
});
test('rooms and sessions never cross modes', async t => {
  const f = await fixture(t, 2, {...FLAGS()});
  const ctc = await f.enroll('ctc', 'ctc');
  await assert.rejects(() => ctc.lobby({action: 'join', room_id: f.roomId}), {code: 'different_mode'});
  const phltOnly = f.players[0];
  await assert.rejects(() => phltOnly.lobby({action: 'invite', name: 'Coopctc'}), {code: 'invites_ctc_only'});
  await assert.rejects(() => phltOnly.lobby({action: 'objective', objective: 'farm'}), {code: 'bad_objective'});
  const created = await ctc.lobby({action: 'create'});
  const second = await f.enroll('phlt2');
  await assert.rejects(() => second.lobby({action: 'join', room_id: created.room.id}), {code: 'different_mode'});
  for (const activity of ['party', 'dungeon', 'siege']) await assert.rejects(() => f.players[0].post({action: 'create', activity}), {code: 'bad_session_activity'}, activity);
  await assert.rejects(() => ctc.post({action: 'create', activity: 'rescue'}), {code: 'bad_session_activity'});
  // The legacy CTC room path (lobby flag off) cannot be used to slip into a PHLT room either.
  f.env.FEATURE_FLAGS.party_lobby = false;
  await assert.rejects(() => ctc.lobby({action: 'join', room_id: f.roomId}));
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM room_members WHERE room_id=?1').bind(f.roomId).first()).n, 2);
});
test('a rescue run: rescue command validation, cost, one revival, and the public view', async t => {
  const f = await fixture(t, 3), [a, b, c] = f.players;
  const created = await f.start(), id = created.session.id;
  assert.equal(created.session.activity, 'rescue'); assert.equal(created.session.mode, 'phlt');
  assert.match(created.session.loot_policy, /Rescue marks only/);
  await f.edit(id, s => { for (const x of s.actors) x.cooldown = 1e6; s.boss.cooldown = 1e6; });
  const tick = (await a.get(id)).session.tick + 1;
  for (const bad of [{kind: 'rescue'}, {kind: 'rescue', target: 'boss'}, {kind: 'rescue', target: a.id}, {kind: 'rescue', target: 'nobody'}, {kind: 'capture', target: 'p1'}, {kind: 'supply', target: b.id}])
    await assert.rejects(() => a.post({action: 'command', id, seq: 1, tick, ...bad}), {code: 'bad_session_command'}, JSON.stringify(bad));
  await f.edit(id, s => { const x = s.actors.find(v => v.id === b.id); x.hp = 0; x.downedUntil = s.tick + 24; });
  const view = (await a.get(id)).session, downed = view.actors.find(v => v.id === b.id);
  assert.ok(downed.down > 0); assert.equal(downed.rescued, 0);
  // Two rescuers in the same tick: one revival, one cost.
  const t0 = view.tick + 1;
  await a.post({action: 'command', id, seq: 1, tick: t0, kind: 'rescue', target: b.id});
  await c.post({action: 'command', id, seq: 1, tick: t0, kind: 'rescue', target: b.id});
  f.tick(250); const after = (await a.get(id)).session, by = Object.fromEntries(after.actors.map(v => [v.id, v]));
  assert.ok(by[b.id].hp > 0 && by[b.id].rescued === 1 && by[b.id].down === 0);
  assert.equal(by[a.id].contribution.rescue + by[c.id].contribution.rescue, 1, 'exactly one rescuer is credited and charged');
  const payer = by[a.id].contribution.rescue ? by[a.id] : by[c.id], other = payer === by[a.id] ? by[c.id] : by[a.id];
  assert.ok(payer.hp < payer.maxHp && other.hp >= other.maxHp - 1e-6);
});
test('completion pays rescue marks in the PHLT ledger only, capped per day and wallet, claim idempotent', async t => {
  const f = await fixture(t), [a, b] = f.players;
  const id = (await f.start()).session.id;
  await f.edit(id, s => { s.actors[0].contribution.rescue = 1; s.boss.hp = 1; s.boss.def = 0; for (const x of s.actors) { x.cooldown = 0; x.contribution.damage = Math.max(x.contribution.damage, 1); } });
  let view;
  for (let i = 0; i < 12; i++) { f.tick(250); await b.get(id); view = (await a.get(id)).session; if (view.status !== 'active') break; }
  assert.equal(view.status, 'completed');
  const ra = await a.post({action: 'claim', id}), rb = await b.post({action: 'claim', id}), again = await a.post({action: 'claim', id});
  assert.equal(ra.receipt.amount, 2, 'a rescuer earns a bonus mark'); assert.equal(rb.receipt.amount, 1); assert.deepEqual(again.receipt, ra.receipt);
  const rows = (await f.DB.prepare("SELECT mode,asset,source,delta FROM resource_ledger WHERE request_id=?1 ORDER BY delta DESC").bind('party:' + id).all()).results.map(r => ({...r}));
  assert.deepEqual(rows, [{mode: 'phlt', asset: 'rescue_mark', source: 'rescue_completion', delta: 2}, {mode: 'phlt', asset: 'rescue_mark', source: 'rescue_completion', delta: 1}]);
  assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM resource_ledger WHERE mode='ctc'").first()).n, 0, 'nothing reaches the CTC ledger');
  await assert.rejects(() => a.economy(), {code: 'feature_disabled'}, 'the CTC merit economy stays closed to PHLT');
});
test('rescue marks respect the daily cap and the wallet cap', async t => {
  const finish = async (f, id, rescue) => {
    await f.edit(id, s => { s.actors[0].contribution.rescue = rescue; s.boss.hp = 1; s.boss.def = 0; for (const x of s.actors) { x.cooldown = 0; x.contribution.damage = Math.max(x.contribution.damage, 1); } });
    let v; for (let i = 0; i < 12; i++) { f.tick(250); await f.players[1].get(id); v = (await f.players[0].get(id)).session; if (v.status !== 'active') break; } return v.status;
  };
  const day = new Date(Date.UTC(2026, 9, 8, 12)).toISOString().slice(0, 10);
  const ledger = (f, who, delta, d, req) => f.DB.prepare("INSERT INTO resource_ledger(account_id,mode,asset,request_id,source,delta,day,created_at) VALUES(?1,'phlt','rescue_mark',?2,'seed',?3,?4,1)").bind(who, req, delta, d).run();
  const f = await fixture(t), [a, b] = f.players, id = (await f.start()).session.id;
  await ledger(f, a.id, 2, day, 'seed-daily');
  assert.equal(await finish(f, id, 1), 'completed');
  assert.equal((await a.post({action: 'claim', id})).receipt.amount, 1, 'the bonus is trimmed to the 3/day cap (2 already earned)');
  await ledger(f, b.id, 3, day, 'seed-today');
  assert.equal((await b.post({action: 'claim', id})).receipt.amount, 0, 'no marks once the daily cap is full');
  assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM resource_ledger WHERE account_id=?1 AND source='rescue_completion'").bind(b.id).first()).n, 0, 'a zero receipt writes no ledger row');
  const g = await fixture(t), [x] = g.players, gid = (await g.start()).session.id;
  await ledger(g, x.id, 29, '2026-09-01', 'seed-wallet');
  assert.equal(await finish(g, gid, 1), 'completed');
  assert.equal((await x.post({action: 'claim', id: gid})).receipt.amount, 1, 'wallet 29/30 leaves room for one mark');
});
test('turning coop_rescue off aborts a live run and keeps its record', async t => {
  const f = await fixture(t), [a, b] = f.players, id = (await f.start()).session.id;
  assert.equal((await a.get(id)).session.status, 'active');
  f.env.FEATURE_FLAGS.coop_rescue = false;
  await assert.rejects(() => b.get(id), {code: 'feature_disabled'});
  assert.equal((await f.DB.prepare('SELECT status FROM combat_sessions WHERE id=?1').bind(id).first()).status, 'aborted');
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_members WHERE active=1').first()).n, 0, 'the roster is released');
  f.env.FEATURE_FLAGS.coop_rescue = true;
  assert.equal((await a.get(id)).session.status, 'aborted', 'history stays readable after re-enabling');
});
