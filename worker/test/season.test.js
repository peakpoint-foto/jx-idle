import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {season,recordGuildSiegeTask} from '../src/season.js';
import worker from '../src/index.js';

async function setup(t){
  const DB=await localD1();t.after(()=>DB.close());const old=Date.now;let now=Date.UTC(2026,9,9,12);Date.now=()=>now;t.after(()=>{Date.now=old});
  const current=Math.floor(now/(7*864e5)),prev=String(current-1),players=[];
  for(const [id,fac,points,wins] of [['season1','shaolin',100,10],['season2','shaolin',100,10],['season3','tianren',500,20]]){
    const token='local-season-token-'+id,save={...GAME.newSave(),cid:'c_'+id,mode:'ctc',fac,lvl:80};
    await DB.batch([
      DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,1000000)').bind(id,await sha256Hex(token),id,now),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,bracket,updated_at,validation_status) VALUES(?1,?2,?3,?4,80,100,'so',?5,'verified')").bind(id,save.cid,JSON.stringify(save),fac,now),
      DB.prepare('INSERT INTO duel_scores(account_id,season,points,wins,losses) VALUES(?1,?2,?3,?4,0)').bind(id,prev,points,wins),
      DB.prepare('INSERT INTO duel_scores(account_id,season,points,wins,losses) VALUES(?1,?2,?3,?4,0)').bind(id,String(current),points,wins),
    ]);
    const req=(method='GET',path='/api/season')=>new Request('https://game.test'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'}});
    players.push({id,token,req,call:(method='GET',body,path='/api/season')=>season(req(method,path),{DB},body,new URL('https://game.test'+path))});
  }
  return {DB,get now(){return now},current,prev,players,advance:ms=>{now+=ms;Date.now=()=>now}};
}
test('season leaderboard ties are scoped to validated CTC faction/bracket and previous title claim is idempotent',async t=>{
  const f=await setup(t),[a,b,c]=f.players;
  const data=await a.call();assert.equal(data.current_season,String(f.current));assert.equal(data.rows.length,2,JSON.stringify({data,season:f.prev,fac:(await f.DB.prepare('SELECT fac,bracket,updated_at,validation_status,snapshot FROM chars WHERE account_id=?1').bind(a.id).first())}));
  assert.deepEqual(data.rows.map(x=>x.rank),[1,1]);assert.equal(data.mine.rank,1);
  const claim=await a.call('POST',{action:'claim_title',season:f.prev});assert.equal(claim.receipt.title,'Chiến Tướng');assert.equal(claim.rank,1);
  const retry=await a.call('POST',{action:'claim_title',season:f.prev});assert.deepEqual(retry.receipt,claim.receipt);
  await b.call('POST',{action:'claim_title',season:f.prev});
  await assert.rejects(()=>a.call('POST',{action:'claim_title',season:String(f.current)}),{code:'season_not_closed'});
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM season_titles WHERE season=?1').bind(f.prev).first()).n,2);
  await f.DB.prepare("UPDATE chars SET snapshot=?1 WHERE account_id='season1'").bind(JSON.stringify({...GAME.newSave(),mode:'g2',sandbox:false})).run();
  await assert.rejects(()=>a.call(),{code:'season_locked'});
});
test('guild weekly siege task uses server receipts, deduplicates sessions and caps each player',async t=>{
  const f=await setup(t),[a]=f.players;
  await f.DB.batch([
    f.DB.prepare("INSERT INTO guilds(id,name,owner_id,week,created_at,updated_at) VALUES('season-guild','Season guild',?1,?2,?3,?3)").bind(a.id,String(f.current),f.now),
    f.DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES('season-guild',?1,'owner',?2,?2)").bind(a.id,f.now),
  ]);
  const run={activity:'siege',status:'completed',actors:[{id:a.id,contribution:{objective:100}}]};
  await recordGuildSiegeTask(f.DB,'siege-session-01',a.id,run,f.now);
  await recordGuildSiegeTask(f.DB,'siege-session-01',a.id,run,f.now);
  for(let n=2;n<=8;n++)await recordGuildSiegeTask(f.DB,'siege-session-'+String(n).padStart(2,'0'),a.id,run,f.now);
  const row=await f.DB.prepare('SELECT points FROM guild_weekly_task_members WHERE guild_id=?1 AND week=?2 AND account_id=?3').bind('season-guild',String(f.current),a.id).first();
  assert.equal(row.points,50);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM guild_weekly_task_receipts WHERE account_id=?1').bind(a.id).first()).n,8);
  const view=await a.call();assert.deepEqual(view.guild_task,{guild_id:'season-guild',guild_name:'Season guild',id:'frontier',week:String(f.current),target:250,progress:50,personal:50,personal_cap:50,source:'verified_party_siege_receipt'});
});
test('season routes require the stored CTC capability and reject g2/disabled access',async t=>{
  const f=await setup(t),[a]=f.players,token=a.token,request=()=>new Request('https://game.test/api/season',{headers:{authorization:'Bearer '+token}});
  let response=await worker.fetch(request(),{DB:f.DB,FEATURE_FLAGS:{seasonal_challenge:false}},{});
  assert.equal(response.status,403);
  response=await worker.fetch(request(),{DB:f.DB,FEATURE_FLAGS:{seasonal_challenge:true}},{});
  assert.equal(response.status,200);
  const save={...GAME.newSave(),cid:'c_season1',mode:'g2',fac:'shaolin',lvl:80};
  await f.DB.prepare('UPDATE chars SET snapshot=?1 WHERE account_id=?2').bind(JSON.stringify(save),a.id).run();
  response=await worker.fetch(request(),{DB:f.DB,FEATURE_FLAGS:{seasonal_challenge:true}},{});
  assert.equal(response.status,403);
});
test('season cutoff changes at the UTC week boundary and only the closed week can pay its fixed title',async t=>{
  const f=await setup(t),[a]=f.players,first=await a.call();
  assert.equal(first.start,f.current*7*864e5);assert.equal(first.end,(f.current+1)*7*864e5);
  f.advance(first.end-f.now);
  const next=await a.call();assert.equal(next.current_season,String(f.current+1));assert.equal(next.start,first.end);
  const reward=await a.call('POST',{action:'claim_title',season:String(f.current)});
  assert.equal(reward.receipt.title,'Chiến Tướng');
  await assert.rejects(()=>a.call('POST',{action:'claim_title',season:String(f.current-1)}),{code:'season_not_closed'});
});
