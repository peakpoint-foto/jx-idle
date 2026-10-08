import {HttpError} from './http.js';
import {auth,parseSave} from './account.js';
import {rateLimit} from './db.js';
import {admin} from './ladder.js';

const REASONS=new Set(['harassment','spam','cheat','impersonation','other']);
async function currentPlayer(db,id){
  const row=await db.prepare('SELECT a.id,c.snapshot FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.id=?1').bind(id).first();
  if(!row)throw new HttpError(404,'player_not_found');
  const state=parseSave(row.snapshot);if(state.mode!=='ctc')throw new HttpError(403,'different_mode');return row;
}
export async function moderation(req,env,body,url){
  const account=await auth(req,env),db=env.DB,actor=await currentPlayer(db,account.id);
  if(req.method==='GET'){
    const rows=await db.prepare('SELECT target_id,created_at FROM player_blocks WHERE blocker_id=?1 ORDER BY created_at DESC LIMIT 200').bind(actor.id).all();
    return {blocks:rows.results};
  }
  if(!await rateLimit(db,'moderation:'+actor.id,20,3600))throw new HttpError(429,'rate_limited');
  const action=String(body?.action||''),targetId=String(body?.target_id||'');
  if(!/^[A-Za-z0-9_-]{6,100}$/.test(targetId)||targetId===actor.id)throw new HttpError(400,'bad_target');
  const target=await currentPlayer(db,targetId),now=Date.now();
  if(action==='block'||action==='unblock'){
    if(action==='block')await db.batch([
      db.prepare('INSERT INTO player_blocks(blocker_id,target_id,created_at) VALUES(?1,?2,?3) ON CONFLICT(blocker_id,target_id) DO NOTHING').bind(actor.id,target.id,now),
      db.prepare('DELETE FROM friendships WHERE (a=?1 AND b=?2) OR (a=?2 AND b=?1)').bind(actor.id,target.id),
      db.prepare("UPDATE room_invites SET status='declined' WHERE sender_id=?1 AND recipient_id=?2 AND status='pending'").bind(actor.id,target.id),
      db.prepare("UPDATE room_invites SET status='declined' WHERE sender_id=?2 AND recipient_id=?1 AND status='pending'").bind(actor.id,target.id),
    ]);
    else await db.prepare('DELETE FROM player_blocks WHERE blocker_id=?1 AND target_id=?2').bind(actor.id,target.id).run();
    return {ok:true,action,target_id:target.id};
  }
  if(action==='report'){
    const reason=String(body.reason||'');if(!REASONS.has(reason))throw new HttpError(400,'bad_reason');
    const details=String(body.details||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,500);
    await db.prepare('DELETE FROM player_reports WHERE created_at<?1').bind(now-180*864e5).run();
    const submitted=await db.prepare('SELECT COUNT(*) AS n FROM player_reports WHERE reporter_id=?1 AND created_at>=?2').bind(actor.id,now-864e5).first();
    if(submitted.n>=5)throw new HttpError(429,'report_limit');
    const prior=await db.prepare("SELECT id FROM player_reports WHERE reporter_id=?1 AND target_id=?2 AND status='open' AND created_at>?3").bind(actor.id,target.id,now-864e5).first();
    if(prior)return {ok:true,duplicate:true,report_id:prior.id};
    const row=await db.prepare("INSERT INTO player_reports(reporter_id,target_id,reason,details,created_at) VALUES(?1,?2,?3,?4,?5) RETURNING id").bind(actor.id,target.id,reason,details,now).first();
    return {ok:true,report_id:row.id};
  }
  throw new HttpError(400,'bad_action');
}
export async function adminModeration(req,env,body,url){
  admin(req,env);const db=env.DB,now=Date.now();
  if(!await rateLimit(db,'admin:moderation',120,60))throw new HttpError(429,'rate_limited');
  await db.batch([
    db.prepare('DELETE FROM player_reports WHERE created_at<?1').bind(now-180*864e5),
    db.prepare('DELETE FROM admin_audit WHERE created_at<?1').bind(now-365*864e5),
  ]);
  if(req.method==='GET'){
    const status=['open','reviewing','closed'].includes(url.searchParams.get('status'))?url.searchParams.get('status'):'open';
    const rows=await db.prepare(`SELECT r.id,r.reason,r.details,r.created_at,r.status,ra.name AS reporter,ta.name AS target
      FROM player_reports r JOIN accounts ra ON ra.id=r.reporter_id JOIN accounts ta ON ta.id=r.target_id
      WHERE r.status=?1 ORDER BY r.created_at DESC LIMIT 100`).bind(status).all();return {rows:rows.results};
  }
  const id=Math.floor(+body?.report_id),status=String(body?.status||'');
  if(!(id>0)||!['reviewing','closed','open'].includes(status))throw new HttpError(400,'bad_report_update');
  const result=await db.prepare('UPDATE player_reports SET status=?2 WHERE id=?1').bind(id,status).run();
  if(!result.meta.changes)throw new HttpError(404,'report_not_found');
  await db.prepare('INSERT INTO admin_audit(actor,action,target_id,created_at,detail) SELECT ?1,?2,target_id,?3,?4 FROM player_reports WHERE id=?5')
    .bind('admin','report_'+status,now,'report_id='+id,id).run();return {ok:true,report_id:id,status};
}
