import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {guild} from '../src/social.js';
import {economy} from '../src/economy.js';
async function fixture(t){
  const DB=await localD1();t.after(()=>DB.close());const env={DB,FEATURE_FLAGS:{online_economy:true}},token='valid-economy-local-token-0123456789';
  const state={...GAME.newSave(),mode:'ctc',fac:'shaolin',lvl:60};
  await DB.batch([DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at) VALUES('p',?1,'Player',?2)").bind(await sha256Hex(token),Date.now()),
    DB.prepare("INSERT INTO chars(account_id,snapshot,fac,lvl,power,updated_at,validation_status) VALUES('p',?1,'shaolin',60,100,?2,'verified')").bind(JSON.stringify(state),Date.now())]);
  const req=(method='POST')=>new Request('https://game.test/api/economy',{method,headers:{authorization:'Bearer '+token}});
  const g=(await guild(req(),env,{action:'create',name:'Ledger Guild'})).guild.id;
  return {DB,env,req,g,post:body=>economy(req(),env,body),get:()=>economy(req('GET'),env),attack:id=>guild(req(),env,{action:'boss_attack',request_id:id})};
}
test('server ledger earns only from real daily boss receipts, ignores client gold/delta and duplicate collect is idempotent',async t=>{
  const f=await fixture(t);assert.equal((await f.post({action:'collect',amount:1e12,gold:1e12,delta:999})).balance,0);
  for(let i=0;i<3;i++)await f.attack('boss_credit_'+i);
  await Promise.all([f.post({action:'collect'}),f.post({action:'collect'})]);const view=await f.get();assert.equal(view.balance,3);assert.equal(view.earned_today,3);assert.equal(view.entries.length,3);
  await assert.rejects(()=>f.attack('boss_credit_four'),{code:'boss_daily_limit'});
  await f.attack('boss_credit_0');await f.post({action:'collect'});assert.equal((await f.get()).balance,3);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM resource_ledger').first()).n,3);
  f.env.FEATURE_FLAGS={online_economy:true,guild_management:true};
  await guild(f.req(),f.env,{action:'leave',request_id:'leave_before_reset'});
  await guild(f.req(),f.env,{action:'create',name:'New Ledger Guild'});
  await assert.rejects(()=>f.attack('reset_guild_attack'),{code:'boss_daily_limit'});
  const current=await guild(f.req('GET'),f.env);assert.equal(current.guild.attack_count,3);
});
test('concurrent donation cannot underflow or exceed daily cap; receipt updates guild once and is payload bound',async t=>{
  const f=await fixture(t);for(let i=0;i<3;i++)await f.attack('boss_donate_'+i);await f.post({action:'collect'});
  const body={action:'donate',guild_id:f.g,amount:2,request_id:'donate_once_1'};
  await Promise.all([f.post(body),f.post(body)]);assert.equal((await f.get()).balance,1);
  assert.equal((await f.DB.prepare('SELECT xp FROM guilds WHERE id=?1').bind(f.g).first()).xp,200);
  await assert.rejects(()=>f.post({...body,amount:1}),{code:'request_id_reused'});
  const settled=await Promise.allSettled([f.post({...body,amount:1,request_id:'donate_race_1'}),f.post({...body,amount:1,request_id:'donate_race_2'})]);assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await f.get()).balance,0);assert.equal((await f.get()).donated_today,3);assert.equal((await f.DB.prepare('SELECT xp FROM guilds WHERE id=?1').bind(f.g).first()).xp,300);
  await assert.rejects(()=>f.post({...body,amount:-1,request_id:'negative_amount'}),{code:'bad_economy_request'});
  await assert.rejects(()=>f.post({...body,amount:1,request_id:'no_balance_1'}),{code:'economy_unavailable'});
});
test('mode/flags/verification/guild guards and day rollover preserve wallet, old sources cannot mint twice',async t=>{
  const f=await fixture(t);await f.attack('boss_rollover_1');await f.post({action:'collect'});
  await f.DB.prepare("UPDATE boss_receipts SET day='2000-01-01'").run();await f.DB.prepare("UPDATE resource_ledger SET day='2000-01-01'").run();
  assert.equal((await f.get()).earned_today,0);await f.post({action:'collect'});assert.equal((await f.get()).balance,1);
  await assert.rejects(()=>f.post({action:'donate',guild_id:'foreign',amount:1,request_id:'foreign_guild_1'}),{code:'economy_unavailable'});
  f.env.FEATURE_FLAGS={};await assert.rejects(()=>f.get(),{code:'feature_disabled'});f.env.FEATURE_FLAGS={online_economy:true};
  await f.DB.prepare("UPDATE chars SET validation_status='flagged'").run();await assert.rejects(()=>f.get(),{code:'economy_locked'});
  await f.DB.prepare("UPDATE chars SET validation_status='verified',snapshot=?1").bind(JSON.stringify({mode:'g2'})).run();await assert.rejects(()=>f.get(),{code:'feature_disabled'});
  assert.equal((await f.DB.prepare('SELECT SUM(delta) balance FROM resource_ledger').first()).balance,1);
});
test('wallet cap and transactional failure preserve source/receipt/balance/guild XP on rollback',async t=>{
  const f=await fixture(t);await f.attack('boss_rollback_1');await f.post({action:'collect'});
  await f.DB.prepare("CREATE TRIGGER reject_ledger_update BEFORE UPDATE OF xp ON guilds BEGIN SELECT RAISE(ABORT,'test rollback'); END").run();
  await assert.rejects(()=>f.post({action:'donate',guild_id:f.g,amount:1,request_id:'rollback_receipt_1'}));
  assert.equal((await f.get()).balance,1);assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM resource_ledger WHERE source='guild_donation'").first()).n,0);
  await f.DB.prepare('DROP TRIGGER reject_ledger_update').run();
  await f.post({action:'donate',guild_id:f.g,amount:1,request_id:'rollback_receipt_1'});assert.equal((await f.get()).balance,0);
  await f.DB.prepare("INSERT INTO resource_ledger(account_id,mode,asset,request_id,source,delta,day,created_at) VALUES('p','ctc','merit','fixture_wallet','fixture',30,'2000-01-01',1)").run();
  await f.attack('boss_cap_2');await f.post({action:'collect'});assert.equal((await f.get()).balance,30);
});
