import {HttpError} from './http.js';
import {auth,parseSave} from './account.js';
import {rateLimit} from './db.js';
import {GAME} from '../gen/game.js';

function roomId(value){const id=String(value||'');if(!/^[A-Za-z0-9_-]{6,80}$/.test(id))throw new HttpError(400,'bad_room_id');return id;}
async function member(db,account,id,scope,env){
  const row=scope==='guild'
    ?await db.prepare('SELECT c.snapshot FROM guild_members m JOIN guilds g ON g.id=m.guild_id JOIN chars c ON c.account_id=m.account_id WHERE m.guild_id=?1 AND m.account_id=?2').bind(id,account).first()
    :await db.prepare(`SELECT c.snapshot FROM room_members m JOIN rooms r ON r.id=m.room_id JOIN chars c ON c.account_id=m.account_id WHERE m.room_id=?1 AND m.account_id=?2 AND r.status='open' AND r.expires_at>?3`).bind(id,account,Date.now()).first();
  if(!row)throw new HttpError(403,scope==='guild'?'guild_member_required':'room_member_required');const state=parseSave(row.snapshot);
  const feature=scope==='guild'?'guild_online':'party_lobby';if(!GAME.featureEnabled(feature,state.mode,env.FEATURE_FLAGS,!!state.sandbox))throw new HttpError(403,'feature_disabled');
}
export async function chat(req,env,body,url){
  const account=await auth(req,env),db=env.DB,scope=String(req.method==='GET'?url.searchParams.get('scope')||'room':body?.scope||'room');
  if(!['room','guild'].includes(scope))throw new HttpError(400,'bad_chat_scope');
  const id=roomId(req.method==='GET'?url.searchParams.get(scope==='guild'?'guild_id':'room_id'):body?.[scope==='guild'?'guild_id':'room_id']);
  await member(db,account.id,id,scope,env);const now=Date.now();
  await db.prepare('DELETE FROM room_chat WHERE created_at<?1').bind(now-7*864e5).run();
  if(req.method==='GET'){
    const rows=await db.prepare(`SELECT c.id,c.sender_id,a.name AS sender,c.body,c.created_at FROM room_chat c JOIN accounts a ON a.id=c.sender_id
      WHERE c.scope=?4 AND c.room_id=?1 AND NOT EXISTS(SELECT 1 FROM player_blocks b WHERE (b.blocker_id=?2 AND b.target_id=c.sender_id) OR (b.target_id=?2 AND b.blocker_id=c.sender_id))
      AND NOT EXISTS(SELECT 1 FROM player_mutes m WHERE m.muter_id=?2 AND m.target_id=c.sender_id AND m.expires_at>?3)
      ORDER BY c.created_at DESC LIMIT 40`).bind(id,account.id,now,scope).all();return {messages:rows.results.reverse()};
  }
  if(!await rateLimit(db,'room-chat:'+account.id,20,60))throw new HttpError(429,'chat_rate_limited');
  const clientId=String(body?.client_id||'');if(!/^[A-Za-z0-9_-]{8,80}$/.test(clientId))throw new HttpError(400,'bad_message_id');
  const raw=String(body?.text||'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim(),text=Array.from(raw).slice(0,280).join('');
  if(!text)throw new HttpError(400,'empty_message');
  const prior=await db.prepare('SELECT id,scope,room_id,body FROM room_chat WHERE sender_id=?1 AND client_id=?2').bind(account.id,clientId).first();
  if(prior){if(prior.scope!==scope||prior.room_id!==id||prior.body!==text)throw new HttpError(409,'message_id_conflict');return {ok:true,duplicate:true,id:prior.id};}
  const memberTable=scope==='guild'?'guild_members':'room_members',memberKey=scope==='guild'?'guild_id':'room_id';
  const result=await db.prepare(`INSERT INTO room_chat(id,scope,room_id,sender_id,client_id,body,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM ${memberTable} WHERE ${memberKey}=?3 AND account_id=?4)`).bind(crypto.randomUUID(),scope,id,account.id,clientId,text,now).run();
  if(!result.meta.changes)throw new HttpError(403,'chat_blocked');return {ok:true,duplicate:false};
}
