import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {sha256Hex} from '../src/http.js';
import {room} from '../src/social.js';
import {friends} from '../src/lobby.js';
import worker from '../src/index.js';
async function fixture(t,n=6){
  const DB=await localD1();t.after(()=>DB.close());const env={DB,FEATURE_FLAGS:{party_lobby:true}},players=[];
  for(let i=0;i<n;i++){
    const id='p'+i,token='lobby-local-test-token-0123456789-'+i,now=Date.now();
    await DB.batch([
      DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,last_hb) VALUES(?1,?2,?3,?4,?4)').bind(id,await sha256Hex(token),'Player'+i,now),
      DB.prepare("INSERT INTO chars(account_id,snapshot,lvl,fac,updated_at,power) VALUES(?1,?2,60,'shaolin',?3,100)").bind(id,JSON.stringify({v:2,mode:'ctc',fac:'shaolin',lvl:60}),now)
    ]);
    players.push({id,req:(method='POST',path='room',body)=>new Request('https://game.test/api/'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(method==='POST'&&body?{body:JSON.stringify(body)}:{})})});
  }
  return {DB,env,players};
}
const act=(p,env,action,params={})=>room(p.req(),env,{action,...params});
const f=(p,env,action,target)=>friends(p.req(),env,{action,target_id:target.id});
const read=(p,env)=>room(p.req('GET'),env);
async function befriend(p,q,env){await f(p,env,'request',q);await f(q,env,'accept',p);}

test('lobby: friends recipient permissions, expiry, mutual accept, presence and cross-mode/flag API guards',async t=>{
  const {DB,env,players:[p,q,r]}=await fixture(t);
  await assert.rejects(()=>f(p,env,'request',p),{code:'self_friend'});
  await f(p,env,'request',q);
  await assert.rejects(()=>f(p,env,'accept',q),{code:'friend_unavailable'});
  await assert.rejects(()=>f(q,env,'request',p),{code:'friend_pending'});
  await Promise.all([f(q,env,'accept',p),f(q,env,'accept',p)]);
  assert.equal((await friends(p.req('GET'),env)).friends[0].online,true);
  await DB.prepare('UPDATE accounts SET last_hb=0 WHERE id=?1').bind(q.id).run();
  assert.equal((await friends(p.req('GET'),env)).friends[0].online,false);
  await f(p,env,'request',r);await DB.prepare("UPDATE friendships SET expires_at=0 WHERE status='pending'").run();
  await assert.rejects(()=>f(r,env,'accept',p),{code:'friend_unavailable'});
  await f(p,env,'remove',q);assert.equal((await friends(q.req('GET'),env)).friends.length,0);
  await DB.prepare('UPDATE chars SET snapshot=?1 WHERE account_id=?2').bind(JSON.stringify({mode:'phlt'}),r.id).run();
  await assert.rejects(()=>f(p,env,'request',r),{code:'different_mode'});
  for(const [who,flags,path] of [[r,env.FEATURE_FLAGS,'room'],[p,{},'friends']]){
    const response=await worker.fetch(who.req('GET',path),{DB,FEATURE_FLAGS:flags},{});
    assert.equal(response.status,403);assert.equal((await response.json()).error,'feature_disabled');
  }
});

test('lobby: concurrent joins cap four, failed join does not reset ready, roles/objective/transfer are guarded',async t=>{
  const {DB,env,players}=await fixture(t);
  const p=players[0],created=await act(p,env,'create'),id=created.room.id;
  const results=await Promise.allSettled(players.slice(1).map(q=>act(q,env,'join',{room_id:id})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  const data=await read(p,env);assert.equal(data.room.members.length,4);assert.equal(data.room.lobby_only,true);
  const member=players.find(q=>q.id!==p.id&&data.room.members.some(m=>m.account_id===q.id));
  await assert.rejects(()=>act(member,env,'objective',{objective:'boss'}),{code:'leader_only'});
  await assert.rejects(()=>act(p,env,'objective',{objective:'hack'}),{code:'bad_objective'});
  await act(member,env,'role',{role:'control'});
  for(const m of data.room.members)await act(players.find(q=>q.id===m.account_id),env,'ready',{ready:true});
  assert.equal((await read(p,env)).room.all_ready,true);
  const outsider=players.find(q=>!data.room.members.some(m=>m.account_id===q.id));
  await assert.rejects(()=>act(outsider,env,'join',{room_id:id}),{code:'room_full'});
  assert.equal((await read(p,env)).room.all_ready,true);
  await act(p,env,'objective',{objective:'boss'});
  assert.ok((await read(p,env)).room.members.every(m=>!m.ready));
  await act(p,env,'transfer',{target_id:member.id});
  assert.equal((await read(p,env)).room.owner_id,member.id);
  await assert.rejects(()=>act(p,env,'kick',{target_id:member.id}),{code:'leader_only'});
  await act(member,env,'kick',{target_id:p.id});
  assert.equal((await read(p,env)).room,null);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM room_members').first()).n,3);
});

test('lobby: invite only recipient, valid relation/member, TTL and concurrent retry; replay after leaving fails',async t=>{
  const {DB,env,players:[p,q,r,s]}=await fixture(t);
  const created=await act(p,env,'create'),id=created.room.id;
  await assert.rejects(()=>act(p,env,'invite',{name:'Player1'}),{code:'invite_unavailable'});
  await befriend(p,q,env);await act(p,env,'invite',{name:'Player1'});
  const invite=(await friends(q.req('GET'),env)).invites[0];
  await assert.rejects(()=>act(r,env,'invite_accept',{invite_id:invite.id}),{code:'invite_forbidden'});
  const results=await Promise.allSettled([act(q,env,'invite_accept',{invite_id:invite.id}),act(q,env,'invite_accept',{invite_id:invite.id})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
  assert.equal((await read(q,env)).room.id,id);
  assert.equal((await DB.prepare('SELECT status FROM room_invites WHERE id=?1').bind(invite.id).first()).status,'accepted');
  await act(q,env,'leave');
  await assert.rejects(()=>act(q,env,'invite_accept',{invite_id:invite.id}),{code:'invite_expired'});
  await befriend(p,r,env);await act(p,env,'invite',{name:'Player2'});
  const old=(await friends(r.req('GET'),env)).invites[0];await DB.prepare('UPDATE room_invites SET expires_at=0 WHERE id=?1').bind(old.id).run();
  await assert.rejects(()=>act(r,env,'invite_accept',{invite_id:old.id}),{code:'invite_expired'});
  await befriend(p,s,env);await act(p,env,'invite',{name:'Player3'});const left=(await friends(s.req('GET'),env)).invites[0];
  await act(p,env,'leave');await assert.rejects(()=>act(s,env,'invite_accept',{invite_id:left.id}),{code:'room_full'});
});

test('lobby: stale leader transfers, reconnect resets ready, concurrent leave closes room, expiry releases account',async t=>{
  const {DB,env,players:[p,q]}=await fixture(t);
  const created=await act(p,env,'create'),id=created.room.id;await act(q,env,'join',{room_id:id});
  await act(p,env,'ready',{ready:true});await act(q,env,'ready',{ready:true});
  await DB.prepare('UPDATE room_members SET last_seen=0 WHERE account_id=?1').bind(p.id).run();
  let data=await read(q,env);
  assert.equal(data.room.owner_id,q.id);assert.equal(data.room.members.find(m=>m.account_id===p.id).online,false);assert.equal(data.room.all_ready,false);
  await act(p,env,'heartbeat');
  data=await read(p,env);assert.equal(data.room.members.find(m=>m.account_id===p.id).online,true);
  assert.equal(data.room.members.find(m=>m.account_id===p.id).ready,false);assert.equal(data.room.owner_id,q.id);
  await Promise.all([act(p,env,'leave'),act(q,env,'leave')]);
  assert.equal((await DB.prepare('SELECT status FROM rooms WHERE id=?1').bind(id).first()).status,'closed');
  const next=await act(p,env,'create');await DB.prepare('UPDATE rooms SET expires_at=0 WHERE id=?1').bind(next.room.id).run();
  assert.equal((await read(p,env)).room,null);
  const again=await act(p,env,'create');assert.notEqual(again.room.id,next.room.id);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM room_members WHERE account_id=?1').bind(p.id).first()).n,1);
});
