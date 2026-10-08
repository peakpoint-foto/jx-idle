import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {sha256Hex} from '../src/http.js';
import {moderation,adminModeration} from '../src/moderation.js';
import {friends} from '../src/lobby.js';
import {room} from '../src/social.js';
import {chat} from '../src/chat.js';

async function fixture(t){
  const DB=await localD1();t.after(()=>DB.close());const env={DB,ADMIN_KEY:'moderation-local-test-secret-012345',FEATURE_FLAGS:{party_lobby:true,guild_online:true}};
  for(const [id,name] of [['reporter','Reporter'],['target','Target']]){
    const token='moderation-local-test-token-0123456789-'+id;
    await DB.batch([
      DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,last_hb) VALUES(?1,?2,?3,?4,?4)').bind(id,await sha256Hex(token),name,Date.now()),
      DB.prepare('INSERT INTO chars(account_id,snapshot,lvl,fac,updated_at,power) VALUES(?1,?2,60,\'shaolin\',?3,100)').bind(id,JSON.stringify({v:2,mode:'ctc',fac:'shaolin',lvl:60}),Date.now())
    ]);
  }
  const req=(id,method='POST',adminKey)=>new Request('https://game.test/api/moderation',{method,headers:{authorization:'Bearer moderation-local-test-token-0123456789-'+id,'content-type':'application/json',...(adminKey?{'x-admin-key':adminKey}:{})}});
  return {DB,env,req};
}

test('moderation: bounded report, duplicate collapse, block removes friend access and admin action is audited',async t=>{
  const {DB,env,req}=await fixture(t);
  await friends(req('target'),env,{action:'request',target_id:'reporter'});
  await friends(req('reporter'),env,{action:'accept',target_id:'target'});
  await room(req('target'),env,{action:'create'});
  await room(req('target'),env,{action:'invite',name:'Reporter'});
  await moderation(req('reporter'),env,{action:'mute',target_id:'target',duration_ms:3600e3});
  assert.equal((await friends(req('reporter','GET'),env)).friends.length,1,'mute preserves accepted friendship');
  assert.equal((await friends(req('reporter','GET'),env)).invites.length,0,'muted invite hidden');
  const invite=await DB.prepare('SELECT id FROM room_invites WHERE recipient_id=?1').bind('reporter').first();
  await assert.rejects(()=>room(req('reporter'),env,{action:'invite_accept',invite_id:invite.id}),{code:'player_muted'});
  assert.equal((await moderation(req('reporter','GET'),env)).mutes.length,1);
  await DB.prepare('UPDATE player_mutes SET expires_at=0 WHERE muter_id=?1').bind('reporter').run();
  assert.equal((await friends(req('reporter','GET'),env)).friends.length,1,'expired mute no longer hides requests');
  await moderation(req('reporter'),env,{action:'unmute',target_id:'target'});
  await room(req('reporter'),env,{action:'invite_accept',invite_id:invite.id});
  const roomId=(await DB.prepare('SELECT room_id FROM room_members WHERE account_id=?1').bind('reporter').first()).room_id;
  await DB.batch([
    DB.prepare("INSERT INTO guilds(id,name,owner_id,week,created_at,updated_at) VALUES('guild01','Test guild','target','w1',?1,?1)").bind(Date.now()),
    DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES('guild01','reporter','member',?1,?1)").bind(Date.now()),
    DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES('guild01','target','owner',?1,?1)").bind(Date.now()),
  ]);
  await moderation(req('reporter'),env,{action:'mute',target_id:'target',duration_ms:864e5});
  await chat(req('target'),env,{room_id:roomId,client_id:'message-target-01',text:'hello <b>room</b>'});
  assert.equal((await chat(req('reporter','GET'),env,null,new URL('https://game.test/api/chat?room_id='+roomId))).messages.length,0,'mute hides room chat');
  await chat(req('target'),env,{scope:'guild',guild_id:'guild01',client_id:'guild-message-01',text:'guild content'});
  assert.equal((await chat(req('reporter','GET'),env,null,new URL('https://game.test/api/chat?scope=guild&guild_id=guild01'))).messages.length,0,'mute hides guild chat');
  const own=await chat(req('target','GET'),env,null,new URL('https://game.test/api/chat?room_id='+roomId));
  assert.equal(own.messages[0].body,'hello <b>room</b>','chat body remains plain text data');
  const sent=await chat(req('reporter'),env,{room_id:roomId,client_id:'message-report-01',text:'<img src=x onerror=alert(1)>'});
  assert.equal((await chat(req('reporter'),env,{room_id:roomId,client_id:'message-report-01',text:'<img src=x onerror=alert(1)>'})).duplicate,true);
  assert.equal((await chat(req('target','GET'),env,null,new URL('https://game.test/api/chat?room_id='+roomId))).messages.at(-1).body,'<img src=x onerror=alert(1)>');
  const report={action:'report',target_id:'target',reason:'spam',details:'repeat message'};
  const first=await moderation(req('reporter'),env,report),again=await moderation(req('reporter'),env,report);
  assert.equal(first.report_id,again.report_id);assert.equal(again.duplicate,true);
  await moderation(req('reporter'),env,{action:'block',target_id:'target'});
  await chat(req('target'),env,{room_id:roomId,client_id:'message-after-block',text:'blocked from reporter'});
  const blockedRoom=await chat(req('reporter','GET'),env,null,new URL('https://game.test/api/chat?room_id='+roomId));
  assert.ok(blockedRoom.messages.every(x=>x.sender_id!=='target'),'block filters room chat for blocker');
  await chat(req('target'),env,{scope:'guild',guild_id:'guild01',client_id:'guild-after-block',text:'blocked from reporter'});
  const blockedGuild=await chat(req('reporter','GET'),env,null,new URL('https://game.test/api/chat?scope=guild&guild_id=guild01'));
  assert.ok(blockedGuild.messages.every(x=>x.sender_id!=='target'),'block filters guild chat for blocker');
  assert.deepEqual((await moderation(req('reporter','GET'),env)).blocks.map(x=>x.target_id),['target']);
  await assert.rejects(()=>friends(req('reporter'),env,{action:'request',target_id:'target'}),{code:'player_blocked'});
  const adminReq=req('reporter','GET',env.ADMIN_KEY),rows=await adminModeration(adminReq,env,null,new URL('https://game.test/api/admin/moderation'));
  assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].details,'repeat message');
  await adminModeration(req('reporter','POST',env.ADMIN_KEY),env,{report_id:first.report_id,status:'closed'},new URL('https://game.test/api/admin/moderation'));
  assert.equal((await DB.prepare('SELECT action FROM admin_audit').first()).action,'report_closed');
  for(let n=0;n<4;n++){
    const next=await moderation(req('reporter'),env,{...report,reason:'other',details:'report '+n});
    await adminModeration(req('reporter','POST',env.ADMIN_KEY),env,{report_id:next.report_id,status:'closed'},new URL('https://game.test/api/admin/moderation'));
  }
  await assert.rejects(()=>moderation(req('reporter'),env,{...report,reason:'other'}),{code:'report_limit'});
  await assert.rejects(()=>adminModeration(req('reporter','GET','wrong'),env,null,new URL('https://game.test/api/admin/moderation')),{code:'forbidden'});
});
