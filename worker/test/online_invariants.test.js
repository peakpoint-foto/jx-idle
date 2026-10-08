import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "./helpers/d1.js";
import { GAME } from "../gen/game.js";
import { sha256Hex } from "../src/http.js";
import { sync, recover, heartbeat } from "../src/account.js";
import { applyValidation } from "../src/ladder.js";
import { room, guild, duels } from "../src/social.js";

const week=()=>String(Math.floor(Date.now()/(7*864e5)));
const day=()=>new Date().toISOString().slice(0,10);
async function fixture(t,n=2) {
  const DB=await localD1();t.after(()=>DB.close());
  const env={DB},players=[];
  for(let i=0;i<n;i++) {
    const id="p"+i,token="valid-test-token-0123456789-"+i;
    const state=Object.assign(GAME.newSave(),{mode:"ctc",fac:"shaolin",lvl:60,attrPts:295,skPts:60,cid:"c_character_"+i});
    const now=Date.now();
    await DB.batch([
      DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at,play_sec,last_hb) VALUES(?1,?2,?3,?4,10000000,?4)").bind(id,await sha256Hex(token),"Player"+i,now),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,lvl,fac,updated_at,power,bracket,validation_status) VALUES(?1,?2,?3,60,'shaolin',?4,1000,'so','verified')").bind(id,state.cid,JSON.stringify(state),now)
    ]);
    players.push({id,state,request:()=>new Request("https://game.test/api/test",{method:"POST",headers:{authorization:"Bearer "+token}})});
  }
  return {env,DB,players};
}
const concurrent=jobs=>Promise.allSettled(jobs.map(fn=>fn()));
const successes=results=>results.filter(r=>r.status==="fulfilled");

test("SQLite: simultaneous CAS sync accepts one; force sync revisions increase uniquely",async t=>{
  const {env,DB,players:[p]}=await fixture(t,1);
  let results=await concurrent([1,2].map(()=>()=>sync(p.request(),env,{save:p.state,base_rev:1})));
  assert.equal(successes(results).length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.code,"sync_conflict");
  results=await concurrent([1,2,3].map(()=>()=>sync(p.request(),env,{save:p.state,force:true})));
  assert.deepEqual(successes(results).map(r=>r.value.sync_rev).sort((a,b)=>a-b),[3,4,5]);
  assert.equal((await DB.prepare("SELECT sync_rev FROM chars").first()).sync_rev,5);
});

test("SQLite: stale validation cannot overwrite power or flag a newer snapshot",async t=>{
  const {env,DB,players:[p]}=await fixture(t,1);
  await DB.prepare("UPDATE chars SET sync_rev=2,power=1234").run();
  await applyValidation(env,p.id,{...p.state,skPts:99999},1e7,1);
  assert.equal((await DB.prepare("SELECT power FROM chars").first()).power,1234);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM flags").first()).n,0);
  await Promise.all([applyValidation(env,p.id,{...p.state,skPts:99999},1e7,2),applyValidation(env,p.id,{...p.state,skPts:99999},1e7,2)]);
  const flags=await DB.prepare("SELECT code,COUNT(*) AS n FROM flags GROUP BY code").all();
  assert.ok(flags.results.length);assert.ok(flags.results.every(r=>r.n===1));
});

test("SQLite: legacy character linking cannot report two different successful identities",async t=>{
  const {env,DB,players:[p]}=await fixture(t,1);
  await DB.prepare("UPDATE chars SET character_id=NULL").run();
  const r=await concurrent(["c_identity_one","c_identity_two"].map(character_id=>()=>recover(p.request(),env,{character_id})));
  assert.equal(successes(r).length,1);assert.equal(r.find(x=>x.status==="rejected").reason.code,"character_mismatch");
});

test("SQLite: simultaneous heartbeat credits only elapsed time and bad tokens fail",async t=>{
  const {env,DB,players:[p]}=await fixture(t,1);
  await DB.prepare("UPDATE accounts SET play_sec=0,last_hb=?1").bind(Date.now()-60000).run();
  await Promise.all([heartbeat(p.request(),env),heartbeat(p.request(),env)]);
  const row=await DB.prepare("SELECT play_sec FROM accounts").first();assert.ok(row.play_sec>=60 && row.play_sec<62);
  await assert.rejects(()=>heartbeat(new Request("https://game.test"),env),{code:"no_token"});
});

test("SQLite: concurrent room joins stop at four; expired membership allows new room",async t=>{
  const {env,DB,players}=await fixture(t,6);
  const first=await room(players[0].request(),env,{action:"create"});
  const id=first.room.id;
  const r=await concurrent(players.slice(1).map(p=>()=>room(p.request(),env,{action:"join",room_id:id})));
  assert.equal(successes(r).length,3);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM room_members WHERE room_id=?1").bind(id).first()).n,4);
  await DB.prepare("UPDATE rooms SET expires_at=0 WHERE id=?1").bind(id).run();
  const next=await room(players[0].request(),env,{action:"create"});assert.notEqual(next.room.id,id);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM room_members WHERE account_id=?1").bind(players[0].id).first()).n,1);
});

test("SQLite: guild joins stop at thirty and free donation does not mutate XP",async t=>{
  const {env,DB,players}=await fixture(t,32);
  await guild(players[0].request(),env,{action:"create",name:"Test Guild"});
  const r=await concurrent(players.slice(1).map(p=>()=>guild(p.request(),env,{action:"join",name:"Test Guild"})));
  assert.equal(successes(r).length,29);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM guild_members").first()).n,30);
  await assert.rejects(()=>guild(players[0].request(),env,{action:"donate",amount:100}),{code:"donation_disabled"});
  assert.equal((await DB.prepare("SELECT xp FROM guilds").first()).xp,0);
});

test("SQLite: boss concurrent quota and receipt retry preserve damage once",async t=>{
  const {env,DB,players:[p]}=await fixture(t,1);
  await guild(p.request(),env,{action:"create",name:"Boss Guild"});
  const r=await concurrent([0,1,2,3,4,5].map(i=>()=>guild(p.request(),env,{action:"boss_attack",request_id:"attack_id_"+i})));
  assert.equal(successes(r).length,3);
  const row=await DB.prepare("SELECT attack_count,weekly_damage FROM guild_members").first();assert.equal(row.attack_count,3);
  const receipts=await DB.prepare("SELECT request_id,SUM(damage) OVER() AS total FROM boss_receipts").all();
  assert.equal(row.weekly_damage,receipts.results[0].total);
  const hp=(await DB.prepare("SELECT boss_hp FROM guilds").first()).boss_hp;
  assert.equal(1000000-hp,row.weekly_damage);
  await Promise.all([0,1,2].map(()=>guild(p.request(),env,{action:"boss_attack",request_id:receipts.results[0].request_id})));
  assert.equal((await DB.prepare("SELECT boss_hp FROM guilds").first()).boss_hp,hp);
  assert.equal((await DB.prepare("SELECT attack_count FROM guild_members").first()).attack_count,3);
});

test("SQLite: boss overkill clips useful damage and week/day reset is not repeated",async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  await guild(p.request(),env,{action:"create",name:"Reset Guild"});await guild(q.request(),env,{action:"join",name:"Reset Guild"});
  await DB.prepare("UPDATE guilds SET week='old',boss_hp=1,boss_max_hp=100").run();
  await DB.prepare("UPDATE guild_members SET attack_day='old',attack_count=3,weekly_damage=50").run();
  const r=await concurrent([p,q].map(player=>()=>guild(player.request(),env,{action:"boss_attack",request_id:"reset_attack_"+player.id})));
  assert.equal(successes(r).length,1);
  assert.equal((await DB.prepare("SELECT boss_hp FROM guilds").first()).boss_hp,0);
  assert.equal((await DB.prepare("SELECT SUM(weekly_damage) AS damage,SUM(attack_count) AS attacks FROM guild_members").first()).damage,100);
  await DB.prepare("UPDATE guilds SET boss_hp=10000").run();
  await DB.prepare("UPDATE guild_members SET attack_day='yesterday',attack_count=3").run();
  await guild(p.request(),env,{action:"boss_attack",request_id:"next_day_attack"});
  const member=await DB.prepare("SELECT attack_day,attack_count FROM guild_members WHERE account_id=?1").bind(p.id).first();
  assert.equal(member.attack_day,day());assert.equal(member.attack_count,1);
  assert.equal((await DB.prepare("SELECT week FROM guilds").first()).week,week());
});

test("SQLite: challenge pair and simultaneous accepts score once, resolving retry recovers",async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  const r=await concurrent([0,1].map(()=>()=>duels(p.request(),env,{action:"challenge",opponent:"Player1"})));
  assert.equal(successes(r).length,1);const id=successes(r)[0].value.duel.id;
  await Promise.all([0,1,2].map(()=>duels(q.request(),env,{action:"accept",id})));
  const score=await DB.prepare("SELECT SUM(points) AS points,SUM(wins) AS wins,SUM(losses) AS losses FROM duel_scores").first();
  assert.deepEqual({...score},{points:4,wins:1,losses:1});
  const second=await duels(p.request(),env,{action:"challenge",opponent:"Player1"});
  await DB.prepare("UPDATE duels SET status='resolving' WHERE id=?1").bind(second.duel.id).run();
  await Promise.all([0,1].map(()=>duels(q.request(),env,{action:"accept",id:second.duel.id})));
  assert.equal((await DB.prepare("SELECT SUM(points) AS points FROM duel_scores").first()).points,8);
});

test("SQLite: pending/flagged snapshots cannot duel or attack boss; expiry gives no points",async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  await guild(p.request(),env,{action:"create",name:"Verify Guild"});
  for(const status of ["pending_verification","flagged"]) {
    await DB.prepare("UPDATE chars SET validation_status=?1 WHERE account_id=?2").bind(status,p.id).run();
    await assert.rejects(()=>duels(p.request(),env,{action:"challenge",opponent:"Player1"}),{code:"ranked_locked"});
    await assert.rejects(()=>guild(p.request(),env,{action:"boss_attack"}),{code:"ranked_locked"});
  }
  await DB.prepare("UPDATE chars SET validation_status='verified'").run();
  const duel=await duels(p.request(),env,{action:"challenge",opponent:"Player1"});
  await DB.prepare("UPDATE duels SET expires_at=0").run();
  await duels(q.request(),env,{action:"accept",id:duel.duel.id});
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM duel_scores").first()).n,0);
});

test("SQLite: failed resolution stays retryable and batch failure leaves no partial reward",async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  const duel=await duels(p.request(),env,{action:"challenge",opponent:"Player1"});
  let fail=true;
  const unstable={DB:{prepare:DB.prepare.bind(DB),async batch(statements){
    if(fail){fail=false;throw new Error("simulated transport timeout")}
    return DB.batch(statements);
  }}};
  await assert.rejects(()=>duels(q.request(),unstable,{action:"accept",id:duel.duel.id}),/timeout/);
  assert.equal((await DB.prepare("SELECT status FROM duels WHERE id=?1").bind(duel.duel.id).first()).status,"resolving");
  await duels(q.request(),unstable,{action:"accept",id:duel.duel.id});
  assert.equal((await DB.prepare("SELECT SUM(points) AS points FROM duel_scores").first()).points,4);
  await assert.rejects(()=>DB.batch([
    DB.prepare("UPDATE duel_scores SET points=9999"),
    DB.prepare("INSERT INTO nonexistent_test_table VALUES(1)")
  ]));
  assert.equal((await DB.prepare("SELECT SUM(points) AS points FROM duel_scores").first()).points,4);
});
