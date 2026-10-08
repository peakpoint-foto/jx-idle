import {assertAccountFeature} from './capabilities.js';
import {HttpError} from './http.js';
import {rateLimit} from './db.js';
const day=()=>new Date().toISOString().slice(0,10);
export const ECONOMY_RULES=Object.freeze({version:1,mode:'ctc',asset:'merit',walletCap:30,dailyEarn:3,dailyDonate:3,guildXP:100,guildLevelCap:30,guildXPCap:29000});
async function eligible(req,env){
  const a=await assertAccountFeature(req,env,'online_economy');
  const c=await env.DB.prepare('SELECT flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(a.id).first();
  if(!c||c.flagged||c.validation_status!=='verified'||!c.updated_at||c.updated_at<Date.now()-30*864e5)throw new HttpError(403,'economy_locked');
  return a;
}
const balanceSQL="COALESCE((SELECT SUM(delta) FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit'),0)";
async function view(env,account){
  const db=env.DB;
  const wallet=await db.prepare("SELECT COALESCE(SUM(delta),0) AS balance FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit'").bind(account).first();
  const daily=await db.prepare("SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) AS earned,COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) AS donated FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit' AND day=?2").bind(account,day()).first();
  const rows=await db.prepare("SELECT request_id,source,delta,day,created_at FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit' ORDER BY created_at DESC,request_id LIMIT 32").bind(account).all();
  return {v:1,mode:'ctc',asset:'merit',balance:wallet.balance,earned_today:daily.earned,donated_today:daily.donated,rules:ECONOMY_RULES,entries:rows.results};
}
export async function economy(req,env,body){
  const a=await eligible(req,env),db=env.DB;
  if(req.method==='GET')return view(env,a.id);
  if(!(await rateLimit(db,'economy:'+a.id,60,60)))throw new HttpError(429,'rate_limited');
  const action=body?.action,today=day(),now=Date.now();
  if(action==='collect'){
    // Only today's real server boss receipts qualify; no amount/delta/snapshot from client.
    const rows=await db.prepare('SELECT request_id FROM boss_receipts WHERE account_id=?1 AND day=?2 AND damage>0 ORDER BY created_at,request_id LIMIT 3').bind(a.id,today).all();
    for(const row of rows.results)await db.prepare(`INSERT INTO resource_ledger(account_id,mode,asset,request_id,source,delta,day,created_at)
      SELECT ?1,'ctc','merit','boss:'||b.request_id,'boss_attendance',1,?2,?3 FROM boss_receipts b JOIN chars c ON c.account_id=b.account_id
      WHERE b.account_id=?1 AND b.request_id=?4 AND b.day=?2 AND b.damage>0
      AND c.flagged=0 AND c.validation_status='verified' AND c.updated_at>=?5
      AND CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')='ctc' AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ELSE 0 END
      AND ${balanceSQL}<30 AND (SELECT COALESCE(SUM(delta),0) FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit' AND day=?2 AND delta>0)<3
      ON CONFLICT(account_id,mode,asset,request_id) DO NOTHING`).bind(a.id,today,now,row.request_id,now-30*864e5).run();
    return view(env,a.id);
  }
  if(action!=='donate')throw new HttpError(400,'bad_economy_action');
  const id=body.request_id,amount=body.amount,guild=body.guild_id;
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id)||typeof guild!=='string'||guild.length>80||!Number.isSafeInteger(amount)||amount<1||amount>3)throw new HttpError(400,'bad_economy_request');
  const payload=JSON.stringify({amount,guild}),key='donate:'+id;
  const prior=await db.prepare("SELECT payload FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit' AND request_id=?2").bind(a.id,key).first();
  if(prior){if(prior.payload!==payload)throw new HttpError(409,'request_id_reused');return {receipt:id,...await view(env,a.id)};}
  await db.batch([
    db.prepare(`INSERT INTO resource_ledger(account_id,mode,asset,request_id,source,delta,day,created_at,payload,guild_id)
      SELECT ?1,'ctc','merit',?2,'guild_donation',-?3,?4,?5,?6,?7 WHERE ${balanceSQL}>=?3
      AND (SELECT COALESCE(SUM(-delta),0) FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit' AND day=?4 AND delta<0)+?3<=3
      AND EXISTS(SELECT 1 FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.account_id=?1 AND m.guild_id=?7 AND g.xp>=0 AND g.xp+?3*100<=29000)
      AND EXISTS(SELECT 1 FROM chars c WHERE c.account_id=?1 AND c.flagged=0 AND c.validation_status='verified' AND c.updated_at>=?8 AND CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')='ctc' AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ELSE 0 END)
      ON CONFLICT(account_id,mode,asset,request_id) DO NOTHING`).bind(a.id,key,amount,today,now,payload,guild,now-30*864e5),
    db.prepare('UPDATE guilds SET xp=xp+?2,level=1+CAST((xp+?2)/1000 AS INTEGER),updated_at=?3 WHERE id=?1 AND changes()>0').bind(guild,amount*100,now),
    db.prepare('UPDATE guild_members SET contrib=contrib+?3 WHERE guild_id=?1 AND account_id=?2 AND changes()>0').bind(guild,a.id,amount),
  ]);
  const receipt=await db.prepare("SELECT payload FROM resource_ledger WHERE account_id=?1 AND mode='ctc' AND asset='merit' AND request_id=?2").bind(a.id,key).first();
  if(!receipt)throw new HttpError(409,'economy_unavailable','Số dư, quota hoặc bang đã thay đổi');
  if(receipt.payload!==payload)throw new HttpError(409,'request_id_reused');
  return {receipt:id,...await view(env,a.id)};
}
