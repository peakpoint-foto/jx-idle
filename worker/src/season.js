import {auth} from './account.js';
import {HttpError} from './http.js';
import {rateLimit} from './db.js';

const WEEK=7*864e5,MAX_AGE=30*864e5,TASK_ID='frontier',TASK_TARGET=250,PLAYER_CAP=50;
const seasonAt=now=>Math.floor(now/WEEK),seasonStart=season=>season*WEEK;
const seasonTitle=rank=>rank===1?'Chiến Tướng':rank<=3?'Top 3 Mùa':rank<=10?'Top 10 Mùa':null;
async function eligible(req,env){
  const acc=await auth(req,env),row=await env.DB.prepare('SELECT snapshot,fac,bracket,flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(acc.id).first();
  let save;try{save=JSON.parse(row?.snapshot)}catch{}
  if(!row||!save||save.mode!=='ctc'||save.sandbox||row.flagged||row.validation_status!=='verified'||!row.bracket||row.updated_at<Date.now()-MAX_AGE)throw new HttpError(403,'season_locked');
  if(!await rateLimit(env.DB,'season:'+acc.id,60,60))throw new HttpError(429,'rate_limited');
  return {acc,row};
}
async function board(db,season,bracket,faction,accountId){
  return (await db.prepare(`WITH ranked AS (
    SELECT a.id,a.name,c.fac,c.bracket,s.points,s.wins,s.losses,
      RANK() OVER(ORDER BY s.points DESC,s.wins DESC,s.losses ASC) AS rank
    FROM duel_scores s JOIN accounts a ON a.id=s.account_id JOIN chars c ON c.account_id=a.id
    WHERE s.season=?1 AND c.bracket=?2 AND c.fac=?3 AND c.flagged=0 AND c.validation_status='verified'
      AND c.updated_at>?4 AND CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')='ctc' AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ELSE 0 END
  ) SELECT * FROM ranked WHERE rank<=50 OR id=?5 ORDER BY rank,id LIMIT 51`).bind(season,bracket,faction,Date.now()-MAX_AGE,accountId).all()).results;
}
async function guildTask(db,accountId,week){
  const membership=await db.prepare('SELECT g.id,g.name FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.account_id=?1').bind(accountId).first();
  if(!membership)return null;
  const [progress,mine]=await Promise.all([
    db.prepare('SELECT COALESCE(SUM(points),0) AS points FROM guild_weekly_task_members WHERE guild_id=?1 AND week=?2 AND task_id=?3').bind(membership.id,week,TASK_ID).first(),
    db.prepare('SELECT points FROM guild_weekly_task_members WHERE guild_id=?1 AND week=?2 AND task_id=?3 AND account_id=?4').bind(membership.id,week,TASK_ID,accountId).first(),
  ]);
  return {guild_id:membership.id,guild_name:membership.name,id:TASK_ID,week,target:TASK_TARGET,progress:Math.min(TASK_TARGET,progress.points),personal:mine?.points||0,personal_cap:PLAYER_CAP,source:'verified_party_siege_receipt'};
}
export async function recordGuildSiegeTask(db,sessionId,accountId,session,now=Date.now()){
  const actor=session.actors.find(a=>a.id===accountId),objective=Math.max(0,actor?.contribution?.objective||0);
  const points=Math.min(20,Math.floor(objective/10));if(session.activity!=='siege'||session.status!=='completed'||!points)return;
  const week=String(seasonAt(now));
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO guild_weekly_tasks(guild_id,week,task_id,target,created_at) SELECT guild_id,?2,?3,?4,?5 FROM guild_members WHERE account_id=?1').bind(accountId,week,TASK_ID,TASK_TARGET,now),
    db.prepare(`INSERT OR IGNORE INTO guild_weekly_task_receipts(session_id,account_id,guild_id,week,task_id,points,created_at)
      SELECT ?1,?2,guild_id,?3,?4,?5,?6 FROM guild_members WHERE account_id=?2`).bind(sessionId,accountId,week,TASK_ID,points,now),
    db.prepare(`INSERT INTO guild_weekly_task_members(guild_id,week,task_id,account_id,points,updated_at)
      SELECT guild_id,?2,?3,?1,MIN(?4,?5),?6 FROM guild_members WHERE account_id=?1 AND changes()>0
      ON CONFLICT(guild_id,week,task_id,account_id) DO UPDATE SET points=MIN(?5,guild_weekly_task_members.points+excluded.points),updated_at=excluded.updated_at`)
      .bind(accountId,week,TASK_ID,points,PLAYER_CAP,now),
  ]);
}
export async function season(req,env,body,url=new URL(req.url)){
  const {acc,row}=await eligible(req,env),now=Date.now(),current=seasonAt(now),week=String(current);
  if(req.method==='GET'){
    const raw=url.searchParams.get('season'),seasonNo=raw==null?current:Number(raw);
    if(!Number.isSafeInteger(seasonNo)||seasonNo>current||seasonNo<current-52)throw new HttpError(400,'bad_season');
    const seasonKey=String(seasonNo),rows=await board(env.DB,seasonKey,row.bracket,row.fac,acc.id);
    const previousRows=seasonNo===current?await board(env.DB,String(current-1),row.bracket,row.fac,acc.id):[];
    const previousMine=previousRows.find(x=>x.id===acc.id)||null;
    const own=rows.find(x=>x.id===acc.id)||null,title=await env.DB.prepare('SELECT title,rank,claimed_at FROM season_titles WHERE account_id=?1 AND season=?2').bind(acc.id,String(current-1)).first();
    return {season:seasonKey,current_season:week,start:seasonStart(seasonNo),end:seasonStart(seasonNo+1),bracket:row.bracket,faction:row.fac,
      rows:rows.filter(x=>x.rank<=50),mine:own,guild_task:await guildTask(env.DB,acc.id,week),previous_title:title||null,
      previous_mine:seasonNo===current?previousMine:null,claimable_season:String(current-1)};
  }
  if(req.method!=='POST'||body?.action!=='claim_title'||Object.keys(body||{}).some(k=>!['action','season'].includes(k)))throw new HttpError(400,'bad_season_action');
  const seasonNo=Number(body.season);if(!Number.isSafeInteger(seasonNo)||seasonNo!==current-1)throw new HttpError(409,'season_not_closed');
  const rankRows=await board(env.DB,String(seasonNo),row.bracket,row.fac,acc.id),mine=rankRows.find(x=>x.id===acc.id);
  if(!mine||!seasonTitle(mine.rank))throw new HttpError(409,'season_reward_unavailable');
  await env.DB.prepare(`INSERT INTO season_titles(account_id,season,title,rank,claimed_at)
    VALUES(?1,?2,?3,?4,?5) ON CONFLICT(account_id,season) DO NOTHING`).bind(acc.id,String(seasonNo),seasonTitle(mine.rank),mine.rank,now).run();
  const receipt=await env.DB.prepare('SELECT title,rank,claimed_at FROM season_titles WHERE account_id=?1 AND season=?2').bind(acc.id,String(seasonNo)).first();
  return {receipt,rank:mine.rank,replayed:receipt.claimed_at!==now};
}
