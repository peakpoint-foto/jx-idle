import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';

const DATA = `{v:1,rules:{minPoints:3,minGroup:5},now:1,season:{index:700,start:${Date.UTC(2026, 9, 8)},end:${Date.UTC(2026, 10, 5)},final_at:${Date.UTC(2026, 10, 6)}},
  standing:{fac:'shaolin',bracket:'so',points:40,wins:13,min_points:3,eligible:true,placement:1,group_size:6},
  board:[{placement:1,name:'<img src=x onerror=alert(1)>',points:40,wins:13,me:true},{placement:2,name:'Bạn',points:24,wins:8,me:false}],
  claims:[{season:699,title:'champion',placement:1,group_size:5,points:30,wins:10,claimed_at:null,claim_open:true,claim_deadline:${Date.UTC(2026, 10, 7)},board:[{placement:1,name:'Cũ',points:30,wins:10,me:true}]},
          {season:698,title:'top3',placement:2,group_size:6,points:20,wins:6,claimed_at:5,claim_open:true,claim_deadline:${Date.UTC(2026, 10, 7)}}],
  titles:[{season:697,title:'contender',placement:3}],
  guild:{id:'g',name:'<b>Bang</b>',cap:30,mine:30,total:46,members:[{name:'A',points:30},{name:'B',points:16}],board:[{name:'<b>Bang</b>',total:46}]}}`;
function ready() {
  const g = game();
  g.run("fixture('ctc',60);setFeatureFlags({ranked_seasons:true});onlSet({id:'me',token:'local-season-token'});seasonRender=()=>{};SEASON_CLIENT.identity=seasonIdentity()");
  return g;
}
test('season times are published in UTC and shown in Vietnam time', () => {
  const g = ready();
  assert.equal(g.run(`seasonTime(${Date.UTC(2026, 9, 8)})`), '08/10/2026 07:00 giờ VN', 'Thursday 00:00 UTC is 07:00 in Vietnam');
  assert.equal(g.run(`seasonTime(${Date.UTC(2026, 11, 31, 17, 5)})`), '01/01/2027 00:05 giờ VN');
});
test('identity needs the flag, a CTC character, a token and no sandbox', () => {
  const g = ready();
  assert.ok(g.run('!!seasonIdentity()'));
  g.run('setFeatureFlags({ranked_seasons:false})'); assert.equal(g.run('seasonIdentity()'), null);
  g.run("setFeatureFlags({ranked_seasons:true});S.mode='phlt'"); assert.equal(g.run('seasonIdentity()'), null);
  g.run("S.mode='ctc';ADMV.sandbox=true"); assert.equal(g.run('seasonIdentity()'), null);
  g.run("ADMV.sandbox=false;onlSet({id:'',token:''})"); assert.equal(g.run('seasonIdentity()'), null);
});
test('panel escapes names, offers a claim only while open and unclaimed, and hides the guild block without a guild', () => {
  const g = ready();
  assert.match(g.run('seasonPanelHTML()'), /Chưa tải được mùa|Đang tải/);
  g.run(`SEASON_CLIENT.data=${DATA}`);
  const html = g.run('seasonPanelHTML()');
  assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<b>Bang<\/b>/); assert.match(html, /&lt;b&gt;Bang&lt;\/b&gt;/);
  assert.equal((html.match(/data-season="claim"/g) || []).length, 1, 'only the unclaimed season can be claimed');
  assert.match(html, /data-index="699"/); assert.doesNotMatch(html, /data-index="698"/);
  assert.match(html, /Quán quân mùa/); assert.match(html, /Tam hùng/); assert.match(html, /hạng 1\/6/);
  assert.match(html, /tối đa 30 điểm mỗi người mỗi mùa/); assert.match(html, /30\/30/);
  assert.match(html, /Danh hiệu chỉ để trưng bày, không có chỉ số hay tài nguyên/);
  g.run("SEASON_CLIENT.data.guild=null;SEASON_CLIENT.data.standing.eligible=false"); const solo = g.run('seasonPanelHTML()');
  assert.doesNotMatch(solo, /Hậu cần bang/); assert.match(solo, /chưa đủ điều kiện \(cần từ 3 điểm/);
  g.run("SEASON_CLIENT.data.claims[0].claim_open=false"); assert.match(g.run('seasonPanelHTML()'), /hết hạn nhận/);
});
test('load is throttled, stale identities are ignored, and errors are friendly', async () => {
  const g = ready();
  g.run(`var calls=0,reply=${DATA};onlApi=async()=>{calls++;return reply}`);
  await g.run('seasonLoad()'); await g.run('seasonLoad()'); assert.equal(g.run('calls'), 1, 'a fresh load is reused for 30 seconds');
  await g.run('seasonLoad(true)'); assert.equal(g.run('calls'), 2);
  g.run("var release;onlApi=async()=>new Promise(r=>release=r);SEASON_CLIENT.loadedAt=0;var slow=seasonLoad(true)");
  g.run("onlSet({id:'other',token:'other-token'})"); g.run(`release(${DATA.replace('index:700', 'index:777')})`); await g.run('slow');
  assert.notEqual(g.run('SEASON_CLIENT.data?.season.index'), 777, 'a response for the old account cannot overwrite the new one');
  g.run("onlApi=async()=>{throw {error:'season_locked',msg:''}};SEASON_CLIENT.loadedAt=0"); await g.run('seasonLoad(true)');
  assert.equal(g.run('SEASON_CLIENT.error'), 'Cần đồng bộ nhân vật hợp lệ gần đây để xem mùa.');
  g.run("setFeatureFlags({ranked_seasons:false});var n=0;onlApi=async()=>{n++}"); await g.run('seasonLoad(true)'); assert.equal(g.run('n'), 0, 'no request while the flag is off');
});
test('claim sends one exact request, ignores a double click, and takes the server view', async () => {
  const g = ready();
  g.run(`var sent=[],release;onlApi=async(path,opt)=>{sent.push([path,JSON.parse(JSON.stringify(opt.body))]);return new Promise(r=>release=r)};var first=seasonClaim(699);var second=seasonClaim(699)`);
  await g.run('second'); assert.equal(g.run('sent.length'), 1, 'a double click makes one request');
  g.run(`release(${DATA})`); await g.run('first');
  assert.deepEqual(g.json('sent[0]'), ['/season', {action: 'claim', season: 699}]);
  assert.equal(g.run('SEASON_CLIENT.data.season.index'), 700); assert.equal(g.run('SEASON_CLIENT.busy'), false);
  await g.run('seasonClaim(1.5)'); await g.run("seasonClaim('699')"); assert.equal(g.run('sent.length'), 1, 'only integer season ids are sent');
  g.run("onlApi=async()=>{throw {error:'season_claim_expired',msg:''}}"); await g.run('seasonClaim(699)'); assert.equal(g.run('SEASON_CLIENT.error'), 'Đã quá hạn nhận danh hiệu.');
});
test('panel is wired into the More tab and the script is loaded after the session panel', async () => {
  const {readFileSync} = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('js/online_sessions.js') > 0 && html.indexOf('js/ranked_seasons.js') > html.indexOf('js/online_sessions.js'));
  assert.match(readFileSync(new URL('../js/ranked_seasons.js', import.meta.url), 'utf8'), /renderMore=function\(\)\{const r=original\.apply\(this,arguments\);seasonRender\(\);seasonLoad\(\)/);
});
