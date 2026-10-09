import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {mentor, MENTOR_RULES} from '../src/mentor.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';

async function fixture(t) {
  const DB = await localD1(); t.after(() => DB.close());
  const env = {DB, FEATURE_FLAGS: {mentor: true}}, players = [];
  // players[0]: sư phụ cấp 100; players[1]: đồ đệ cấp 50; players[2]: đồ đệ cấp 120 (quá cao)
  for (const [i, lvl] of [[0, 100], [1, 50], [2, 120]]) {
    const id = 'mplayer' + i, token = 'valid-mentor-token-0123456789-' + i;
    const state = Object.assign(GAME.newSave(), {fac: 'shaolin', mode: 'ctc', lvl});
    await DB.batch([
      DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at) VALUES(?1,?2,?3,?4)')
        .bind(id, await sha256Hex(token), 'MentorPlayer' + i, Date.now()),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status) VALUES(?1,?2,?3,'shaolin',?4,1000,?5,'verified')")
        .bind(id, 'mentor-character-' + i, JSON.stringify(state), lvl, Date.now()),
    ]);
    const req = (method = 'POST') => new Request('https://game.test/api/mentor',
      {method, headers: {authorization: 'Bearer ' + token}});
    players.push({id, post: body => mentor(req(), env, body), get: () => mentor(req('GET'), env)});
  }
  return {DB, env, players};
}

test('bái sư: đồ đệ dưới cấp 100, mỗi đồ đệ một sư phụ', async t => {
  const {players: p} = await fixture(t);
  const {inviteCode} = await p[0].post({action: 'invite_code'});
  assert.match(inviteCode, /^[A-HJ-NP-Z2-9]{8}$/);
  const r = await p[1].post({action: 'bind', code: inviteCode});
  assert.equal(r.ok, true);
  assert.equal(r.mentor, p[0].id);
  // bái lần 2 -> lỗi
  await assert.rejects(() => p[1].post({action: 'bind', code: inviteCode}), /already_has_mentor/);
  // đồ đệ cấp 120 -> từ chối
  await assert.rejects(() => p[2].post({action: 'bind', code: inviteCode}), /disciple_too_high/);
});

test('milestone: đồ đệ lên 60/100/180 thưởng cả hai, claim idempotent', async t => {
  const {DB, players: p} = await fixture(t);
  const {inviteCode} = await p[0].post({action: 'invite_code'});
  await p[1].post({action: 'bind', code: inviteCode});
  // đồ đệ lên cấp 65 -> đạt mốc 60
  await DB.prepare('UPDATE chars SET lvl=65 WHERE account_id=?1').bind(p[1].id).run();
  const st = await p[1].get();
  assert.ok(st.rewards.some(r => r.milestone === 60 && r.disciple_id === p[1].id), 'đồ đệ có thưởng mốc 60');
  const stM = await p[0].get();
  assert.ok(stM.rewards.some(r => r.milestone === 60 && r.disciple_id === p[1].id), 'sư phụ có thưởng mốc 60');
  // claim idempotent
  const c1 = await p[1].post({action: 'claim', milestone: 60, disciple_id: p[1].id, request_id: 'claim60a1'});
  assert.equal(c1.gold, MENTOR_RULES.rewards[60]);
  const c2 = await p[1].post({action: 'claim', milestone: 60, disciple_id: p[1].id, request_id: 'claim60a1'});
  assert.equal(c2.already, true, 'claim lại cùng request_id -> already');
  const c3 = await p[1].post({action: 'claim', milestone: 60, disciple_id: p[1].id, request_id: 'claim60b2'});
  assert.equal(c3.already, true, 'claim khác request_id vẫn already (đã nhận)');
  // sư phụ claim phần mình
  const cm = await p[0].post({action: 'claim', milestone: 60, disciple_id: p[1].id, request_id: 'claim60m1'});
  assert.equal(cm.gold, MENTOR_RULES.rewards[60]);
});
