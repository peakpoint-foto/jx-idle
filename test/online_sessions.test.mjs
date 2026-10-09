import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run("fixture('ctc',60);setFeatureFlags({party_combat:true});onlSet({id:'me',token:'local-test-party-token'});partyRender=()=>{};PARTY_CLIENT.identity=partyIdentity();var snapshot={id:'session123456',mode:'ctc',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,status:'active',revision:1,tick:0,next_seq:1,boss:{hp:100,max:100},actors:[],events:[]};partyAccept({session:snapshot},partyIdentity())");return g;}
test('lost command acknowledgement retries exact payload after poll; stale revisions and changed identities cannot overwrite',async()=>{
  const g=ready();g.run("var bodies=[],attempt=0;onlApi=async(path,opt)=>{bodies.push(JSON.parse(JSON.stringify(opt.body)));if(attempt++===0)throw Error('offline');return {session:{...snapshot,revision:3,next_seq:2}}}");
  await g.run("partyWrite('guard')");assert.ok(g.run('!!PARTY_CLIENT.pending'));
  g.run('partyAccept({session:{...snapshot,revision:2,tick:4,next_seq:2}},partyIdentity())');await g.run('partyWrite()');
  assert.deepEqual(g.json('bodies[0]'),g.json('bodies[1]'));assert.equal(g.run('PARTY_CLIENT.pending'),null);
  g.run('partyAccept({session:snapshot},partyIdentity())');assert.equal(g.run('PARTY_CLIENT.session.revision'),3);
  g.run("var oldIdentity=partyIdentity();onlSet({id:'other',token:'other-token'});partyAccept({session:snapshot},oldIdentity)");assert.equal(g.run('PARTY_CLIENT.session.revision'),3);
});
test('server rejection releases pending request; mode/flag/sandbox guards make no request and active session pauses local combat',async()=>{
  const g=ready();g.run("onlApi=async()=>{throw {error:'command_window',msg:'late'}}");await g.run("partyWrite('guard')");assert.equal(g.run('PARTY_CLIENT.pending'),null);
  g.run('var life=R.life,saveBefore=JSON.stringify(S);tick(1)');assert.equal(g.run('R.life'),g.run('life'));assert.equal(g.run('JSON.stringify(S)'),g.run('saveBefore'));
  g.run("var calls=0;onlApi=async()=>{calls++;return {session:null}};setFeatureFlags({party_combat:false})");await g.run('partyPoll()');await g.run("partyWrite('create')");assert.equal(g.run('calls'),0);assert.equal(g.run('R.onlineSession'),null);
  g.run("setFeatureFlags({party_combat:true});S.mode='phlt'");await g.run("partyWrite('create')");assert.equal(g.run('calls'),0);
  g.run("S.mode='ctc';ADMV.sandbox=true");await g.run("partyWrite('create')");assert.equal(g.run('calls'),0);
});
test('an older in-flight empty poll cannot erase a newly acknowledged session',async()=>{
  const g=ready();g.run("var releaseRead;onlApi=async(path,opt)=>opt?.body?{session:{...snapshot,revision:4}}:new Promise(r=>releaseRead=r);var read=partyPoll(true)");
  await g.run("partyWrite('guard')");g.run('releaseRead({session:null})');await g.run('read');
  assert.equal(g.run('PARTY_CLIENT.session.revision'),4);assert.equal(g.run('R.onlineSession.id'),'session123456');
});
const siegeSnapshot="var siege={id:'siege1234567',mode:'ctc',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,activity:'siege',status:'active',revision:2,tick:5,next_seq:3,boss:{hp:80,max:100,gate:1},objectives:{captured:1,points:[{id:'p1',need:12,progress:12,owned:true},{id:'p2',need:12,progress:5.75,owned:false},{id:'p3',need:12,progress:0,owned:false}]},actors:[{id:'me',name:'Tôi',hp:50,maxHp:100,mp:10,contribution:{damage:3,heal:0,prevented:0,control:0,capture:4,logistics:2},connected:true},{id:'ally',name:'Bạn',hp:60,maxHp:100,mp:10,contribution:{damage:1,heal:0,prevented:0,control:0,capture:0,logistics:0},connected:true}],events:[]}";
test('siege panel shows gate, point progress, capture on open points only and supply for allies only',()=>{
  const g=ready();g.run(siegeSnapshot+";partyAccept({session:siege},partyIdentity())");
  const html=g.run('partyPanelHTML()');
  assert.match(html,/Công thành CTC · Chiếm điểm/);assert.match(html,/cổng đóng, chủ tướng chỉ chịu 20% sát thương/);
  assert.match(html,/Điểm P1<\/b> · Đã chiếm/);assert.match(html,/Điểm P2<\/b> · 5\/12/);
  assert.equal((html.match(/data-party="capture"/g)||[]).length,2,'owned point has no capture button');assert.doesNotMatch(html,/data-party="capture" data-target="p1"/);
  assert.equal((html.match(/data-party="supply"/g)||[]).length,1);assert.match(html,/data-party="supply" data-target="ally"/);assert.doesNotMatch(html,/data-party="supply" data-target="me"/);
  assert.match(html,/chiếm 4, tiếp tế 2/);
  g.run("siege.boss.gate=0;siege.revision=3;partyAccept({session:siege},partyIdentity())");assert.match(g.run('partyPanelHTML()'),/cổng đã mở/);
  g.run("siege.status='completed';siege.revision=4;partyAccept({session:siege},partyIdentity())");const done=g.run('partyPanelHTML()');
  assert.doesNotMatch(done,/data-party="capture"|data-party="supply"/);assert.match(done,/data-party="claim"/);
});
test('siege entry needs its own flag; capture/supply commands and the quota error behave',async()=>{
  const g=ready();g.run("PARTY_CLIENT.session=null;R.onlineSession=null");
  assert.doesNotMatch(g.run('partyPanelHTML()'),/data-party="siege"/);
  g.run("setFeatureFlags({party_combat:true,party_siege:true})");assert.match(g.run('partyPanelHTML()'),/data-party="siege"\s*>Công thành tổ đội/);
  g.run("globalThis.crypto={randomUUID:()=>'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}");
  g.run("var sent=[];onlApi=async(path,opt)=>{sent.push(JSON.parse(JSON.stringify(opt.body)));throw {error:'siege_quota_used',msg:''}}");
  await g.run("partyWrite('siege')");
  assert.equal(g.json('sent[0].action'),'create');assert.equal(g.json('sent[0].activity'),'siege');assert.equal(g.run('PARTY_CLIENT.pending'),null,'a definite rejection frees the request');
  assert.match(g.run('PARTY_CLIENT.error'),/mỗi người 1 lần mỗi tuần/);
  g.run(siegeSnapshot+";partyAccept({session:siege},partyIdentity());sent=[];onlApi=async(path,opt)=>{sent.push(JSON.parse(JSON.stringify(opt.body)));return {session:{...siege,revision:9}}}");
  await g.run("partyWrite('capture','p2')");await g.run("partyWrite('supply','ally')");
  assert.deepEqual(g.json("sent.map(b=>[b.action,b.kind,b.target,b.seq,b.tick])"),[['command','capture','p2',3,6],['command','supply','ally',3,6]]);
  g.run("onlApi=async()=>{throw {error:'bad_session_command',msg:'x'}}");await g.run("partyWrite('capture','p9')");assert.equal(g.run('PARTY_CLIENT.pending'),null,'a malformed command is not retried forever');
});
const rescueSnapshot="var rescue={id:'rescue1234567',mode:'phlt',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,activity:'rescue',status:'active',revision:2,tick:7,next_seq:2,boss:{hp:80,max:100},objectives:{breaks:0,supports:0},actors:[{id:'me',name:'Tôi',hp:50,maxHp:100,mp:20,down:0,rescued:0,contribution:{damage:3,heal:0,prevented:0,control:0,rescue:1},connected:true},{id:'ally',name:'Bạn',hp:0,maxHp:100,mp:10,down:31,rescued:0,contribution:{damage:1,heal:0,prevented:0,control:0,rescue:0},connected:true},{id:'fine',name:'Ổn',hp:60,maxHp:100,mp:10,down:0,rescued:1,contribution:{damage:1,heal:0,prevented:0,control:0,rescue:0},connected:true}],events:[]}";
function phltReady(){const g=game();g.run("fixture('phlt',60);setFeatureFlags({party_combat:true,coop_rescue:true,party_lobby:true});onlSet({id:'me',token:'local-test-party-token'});partyRender=()=>{};PARTY_CLIENT.identity=partyIdentity()");return g;}
test('PHLT panel offers a rescue run, never the CTC activities, and shows rescue marks',()=>{
  const g=phltReady();assert.ok(g.run('!!partyIdentity()'),'PHLT characters can use the session panel when the features are on');
  const idle=g.run('partyPanelHTML()');
  assert.match(idle,/Giải cứu PHLT/);assert.match(idle,/data-party="rescueStart"/);assert.doesNotMatch(idle,/data-party="(create|dungeon|siege)"/);assert.match(idle,/điểm cứu viện/);
  g.run(rescueSnapshot+";partyAccept({session:rescue},partyIdentity())");
  const html=g.run('partyPanelHTML()');
  assert.match(html,/Giải cứu PHLT/);assert.match(html,/Đang ngã/);
  assert.equal((html.match(/data-party="rescue"/g)||[]).length,1,'only the downed ally can be rescued');assert.match(html,/data-party="rescue" data-target="ally"/);
  assert.doesNotMatch(html,/data-party="rescue" data-target="(me|fine)"/);assert.match(html,/cứu 1/);
  g.run("rescue.status='completed';rescue.revision=3;rescue.reward=null;partyAccept({session:rescue},partyIdentity())");
  const done=g.run('partyPanelHTML()');assert.doesNotMatch(done,/data-party="rescue"/);assert.match(done,/Nhận điểm cứu viện/);
  g.run("rescue.reward={amount:2,day:'2026-10-08'};rescue.revision=4;partyAccept({session:rescue},partyIdentity())");assert.match(g.run('partyPanelHTML()'),/2 điểm cứu viện/);
});
test('PHLT identity needs its flags; rescue commands and the start request are sent as built',async()=>{
  const g=phltReady();g.run("setFeatureFlags({party_combat:true})");assert.equal(g.run("featureEnabled('party_combat')"),false,'coop_rescue is also required for PHLT');
  g.run("setFeatureFlags({party_combat:true,coop_rescue:true,party_lobby:true});globalThis.crypto={randomUUID:()=>'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};PARTY_CLIENT.identity=partyIdentity();var sent=[];onlApi=async(path,opt)=>{sent.push(JSON.parse(JSON.stringify(opt.body)));return {session:{...rescue,revision:9}}}");
  g.run(rescueSnapshot+";partyAccept({session:{...rescue,id:'rescue1234567'}},partyIdentity())");
  await g.run("partyWrite('rescue','ally')");assert.deepEqual(g.json("sent[0]"),{action:'command',id:'rescue1234567',seq:2,tick:8,kind:'rescue',target:'ally'});
  g.run("partyReset();sent=[]");await g.run("partyWrite('rescueStart')");
  assert.equal(g.json('sent[0].action'),'create');assert.equal(g.json('sent[0].activity'),'rescue');
  g.run("setFeatureFlags({})");assert.equal(g.run("featureEnabled('party_combat')"),false,'closing the flags closes the panel');
});
