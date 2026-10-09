import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {room} from '../src/social.js';
import {sessions} from '../src/sessions.js';
async function fixture(t,count=2){
  const DB=await localD1();t.after(()=>DB.close());const originalNow=Date.now;let now=Date.UTC(2026,9,8,12);Date.now=()=>now;t.after(()=>{Date.now=originalNow;});
  const env={DB,FEATURE_FLAGS:{party_lobby:true,party_combat:true}},players=[];
  for(let i=0;i<count;i++){
    const id='party'+i,token='local-party-token-0123456789-player'+i,state={...GAME.newSave(),cid:'c_party_character_'+i,mode:'ctc',fac:'shaolin',lvl:60,attrPts:295,skPts:58,main:10,sk:{10:1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id,await sha256Hex(token),'PartyPlayer'+i,now),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status) VALUES(?1,?2,?3,'shaolin',60,100,?4,'verified')").bind(id,state.cid,JSON.stringify(state),now)]);
    const req=(method='POST',path='sessions')=>new Request('https://game.test/api/'+path,{method,headers:{authorization:'Bearer '+token}});
    players.push({id,req,post:body=>sessions(req(),env,body),get:id=>sessions(req('GET','sessions'+(id?'?id='+id:'')),env),lobby:body=>room(req('POST','room'),env,body)});
  }
  const created=await players[0].lobby({action:'create'}),roomId=created.room.id;
  for(const p of players.slice(1))await p.lobby({action:'join',room_id:roomId});
  for(const p of players)await p.lobby({action:'ready',ready:true});
  const start=()=>players[0].post({action:'create'});
  const forceBoss=async(id,hp)=>{const r=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first(),s=JSON.parse(r.state);s.boss.hp=hp;s.boss.def=0;s.rng=1;for(const a of s.actors)a.cooldown=0;await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(id,JSON.stringify(s)).run();};
  return {DB,env,players,start,roomId,forceBoss,tick:ms=>{now+=ms;},now:()=>now};
}
test('two clients share authoritative tick/state; create retry, frozen stats and seeded persistence survive room/process reconnect',async t=>{
  const f=await fixture(t),[p,q]=f.players;
  const starts=await Promise.all([f.start(),f.start()]);assert.equal(starts[0].session.id,starts[1].session.id);const id=starts[0].session.id;
  f.tick(250);const views=await Promise.all([p.get(id),q.get(id)]);
  assert.equal(views[0].session.tick,1);assert.equal(views[1].session.tick,1);assert.deepEqual(views[0].session.boss,views[1].session.boss);assert.deepEqual(views[0].session.actors,views[1].session.actors);
  await f.DB.prepare("UPDATE chars SET power=999999 WHERE account_id='party0'").run();f.tick(250);const reconnect=await q.get();assert.equal(reconnect.session.id,id);assert.equal(reconnect.session.tick,2);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM combat_sessions').first()).n,1);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_members WHERE active=1').first()).n,2);
});
test('forged results/actions, late/future commands and seq replay cannot change seed, health or reward',async t=>{
  const f=await fixture(t),p=f.players[0],id=(await f.start()).session.id;
  await assert.rejects(()=>p.post({action:'claim',id,win:true,reward:999}),{code:'forged_session_action'});
  await assert.rejects(()=>p.post({action:'command',id,seq:1,tick:1,kind:'attack',damage:999999}),{code:'forged_session_action'});
  await assert.rejects(()=>p.post({action:'command',id,seq:1,tick:10000,kind:'guard'}),{code:'command_window'});
  const body={action:'command',id,seq:1,tick:1,kind:'guard'};
  const results=await Promise.all([p.post(body),p.post(body)]);assert.equal(results.length,2);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_actions').first()).n,1);
  await assert.rejects(()=>p.post({...body,kind:'support',target:'party1'}),{code:'command_seq_reused'});
  f.tick(5000);await p.get(id);await assert.rejects(()=>p.post({action:'command',id,seq:2,tick:0,kind:'guard'}),{code:'command_window'});
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_rewards').first()).n,0);
});
test('completion and simultaneous claims pay server merit once; contribution/caps are authoritative and no client inventory reward',async t=>{
  const f=await fixture(t),[p,q]=f.players,id=(await f.start()).session.id;
  await f.forceBoss(id,1);f.tick(250);const result=await p.get(id);assert.equal(result.session.status,'completed');
  const winner=result.session.actors.find(a=>a.contribution.damage>0),actor=f.players.find(p=>p.id===winner.id);
  const claims=await Promise.all([actor.post({action:'claim',id}),actor.post({action:'claim',id})]);assert.equal(claims[0].receipt.amount,1);assert.equal(claims[1].receipt.amount,1);
  assert.equal((await f.DB.prepare("SELECT SUM(delta) n FROM resource_ledger WHERE source='party_completion'").first()).n,1);
  const outsider=f.players.find(a=>a.id!==winner.id);await assert.rejects(()=>outsider.post({action:'claim',id}),{code:'session_reward_unavailable'});
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_members WHERE active=1').first()).n,0);
});
test('disconnect catches up in bounded ticks without retroactive reconnect auto attacks; leave/TTL/flag rollback release locks',async t=>{
  const f=await fixture(t,4),[p,q]=f.players,id=(await f.start()).session.id;
  f.tick(30000);const first=await p.get(id);assert.equal(first.session.tick,8);
  const m=await f.DB.prepare('SELECT connected_from FROM session_members WHERE session_id=?1 AND account_id=?2').bind(id,p.id).first();assert.equal(m.connected_from,f.now());
  const damage=first.session.actors.find(a=>a.id===p.id).contribution.damage;
  const second=await p.get(id);assert.equal(second.session.tick,16);assert.equal(second.session.actors.find(a=>a.id===p.id).contribution.damage,damage);
  await p.post({action:'leave',id});f.tick(250);const still=await q.get(id);assert.equal(still.session.status,'active');assert.equal(still.session.actors.find(a=>a.id===p.id).withdrawn,true);
  f.env.FEATURE_FLAGS={party_lobby:true};await assert.rejects(()=>q.get(id),{code:'feature_disabled'});
  assert.equal((await f.DB.prepare('SELECT status FROM combat_sessions WHERE id=?1').bind(id).first()).status,'aborted');
  f.env.FEATURE_FLAGS={party_lobby:true,party_combat:true};f.tick(301000);assert.equal((await q.get()).session,null);
});
test('CAS batch rollback leaves deterministic step/actions retryable; model/mode/ready/outsider guards deny operation',async t=>{
  const f=await fixture(t),[p,q]=f.players;
  await q.lobby({action:'ready',ready:false});await assert.rejects(()=>f.start(),{code:'session_not_ready'});await q.lobby({action:'ready',ready:true});
  const id=(await f.start()).session.id;await p.post({action:'command',id,seq:1,tick:1,kind:'guard'});
  const before=(await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first()).state;
  await f.DB.prepare("CREATE TRIGGER fail_party_update BEFORE UPDATE OF state ON combat_sessions BEGIN SELECT RAISE(ABORT,'test rollback'); END").run();f.tick(250);await assert.rejects(()=>p.get(id));
  assert.equal((await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first()).state,before);assert.equal((await f.DB.prepare('SELECT applied FROM session_actions').first()).applied,0);
  await f.DB.prepare('DROP TRIGGER fail_party_update').run();assert.equal((await p.get(id)).session.tick,1);assert.equal((await f.DB.prepare('SELECT applied FROM session_actions').first()).applied,1);
  await f.DB.prepare("UPDATE chars SET snapshot=?1 WHERE account_id='party1'").bind(JSON.stringify({mode:'phlt'})).run();await assert.rejects(()=>q.get(id),{code:'session_mode_denied'});
  const s=JSON.parse((await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first()).state);s.model='future';await f.DB.prepare('UPDATE combat_sessions SET state=?2 WHERE id=?1').bind(id,JSON.stringify(s)).run();f.tick(250);await assert.rejects(()=>p.get(id),{code:'session_model_changed'});
});
test('create receipt survives terminal state and expiry releases all roster locks before a new session',async t=>{
  const f=await fixture(t),[p,q]=f.players,key='retryable_create_0123456';
  const first=await p.post({action:'create',id:key});await f.forceBoss(first.session.id,1);f.tick(250);assert.equal((await p.get(key)).session.status,'completed');
  const retried=await p.post({action:'create',id:key});assert.equal(retried.session.id,key);assert.equal(retried.session.status,'completed');
  await assert.rejects(()=>q.post({action:'create',id:key}),{code:'session_leader_required'});
  const second=await f.start();f.tick(301000);await p.get(second.session.id);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_members WHERE active=1').first()).n,0);
  await p.lobby({action:'heartbeat'});await q.lobby({action:'heartbeat'});await p.lobby({action:'ready',ready:true});await q.lobby({action:'ready',ready:true});const third=await f.start();assert.notEqual(third.session.id,second.session.id);
});
test('dungeon is default-off, binds create retry to activity and breaks formations through server actions',async t=>{
  const f=await fixture(t),[p,q]=f.players,key='dungeon_create_receipt_012';
  await assert.rejects(()=>p.post({action:'create',id:key,activity:'dungeon'}),{code:'feature_disabled'});
  f.env.FEATURE_FLAGS.party_dungeon=true;
  const created=await p.post({action:'create',id:key,activity:'dungeon'}),id=created.session.id;
  assert.equal(created.session.activity,'dungeon');assert.deepEqual(created.session.objectives,{breaks:0,supports:0});
  const lateId='late_dungeon_player',lateToken='local-late-dungeon-token-012345';
  const lateSave={...GAME.newSave(),cid:'c_late_dungeon_player',mode:'ctc',fac:'emei',lvl:60};
  await f.DB.batch([f.DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(lateId,await sha256Hex(lateToken),'LatePlayer',f.now()),
    f.DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status) VALUES(?1,?2,?3,'emei',60,100,?4,'verified')").bind(lateId,lateSave.cid,JSON.stringify(lateSave),f.now())]);
  const lateRequest=new Request('https://game.test/api/sessions?id='+id,{headers:{authorization:'Bearer '+lateToken}});
  await assert.rejects(()=>sessions(lateRequest,f.env,undefined,new URL(lateRequest.url)),{code:'session_not_found'},'non-roster account cannot join an active dungeon');
  await p.lobby({action:'leave',room_id:f.roomId});
  assert.equal((await q.get(id)).session.status,'active','session survives its former lobby leader leaving');
  await assert.rejects(()=>p.post({action:'create',id:key}),{code:'session_activity_conflict'});
  const row=await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first(),state=JSON.parse(row.state);
  state.boss.hp=state.boss.max*.65;for(const a of state.actors)a.cooldown=10;
  await f.DB.prepare('UPDATE combat_sessions SET state=?2 WHERE id=?1').bind(id,JSON.stringify(state)).run();
  f.tick(250);assert.equal((await p.get(id)).session.boss.ward,1);
  const snap=(await p.get(id)).session.tick;
  await p.post({action:'command',id,seq:1,tick:snap+1,kind:'guard'});
  await q.post({action:'command',id,seq:1,tick:snap+1,kind:'guard'});
  f.tick(250);const broken=(await p.get(id)).session;
  assert.equal(broken.boss.ward,0);assert.equal(broken.objectives.breaks,1);
  assert.equal(broken.actors.filter(a=>a.contribution.control>0).length,2);
  assert.ok(broken.events.some(e=>e.reason==='dungeon_formation_broken'));
  f.env.FEATURE_FLAGS.party_dungeon=false;
  assert.equal((await q.get(id)).session.status,'aborted');
  assert.equal((await f.DB.prepare('SELECT status FROM combat_sessions WHERE id=?1').bind(id).first()).status,'aborted');
  f.env.FEATURE_FLAGS.party_dungeon=true;
  await p.lobby({action:'join',room_id:f.roomId});await p.lobby({action:'ready',ready:true});
  await q.lobby({action:'ready',ready:true});
  const retry=(await q.post({action:'create',id:'dungeon_wipe_retry_0123',activity:'dungeon'})).session;
  const retryRow=await f.DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(retry.id).first(),retryState=JSON.parse(retryRow.state);
  for(const a of retryState.actors)a.hp=0;
  await f.DB.prepare('UPDATE combat_sessions SET state=?2 WHERE id=?1').bind(retry.id,JSON.stringify(retryState)).run();
  f.tick(250);assert.equal((await q.get(retry.id)).session.status,'aborted','wipe ends without a reward');
  const next=(await q.post({action:'create',id:'dungeon_after_wipe_0123',activity:'dungeon'})).session;
  assert.notEqual(next.id,retry.id);assert.equal(next.status,'active','ready party can retry after wipe');
});
test('siege mode is default-off and server capture victory pays the existing merit receipt once',async t=>{
  const f=await fixture(t),[p,q]=f.players,key='siege_capture_receipt_01';
  await assert.rejects(()=>p.post({action:'create',id:key,activity:'siege'}),{code:'feature_disabled'});
  f.env.FEATURE_FLAGS.party_siege=true;
  const created=await p.post({action:'create',id:key,activity:'siege'}),id=created.session.id;assert.equal(created.session.activity,'siege');
  const bad={action:'command',id,seq:1,tick:1,kind:'capture',target:'boss'};
  await assert.rejects(()=>p.post(bad),{code:'bad_session_command'});
  const firstCapture={action:'command',id,seq:1,tick:1,kind:'capture',target:'point'};
  await Promise.all([p.post(firstCapture),p.post(firstCapture)]);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM session_actions WHERE session_id=?1 AND account_id=?2 AND seq=1').bind(id,p.id).first()).n,1);
  await q.post({action:'command',id,seq:1,tick:1,kind:'capture',target:'point'});
  f.tick(250);assert.equal((await p.get(id)).session.siege.point,50);
  f.tick(500);const ps=await p.get(id),qs=await q.get(id);
  await p.post({action:'command',id,seq:ps.session.next_seq,tick:ps.session.tick+1,kind:'capture',target:'point'});
  await q.post({action:'command',id,seq:qs.session.next_seq,tick:qs.session.tick+1,kind:'capture',target:'point'});
  f.tick(250);const result=await p.get(id);assert.equal(result.session.status,'completed');assert.equal(result.session.siege.point,100);
  const receipt=await p.post({action:'claim',id});assert.equal(receipt.receipt.amount,1);
  assert.equal((await p.post({action:'claim',id})).receipt.amount,1);
  assert.equal((await f.DB.prepare("SELECT SUM(delta) n FROM resource_ledger WHERE source='party_completion'").first()).n,1);
  const rollback=(await p.post({action:'create',id:'siege_rollback_receipt_01',activity:'siege'})).session;
  f.env.FEATURE_FLAGS.party_siege=false;
  assert.equal((await q.get(rollback.id)).session.status,'aborted');
  await assert.rejects(()=>p.post({action:'claim',id:rollback.id}),{code:'session_reward_unavailable'});
});
