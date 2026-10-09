import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';

const CODE = 'CH-ABCDEFGH', CODE2 = 'CH-JKLMNPQR';
const entry = (code, extra = '') => `{code:'${code}',preset:'std40',version:'g2-challenge-v1',author:'<b>Tác giả</b>',status:'open',created_at:1,finishers:2,outdated:false,spec:{fac:'shaolin',sex:0,attr:{str:1,dex:1,vit:1,eng:1},sk:{10:1},main:10}${extra}}`;
const DATA = `{v:1,now:1,rules:{version:'g2-challenge-v1',publishPerDay:5,attempts_per_day:10},presets:CHALLENGE_PRESETS_LIST,attempts:{used:3,left:7},mine:[${entry(CODE)}],recent:[${entry(CODE2)}]}`;
function ready(extra = {}) {
  const g = game();
  g.run(`fixture('g2',60);setFeatureFlags(${JSON.stringify({community_challenge: true, online_account_g2: true, ...extra})});globalThis.crypto=globalThis.crypto||{randomUUID:()=>'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};onlSet({id:'me',token:'local-challenge-token'});challengeRender=()=>{};partyRender=()=>{};CHALLENGE_CLIENT.identity=challengeIdentity();PARTY_CLIENT.identity=partyIdentity();var CHALLENGE_PRESETS_LIST=Object.values(CHALLENGE_PRESETS).map(p=>({id:p.id,label:p.label,level:p.level,waves:p.waves,scale:p.scale,budget:challengeBudgets(p.id)}))`);
  return g;
}
test('identity needs 2.0, its own flag (plus the account flag), a token and no sandbox', () => {
  assert.ok(ready().run('!!challengeIdentity()'));
  assert.equal(ready({community_challenge: false}).run('challengeIdentity()'), null);
  assert.equal(ready({online_account_g2: false}).run('challengeIdentity()'), null, 'community_challenge requires online_account_g2');
  for (const mode of ['ctc', 'phlt']) { const g = game(); g.run(`fixture('${mode}',60);setFeatureFlags({community_challenge:true,online_account_g2:true,party_combat:true,coop_rescue:true});onlSet({id:'me',token:'t'})`); assert.equal(g.run('challengeIdentity()'), null, mode); }
  const g = ready(); g.run('ADMV.sandbox=true'); assert.equal(g.run('challengeIdentity()'), null);
  const g2 = ready(); g2.run("onlSet({id:'',token:''})"); assert.equal(g2.run('challengeIdentity()'), null);
});
test('the session client follows the 2.0 flag, not the party flag', () => {
  const g = ready(); assert.equal(g.run('partyFlag()'), 'community_challenge'); assert.ok(g.run('!!partyIdentity()'));
  g.run("setFeatureFlags({party_combat:true})"); assert.equal(g.run("featureEnabled(partyFlag())"), false, 'party_combat does not open 2.0 sessions');
  const c = game(); c.run("fixture('ctc',60)"); assert.equal(c.run('partyFlag()'), 'party_combat');
});
test('a build from the current character is cut to the preset budget and always passes the shared check', () => {
  const g = ready();
  for (const presetId of ['std40', 'std60', 'std100']) for (const facKey of g.json('Object.keys(FAC)')) {
    g.run(`S.fac='${facKey}';S.sex=0;S.lvl=140;S.attr={str:900,dex:800,vit:700,eng:600};S.sk=Object.fromEntries(FAC[S.fac].skills.filter(id=>SK[id]).map(id=>[id,SK[id].max||20]));S.main=${'FAC.' + facKey + '.skills'}.map(Number).find(id=>SK[id]&&SK[id].kind!=='passive')`);
    const spec = g.json(`challengeSpecFromSave(S,'${presetId}')`); assert.ok(spec, facKey + presetId);
    assert.equal(g.json(`challengeSpecCheck(${JSON.stringify(spec)},'${presetId}').ok`), true, facKey + presetId);
    const b = g.json(`challengeBudgets('${presetId}')`);
    assert.ok(Object.values(spec.attr).reduce((n, v) => n + v, 0) <= b.attr); assert.ok(Object.values(spec.sk).reduce((n, v) => n + v, 0) <= b.skill);
    assert.equal(spec.fac, facKey); assert.ok(g.run(`SK[${spec.main}].kind!=='passive'`));
  }
  // The character's own gear, gold and name never become part of the build.
  g.run("S.gold=999999;S.name='Tên riêng'"); assert.deepEqual(Object.keys(g.json("challengeSpecFromSave(S,'std60')")), ['fac', 'sex', 'attr', 'sk', 'main']);
  g.run("S.fac='shaolin';S.attr={str:1,dex:2,vit:3,eng:4};S.sk={};S.main=0"); assert.equal(g.run("challengeSpecFromSave(S,'std60')"), null, 'no usable skill means no build');
  assert.equal(g.run("challengeSpecFromSave(S,'std61')"), null); assert.equal(g.run("challengeSpecFromSave({fac:'nope'},'std60')"), null);
  g.run("S.fac='shaolin';S.sk={10:1};S.main=10;S.attr={str:3,dex:0,vit:0,eng:0}"); assert.deepEqual(g.json("challengeSpecFromSave(S,'std40').attr"), {str: 3, dex: 0, vit: 0, eng: 0}, 'a build under budget is kept as is');
});
test('panel escapes names, shows attempts, own and recent lists, and disables by state', () => {
  const g = ready(); g.run("S.fac='shaolin';S.sk={10:1};S.main=10;S.attr={str:3,dex:0,vit:0,eng:0};CHALLENGE_CLIENT.data=" + DATA);
  let html = g.run('challengePanelHTML()');
  assert.doesNotMatch(html, /<b>Tác giả<\/b>/); assert.match(html, /&lt;b&gt;Tác giả&lt;\/b&gt;/); assert.match(html, /Còn 7\/10 lượt hôm nay/); assert.match(html, /Của tôi \(1\)/); assert.match(html, /Mới đăng \(1\)/);
  assert.match(html, new RegExp(CODE)); assert.match(html, /Chuẩn cấp 40/); assert.match(html, /2 người đã chạy/); assert.match(html, /Không có thưởng/);
  assert.doesNotMatch(html.match(/data-challenge="start" data-code="CH-ABCDEFGH"[^>]*>/)[0], /disabled/);
  assert.equal((html.match(/data-challenge="retire"/g) || []).length, 1, 'only own challenges can be retired');
  g.run("CHALLENGE_CLIENT.data.attempts.left=0"); assert.match(g.run('challengePanelHTML()').match(/data-challenge="start" data-code="CH-ABCDEFGH"[^>]*>/)[0], /disabled/);
  g.run("CHALLENGE_CLIENT.data.attempts.left=3;PARTY_CLIENT.session={status:'active'}"); assert.match(g.run('challengePanelHTML()').match(/data-challenge="start" data-code="CH-ABCDEFGH"[^>]*>/)[0], /disabled/, 'no second run while one is live');
  g.run("PARTY_CLIENT.session=null;CHALLENGE_CLIENT.data.mine[0].outdated=true"); assert.match(g.run('challengePanelHTML()').match(/data-challenge="start" data-code="CH-ABCDEFGH"[^>]*>/)[0], /disabled/, 'outdated rules cannot be run');
  g.run("CHALLENGE_CLIENT.detail={challenge:" + entry(CODE) + ",board:{rows:[{placement:1,name:'Tôi',score:3.4,me:true}],mine:{score:3.4,placement:1}}}");
  html = g.run('challengePanelHTML()'); assert.match(html, /Tốt nhất của bạn: chặng 3 \(\+40%\), hạng 1/);
  g.run("S.sk={};CHALLENGE_CLIENT.data.attempts.left=3"); assert.match(g.run('challengePanelHTML()').match(/data-challenge="publish" data-preset="std40"[^>]*>/)[0], /disabled/, 'a build that does not fit cannot be posted');
  assert.match(game().run('challengePanelHTML()'), /Chưa tải được thử thách|Đang tải/);
  assert.equal(g.run("challengeScoreText(6,6)"), 'hoàn thành 6 chặng');
});
test('load throttles, ignores a stale account and maps errors to friendly text', async () => {
  const g = ready(); g.run(`var calls=0,reply=${DATA};onlApi=async()=>{calls++;return reply}`);
  await g.run('challengeLoad()'); await g.run('challengeLoad()'); assert.equal(g.run('calls'), 1); await g.run('challengeLoad(true)'); assert.equal(g.run('calls'), 2);
  g.run("var release;onlApi=async()=>new Promise(r=>release=r);CHALLENGE_CLIENT.loadedAt=0;var slow=challengeLoad(true)");
  g.run("onlSet({id:'other',token:'other-token'})"); g.run(`release(${DATA.replace('left:7', 'left:1')})`); await g.run('slow');
  assert.notEqual(g.run('CHALLENGE_CLIENT.data?.attempts.left'), 1);
  g.run("onlSet({id:'me',token:'local-challenge-token'});CHALLENGE_CLIENT.identity=null;onlApi=async()=>{throw {error:'challenge_locked',code:'challenge_locked',msg:''}}");
  await g.run('challengeLoad(true)'); assert.equal(g.run('CHALLENGE_CLIENT.error'), 'Cần đồng bộ nhân vật hợp lệ gần đây.');
  g.run("setFeatureFlags({});var n=0;onlApi=async()=>{n++}"); await g.run('challengeLoad(true)'); assert.equal(g.run('n'), 0, 'no request when the flag is off');
});
test('publish, retire, board and start send exactly the documented bodies', async () => {
  const g = ready(); g.run(`globalThis.crypto={randomUUID:()=>'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};S.fac='shaolin';S.sk={10:1};S.main=10;S.attr={str:3,dex:0,vit:0,eng:0};CHALLENGE_CLIENT.data=${DATA};
    var seen=[];onlApi=async(path,opt)=>{seen.push([path,opt?.body?JSON.parse(JSON.stringify(opt.body)):null]);
      if(path==='/challenge'&&opt?.body?.action==='publish')return {code:'${CODE}',...${DATA}};
      if(path==='/challenge'&&opt?.body?.action==='retire')return {...${DATA},mine:[]};
      if(path==='/challenge'&&opt?.body?.action==='start')return {session_id:'aaaaaaaabbbbccccddddeeeeeeeeeeee'};
      if(path.startsWith('/challenge?code='))return {challenge:${entry(CODE)},board:{rows:[],mine:null}};
      if(path==='/sessions?id=aaaaaaaabbbbccccddddeeeeeeeeeeee')return {session:{id:'aaaaaaaabbbbccccddddeeeeeeeeeeee',mode:'g2',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,activity:'challenge',status:'active',revision:1,tick:0,next_seq:1,boss:{hp:1,max:1},actors:[],events:[],trial:{waves:6,length:'standard',score:0},objectives:{depth:0},challenge:{code:'${CODE}'}}};
      return ${DATA}}`);
  await g.run("challengePublish('std40')");
  const pub = g.json("seen.find(x=>x[1]?.action==='publish')[1]"); assert.deepEqual(Object.keys(pub), ['action', 'preset', 'spec']); assert.equal(pub.preset, 'std40'); assert.equal(g.json(`challengeSpecCheck(${JSON.stringify(pub.spec)},'std40').ok`), true);
  await g.run("challengeRetire('CH-ABCDEFGH')"); assert.deepEqual(g.json("seen.find(x=>x[1]?.action==='retire')[1]"), {action: 'retire', code: CODE}); assert.equal(g.run('CHALLENGE_CLIENT.data.mine.length'), 0);
  g.run('seen.length=0'); await g.run("challengeStart('CH-ABCDEFGH')");
  assert.deepEqual(g.json("seen.find(x=>x[1]?.action==='start')[1]"), {action: 'start', code: CODE, id: 'aaaaaaaabbbbccccddddeeeeeeeeeeee'});
  assert.equal(g.run('PARTY_CLIENT.session?.activity'), 'challenge'); assert.equal(g.run('R.onlineSession?.challenge.code'), CODE);
  assert.ok(g.json("seen.map(x=>x[0])").some(p => p.startsWith('/challenge?code=')), 'the board is reloaded after a start');
  assert.match(g.run('partyPanelHTML()'), /Thử thách cộng đồng 2\.0/); assert.match(g.run('partyPanelHTML()'), /Không có thưởng/); assert.doesNotMatch(g.run('partyPanelHTML()'), /data-party="claim"/);
  g.run("PARTY_CLIENT.session.status='completed'"); assert.match(g.run('partyPanelHTML()'), /đã ghi vào bảng của thử thách/); assert.doesNotMatch(g.run('partyPanelHTML()'), /data-party="claim"/);
  // Bad input and a live run send nothing.
  const bad = ready(); bad.run("var n=0;onlApi=async()=>{n++;return {}}"); await bad.run("challengeStart('nope')"); await bad.run("challengeStart('CH-ABCDEFG1')"); assert.equal(bad.run('n'), 0); assert.equal(bad.run('CHALLENGE_CLIENT.error'), 'Mã thử thách không hợp lệ.');
  const live = ready(); live.run("PARTY_CLIENT.session={status:'active'};var n=0;onlApi=async()=>{n++;return {}}"); await live.run("challengeStart('CH-ABCDEFGH')"); assert.equal(live.run('n'), 0);
  const full = ready(); full.run("onlApi=async()=>{throw {error:'challenge_attempts_used',code:'challenge_attempts_used',msg:''}}"); await full.run("challengeStart('CH-ABCDEFGH')"); assert.equal(full.run('CHALLENGE_CLIENT.error'), 'Hết lượt thử hôm nay.'); assert.equal(full.run('CHALLENGE_CLIENT.busy'), false);
});
