import {GAME} from '../gen/game.js';
import {HttpError,randomToken} from './http.js';

const ACTIONS=['leave','transfer','promote','demote','kick','schedule','cancel_event'];
export async function manageGuild(env,acc,current,me,body,view) {
  const action=String(body?.action||'');if(!ACTIONS.includes(action))return null;
  let mode;try{mode=JSON.parse(me.snapshot).mode;}catch(e){}
  if(!GAME.featureEnabled('guild_management',mode,env.FEATURE_FLAGS,false)){
    if(action==='leave')return null;throw new HttpError(403,'feature_disabled');
  }
  const requestId=body.request_id==null?randomToken(12):String(body.request_id);
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))throw new HttpError(400,'bad_request_id');
  const target=String(body.target_id||'').slice(0,80),now=Date.now(),payload={action,target,guild:body.guild_id?String(body.guild_id):null};
  if(action==='schedule'){
    payload.title=String(body.title||'').replace(/[\u0000-\u001f\u007f]/g,'').trim();payload.activity=String(body.activity||'');payload.starts_at=Number(body.starts_at);
    if(!payload.title||payload.title.length>80||!['boss','siege','tk'].includes(payload.activity)||!Number.isSafeInteger(payload.starts_at))throw new HttpError(400,'bad_event');
  }
  const encoded=JSON.stringify(payload),db=env.DB;
  const prior=await db.prepare('SELECT * FROM guild_receipts WHERE account_id=?1 AND request_id=?2').bind(acc.id,requestId).first();
  if(prior){if(prior.payload!==encoded)throw new HttpError(409,'request_id_reused');return {receipt:{request_id:requestId,action,guild_id:prior.guild_id},...await view(db,acc.id)};}
  if(!current){if(action==='leave')return {guild:null};throw new HttpError(400,'not_in_guild');}
  if(payload.guild&&payload.guild!==current.id)throw new HttpError(409,'guild_changed');
  if(['transfer','promote','demote','kick'].includes(action)&&(!target||target===acc.id))throw new HttpError(400,'bad_target');
  if(action==='schedule'&&(payload.starts_at<now+60000||payload.starts_at>now+90*864e5))throw new HttpError(400,'bad_event_time');
  let permission="EXISTS(SELECT 1 FROM guild_members a JOIN guilds g ON g.id=a.guild_id WHERE a.guild_id=?3 AND a.account_id=?1";
  if(action==='leave')permission+=')';
  else if(action==='schedule'||action==='cancel_event')permission+=" AND a.role IN ('owner','officer'))";
  else permission+=" AND (a.role='owner' AND g.owner_id=?1"+(action==='kick'?" OR a.role='officer'":"")+'))';
  if(['transfer','promote','demote','kick'].includes(action)){
    const roles=action==='promote'?"t.role='member'":action==='demote'?"t.role='officer'":action==='kick'?"t.role<>'owner' AND (EXISTS(SELECT 1 FROM guilds WHERE id=?3 AND owner_id=?1) OR t.role='member')":"t.role IN ('member','officer')";
    permission+=` AND EXISTS(SELECT 1 FROM guild_members t WHERE t.guild_id=?3 AND t.account_id=?6 AND ${roles})`;
  }
  if(action==='cancel_event')permission+=" AND EXISTS(SELECT 1 FROM guild_calendar WHERE id=?6 AND guild_id=?3 AND cancelled=0)";
  if(action==='schedule')permission+=` AND (SELECT COUNT(*) FROM guild_calendar WHERE guild_id=?3 AND cancelled=0 AND starts_at>=${now})<10`;
  const statements=[db.prepare(`INSERT INTO guild_receipts(account_id,request_id,guild_id,action,payload,created_at)
    SELECT ?1,?2,?3,?4,?5,?7 WHERE ${permission} ON CONFLICT(account_id,request_id) DO NOTHING`).bind(acc.id,requestId,current.id,action,encoded,target,now)];
  if(action==='leave')statements.push(
    db.prepare('DELETE FROM guild_members WHERE guild_id=?1 AND account_id=?2 AND changes()>0').bind(current.id,acc.id),
    db.prepare(`UPDATE guilds SET owner_id=CASE WHEN owner_id=?2 THEN COALESCE((SELECT account_id FROM guild_members WHERE guild_id=?1 ORDER BY role='officer' DESC,joined_at,account_id LIMIT 1),'') ELSE owner_id END,updated_at=?3 WHERE id=?1 AND changes()>0`).bind(current.id,acc.id,now),
    db.prepare("UPDATE guild_members SET role=CASE WHEN account_id=(SELECT owner_id FROM guilds WHERE id=?1) THEN 'owner' WHEN role='owner' THEN 'officer' ELSE role END WHERE guild_id=?1 AND changes()>0").bind(current.id),
    db.prepare("DELETE FROM guilds WHERE id=?1 AND owner_id='' AND NOT EXISTS(SELECT 1 FROM guild_members WHERE guild_id=?1)").bind(current.id),
    db.prepare('DELETE FROM guild_calendar WHERE guild_id=?1 AND NOT EXISTS(SELECT 1 FROM guilds WHERE id=?1)').bind(current.id));
  else if(action==='transfer')statements.push(
    db.prepare('UPDATE guilds SET owner_id=?3,updated_at=?4 WHERE id=?1 AND owner_id=?2 AND changes()>0').bind(current.id,acc.id,target,now),
    db.prepare("UPDATE guild_members SET role=CASE WHEN account_id=?2 THEN 'owner' WHEN role='owner' THEN 'officer' ELSE role END WHERE guild_id=?1 AND changes()>0").bind(current.id,target));
  else if(action==='kick')statements.push(db.prepare('DELETE FROM guild_members WHERE guild_id=?1 AND account_id=?2 AND changes()>0').bind(current.id,target));
  else if(action==='promote'||action==='demote')statements.push(db.prepare('UPDATE guild_members SET role=?3 WHERE guild_id=?1 AND account_id=?2 AND changes()>0').bind(current.id,target,action==='promote'?'officer':'member'));
  else if(action==='schedule')statements.push(db.prepare('INSERT INTO guild_calendar(id,guild_id,actor_id,title,activity,starts_at) SELECT ?1,?2,?3,?4,?5,?6 WHERE changes()>0').bind(randomToken(9),current.id,acc.id,payload.title,payload.activity,payload.starts_at));
  else statements.push(db.prepare('UPDATE guild_calendar SET cancelled=1 WHERE id=?1 AND guild_id=?2 AND changes()>0').bind(target,current.id));
  statements.push(db.prepare(`INSERT INTO guild_logs(account_id,request_id,guild_id,action,target_id,created_at) SELECT account_id,request_id,guild_id,action,?3,created_at FROM guild_receipts WHERE account_id=?1 AND request_id=?2 ON CONFLICT(account_id,request_id) DO NOTHING`).bind(acc.id,requestId,target||null));
  await db.batch(statements);
  const receipt=await db.prepare('SELECT * FROM guild_receipts WHERE account_id=?1 AND request_id=?2').bind(acc.id,requestId).first();
  if(!receipt)throw new HttpError(403,'guild_permission','Quyền, thành viên hoặc lịch đã thay đổi; tải lại bang');
  if(receipt.payload!==encoded)throw new HttpError(409,'request_id_reused');
  return {receipt:{request_id:requestId,action,guild_id:receipt.guild_id},...await view(db,acc.id)};
}
