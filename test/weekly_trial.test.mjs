import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';

const BOARD = rows => `{rows:${JSON.stringify(rows)},mine:null}`;
const DATA = `{v:1,now:1,rules:{version:'trial-v1',attempts_per_day:5,lengths:{short:3,long:6},board_size:20},
  week:{id:2900,start:${Date.UTC(2026, 9, 5)},end:${Date.UTC(2026, 9, 12)},rule:'tough',tag:'trial-v1:tough'},attempts:{used:2,left:3},
  boards:{short:{rows:[{placement:1,name:'<img src=x onerror=alert(1)>',depth:3,score:3,me:false},{placement:2,name:'Tôi',depth:2,score:2.4,me:true}],mine:{depth:2,score:2.4,placement:2}},
          long:${BOARD([])}}}`;
function ready(extra = {}) {
  const g = game();
  g.run(`fixture('phlt',60);setFeatureFlags(${JSON.stringify({party_combat: true, coop_rescue: true, party_lobby: true, weekly_trial: true, ...extra})});onlSet({id:'me',token:'local-trial-token'});trialRender=()=>{};partyRender=()=>{};TRIAL_CLIENT.identity=trialIdentity();PARTY_CLIENT.identity=partyIdentity()`);
  return g;
}
test('trial identity needs PHLT, its own flag (plus coop_rescue), a token and no sandbox', () => {
  assert.ok(ready().run('!!trialIdentity()'));
  assert.equal(ready({weekly_trial: false}).run('trialIdentity()'), null);
  assert.equal(ready({coop_rescue: false}).run('trialIdentity()'), null, 'weekly_trial requires coop_rescue');
  const ctc = game(); ctc.run("fixture('ctc',60);setFeatureFlags({weekly_trial:true,coop_rescue:true});onlSet({id:'me',token:'t'})"); assert.equal(ctc.run('trialIdentity()'), null);
  const g = ready(); g.run('ADMV.sandbox=true'); assert.equal(g.run('trialIdentity()'), null);
  const g2 = ready(); g2.run("onlSet({id:'',token:''})"); assert.equal(g2.run('trialIdentity()'), null);
});
test('score text, week window in Vietnam time, and the rule list', () => {
  const g = ready();
  assert.equal(g.run('trialScoreText(3,3)'), 'hoàn thành 3 chặng'); assert.equal(g.run('trialScoreText(2.4,3)'), 'chặng 2 (+40%)'); assert.equal(g.run('trialScoreText(0,6)'), 'chặng 0'); assert.equal(g.run('trialScoreText(6,6)'), 'hoàn thành 6 chặng');
  assert.equal(g.run(`trialTime(${Date.UTC(2026, 9, 5)})`), '05/10 07:00 giờ VN', 'Monday 00:00 UTC is 07:00 in Vietnam');
  for (const id of ['iron', 'swift', 'tough', 'ward']) assert.ok(g.run(`TRIAL_RULE_TEXT.${id}`).length > 5, id);
});
test('panel escapes names, shows the rule and attempts, and disables starts when none are left or a run is live', () => {
  const g = ready(); g.run(`TRIAL_CLIENT.data=${DATA}`);
  const html = g.run('trialPanelHTML()');
  assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /Trâu bò: HP chủ tướng ×1,25/); assert.match(html, /Còn 3\/5 lượt hôm nay/); assert.match(html, /05\/10 07:00 giờ VN/);
  assert.match(html, /Chạy ngắn \(3 chặng\)/); assert.match(html, /Chạy dài \(6 chặng\)/); assert.match(html, /hoàn thành 3 chặng/); assert.match(html, /Tốt nhất của bạn: chặng 2 \(\+40%\), hạng 2/);
  assert.doesNotMatch(html.match(/data-trial="short"[^>]*>/)[0], /disabled/);
  g.run("TRIAL_CLIENT.data.attempts.left=0"); assert.match(g.run('trialPanelHTML()').match(/data-trial="short"[^>]*>/)[0], /disabled/);
  g.run("TRIAL_CLIENT.data.attempts.left=2;PARTY_CLIENT.session={status:'active'}"); assert.match(g.run('trialPanelHTML()').match(/data-trial="long"[^>]*>/)[0], /disabled/, 'no second run while one is live');
  assert.match(game().run('trialPanelHTML()'), /Chưa tải được thử thách|Đang tải/);
});
test('load is throttled, ignores a stale account, and maps errors to friendly text', async () => {
  const g = ready(); g.run(`var calls=0,reply=${DATA};onlApi=async()=>{calls++;return reply}`);
  await g.run('trialLoad()'); await g.run('trialLoad()'); assert.equal(g.run('calls'), 1); await g.run('trialLoad(true)'); assert.equal(g.run('calls'), 2);
  g.run("var release;onlApi=async()=>new Promise(r=>release=r);TRIAL_CLIENT.loadedAt=0;var slow=trialLoad(true)");
  g.run("onlSet({id:'other',token:'other-token'})"); g.run(`release(${DATA.replace('id:2900', 'id:777')})`); await g.run('slow');
  assert.notEqual(g.run('TRIAL_CLIENT.data?.week.id'), 777);
  g.run("onlSet({id:'me',token:'local-trial-token'});TRIAL_CLIENT.identity=null;onlApi=async()=>{throw {error:'trial_locked',msg:''}}");
  await g.run('trialLoad(true)'); assert.equal(g.run('TRIAL_CLIENT.error'), 'Cần đồng bộ nhân vật hợp lệ gần đây.');
  g.run("setFeatureFlags({});var n=0;onlApi=async()=>{n++}"); await g.run('trialLoad(true)'); assert.equal(g.run('n'), 0, 'no request when the flag is off');
});
test('start prepares a solo room, then asks the server for the run; it refuses group rooms and bad input', async () => {
  const g = ready(); g.run("globalThis.crypto={randomUUID:()=>'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};var seen=[];onlApi=async(path,opt)=>{seen.push([path,opt?.body?JSON.parse(JSON.stringify(opt.body)):null]);if(path==='/room'&&!opt)return {room:null};if(path==='/room')return {room:{id:'room1',members:[{account_id:'me'}]}};if(path==='/sessions')return {session:{id:'trial1234567',mode:'phlt',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,activity:'trial',status:'active',revision:1,tick:0,next_seq:1,boss:{hp:1,max:1},actors:[],events:[],trial:{waves:3,length:'short',score:0},objectives:{depth:0}}};return TRIAL_DATA};var TRIAL_DATA=" + DATA);
  await g.run("trialStart('short')");
  assert.deepEqual(g.json("seen.map(x=>x[0]+':'+(x[1]?.action||'get'))"), ['/room:get', '/room:create', '/room:ready', '/sessions:create', '/trial:get']);
  assert.deepEqual(g.json("seen.find(x=>x[0]==='/sessions')[1]"), {action: 'create', id: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', activity: 'trial', length: 'short'});
  assert.equal(g.run('PARTY_CLIENT.session?.activity'), 'trial');
  const grp = ready(); grp.run("var seen=[];onlApi=async(path,opt)=>{seen.push(path+':'+(opt?.body?.action||'get'));if(path==='/room'&&!opt)return {room:{id:'r',members:[{},{}]}};return {}}");
  await grp.run("trialStart('long')"); assert.deepEqual(grp.json('seen'), ['/room:get']); assert.equal(grp.run('TRIAL_CLIENT.error'), 'Rời phòng nhóm trước: thử thách chỉ chạy một mình.'); assert.equal(grp.run('TRIAL_CLIENT.busy'), false);
  const bad = ready(); bad.run("var n=0;onlApi=async()=>{n++;return {}}"); await bad.run("trialStart('forever')"); assert.equal(bad.run('n'), 0, 'unknown length sends nothing');
  const live = ready(); live.run("PARTY_CLIENT.session={status:'active'};var n=0;onlApi=async()=>{n++;return {}}"); await live.run("trialStart('short')"); assert.equal(live.run('n'), 0, 'blocked while another run is live');
});
test('session panel shows a trial run without any reward or claim button', () => {
  const g = ready();
  g.run("var trialRun={id:'trial1234567',mode:'phlt',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,activity:'trial',status:'active',revision:2,tick:9,next_seq:2,boss:{hp:80,max:100},objectives:{depth:1},trial:{waves:3,length:'short',score:1.2,week:2900,rule:'tough'},actors:[{id:'me',name:'Tôi',hp:50,maxHp:100,mp:10,contribution:{damage:3,heal:0,prevented:0,control:0},connected:true}],events:[]};partyAccept({session:trialRun},partyIdentity())");
  const live = g.run('partyPanelHTML()');
  assert.match(live, /Thử thách tuần PHLT/); assert.match(live, /Chặng 2\/3/); assert.match(live, /chuyến ngắn/); assert.match(live, /điểm 1\.20/); assert.match(live, /data-party="guard"/); assert.match(live, /Không có thưởng/);
  g.run("trialRun.status='completed';trialRun.objectives.depth=3;trialRun.trial.score=3;trialRun.revision=3;partyAccept({session:trialRun},partyIdentity())");
  const done = g.run('partyPanelHTML()'); assert.match(done, /hoàn thành 3 chặng/); assert.match(done, /đã ghi vào bảng tuần/); assert.doesNotMatch(done, /data-party="claim"/); assert.doesNotMatch(done, /Chưa chốt thưởng/);
  g.run("trialRun.status='aborted';trialRun.objectives.depth=1;trialRun.revision=4;partyAccept({session:trialRun},partyIdentity())"); assert.match(g.run('partyPanelHTML()'), /đạt chặng 1/);
});
