import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';

function ready(mode, flags = {}) {
  const g = game();
  g.run(`fixture('${mode}',30);setFeatureFlags(${JSON.stringify(flags)});onlSet({id:'me',name:'Tester',token:'local-mode-token'});ONL.me={play_sec:3600,char:{sync_rev:2},flags:[]};ONL.lastSync=Date.now()`);
  return g;
}
test('mode eligibility: CTC always, PHLT and 2.0 only with their own flag', () => {
  assert.ok(ready('ctc').run('onlEligible()'));
  assert.equal(ready('phlt').run('onlEligible()'), false); assert.equal(ready('g2').run('onlEligible()'), false);
  assert.ok(ready('phlt', {online_account_phlt: true}).run('onlEligible()'));
  assert.equal(ready('phlt', {online_account_g2: true}).run('onlEligible()'), false, 'a flag for another mode does not open this one');
  assert.ok(ready('g2', {online_account_g2: true}).run('onlEligible()'));
  assert.equal(ready('g2', {online_account_phlt: true}).run('onlEligible()'), false);
  assert.equal(ready('phlt', {online_account_phlt: true}).run('onlModeOpen("nope")'), false);
});
test('registration for PHLT checks the mode config first and never calls /register when the mode is closed', async () => {
  const g = ready('phlt'); g.run("onlSet(null);S.lvl=20;var calls=[];onlApi=async(path,opt)=>{calls.push(path);if(path.startsWith('/config'))return {turnstile:'',capabilities:{online_account_phlt:false},feature_flags:{}};return {id:'x',token:'t',name:'N',character_id:'c_modes_register_0123'}}");
  await assert.rejects(() => g.run("onlRegister('N')"), {code: 'mode_not_open'});
  assert.deepEqual(g.json('calls'), ['/config?mode=phlt']);
  g.run("calls=[];onlApi=async(path,opt)=>{calls.push(path);if(path.startsWith('/config'))return {turnstile:'',capabilities:{online_account_phlt:true},feature_flags:{online_account_phlt:true}};return {id:'x',token:'tok',name:'N',character_id:'c_modes_register_0123',sync_rev:1}}");
  await g.run("onlRegister('N')");
  assert.deepEqual(g.json('calls'), ['/config?mode=phlt', '/register']);
  assert.ok(g.run('onlEligible()'), 'the flags learned during registration make the character eligible');
});
test('modes without an online account keep failing closed', async () => {
  const g = ready('ctc'); g.run("onlSet(null);S.lvl=20;S.mode='nope';var calls=0;onlApi=async()=>{calls++;return {}}");
  await assert.rejects(() => g.run("onlRegister('N')"), {code: 'not_ctc'}); assert.equal(g.run('calls'), 0);
});
test('PHLT card shows sync and play time only, with no CTC ladder, PvP, guild or room controls', () => {
  const html = ready('phlt', {online_account_phlt: true}).run('onlCardHTML()');
  assert.match(html, /Chơi Online · PHLT/); assert.match(html, /id="onlSyncBtn"/); assert.match(html, /khóa theo chế độ/);
  for (const id of ['onlRankBtn', 'onlDuelPanel', 'onlGuildPanel', 'onlRoomPanel']) assert.doesNotMatch(html, new RegExp(id), id);
  const ctc = ready('ctc').run('onlCardHTML()');
  for (const id of ['onlRankBtn', 'onlDuelPanel', 'onlGuildPanel', 'onlRoomPanel']) assert.match(ctc, new RegExp(id), id);
  assert.match(ready('g2').run('onlCardHTML()'), /chưa mở/);
});
test('a server snapshot from another mode is rejected, and activity receipts never leave non-CTC characters', async () => {
  const g = ready('phlt', {online_account_phlt: true});
  const pack = mode => g.run(`pack({...S,mode:'${mode}'})`);
  assert.ok(g.json(`onlPackedState(${JSON.stringify(pack('phlt'))}).mode`) === 'phlt');
  assert.throws(() => g.run(`onlPackedState(${JSON.stringify(pack('ctc'))})`), {code: 'bad_save'});
  assert.throws(() => g.run(`onlPackedState(${JSON.stringify(pack('g2'))})`), {code: 'bad_save'});
  g.run("var sent=0;onlApi=async()=>{sent++;return {}};activityReceiptEnqueue({id:'tower-1-smoke1234',kind:'tower',stage:{floor:2},contribution:{kills:4,cleared:1}})");
  assert.equal(await g.run('activityRetryReceipts()'), 0); assert.equal(g.run('sent'), 0);
});
