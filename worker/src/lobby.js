import {auth,cleanName} from './account.js';
import {HttpError,randomToken} from './http.js';
import {rateLimit} from './db.js';

const IDLE=35000,ROOM_TTL=2*3600e3,INVITE_TTL=10*60e3,FRIEND_TTL=7*864e5;
async function writes(db,id,scope){if(!await rateLimit(db,scope+':'+id,60,60))throw new HttpError(429,'rate_limited');}
function ctc(row){let s;try{s=JSON.parse(row?.snapshot);}catch(e){}if(!s||s.mode!=='ctc'||s.sandbox)throw new HttpError(403,'different_mode');return row;}
async function player(db,id){return ctc(await db.prepare('SELECT a.id,a.name,c.snapshot,c.power FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.id=?1').bind(id).first());}
async function named(db,name){const row=await db.prepare('SELECT a.id,a.name,c.snapshot,c.power FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.name=?1 COLLATE NOCASE').bind(cleanName(name)).first();if(!row)throw new HttpError(404,'player_not_found');return ctc(row);}
async function friendView(db,id){
  const now=Date.now();
  await db.prepare("DELETE FROM friendships WHERE status='pending' AND expires_at<=?1").bind(now).run();
  const rows=await db.prepare(`SELECT f.*,a.id AS account_id,a.name,a.last_hb FROM friendships f JOIN accounts a ON a.id=CASE WHEN f.a=?1 THEN f.b ELSE f.a END WHERE f.a=?1 OR f.b=?1 ORDER BY f.status='pending' DESC,f.created_at DESC LIMIT 120`).bind(id).all();
  const invites=await db.prepare(`SELECT i.id,i.room_id,i.expires_at,a.name AS sender FROM room_invites i JOIN accounts a ON a.id=i.sender_id JOIN rooms r ON r.id=i.room_id WHERE i.recipient_id=?1 AND i.status='pending' AND i.expires_at>?2 AND r.status='open' AND r.expires_at>?2 ORDER BY i.created_at DESC LIMIT 20`).bind(id,now).all();
  return {friends:rows.results.map(r=>({account_id:r.account_id,name:r.name,status:r.status,direction:r.requester===id?'outgoing':'incoming',expires_at:r.status==='pending'?r.expires_at:null,online:r.last_hb>=now-90000})),invites:invites.results};
}
export async function friends(req,env,body){
  const acc=await auth(req,env),db=env.DB;await player(db,acc.id);
  if(req.method==='GET')return friendView(db,acc.id);
  await writes(db,acc.id,'friends');
  const action=String(body.action||''),target=body.target_id?await player(db,String(body.target_id)):await named(db,body.name);
  if(target.id===acc.id)throw new HttpError(400,'self_friend');
  const [a,b]=[acc.id,target.id].sort(),now=Date.now();
  if(action==='request'){
    if(await db.prepare('SELECT 1 FROM player_blocks WHERE (blocker_id=?1 AND target_id=?2) OR (blocker_id=?2 AND target_id=?1)').bind(acc.id,target.id).first())throw new HttpError(403,'player_blocked');
    const existing=await db.prepare('SELECT * FROM friendships WHERE a=?1 AND b=?2').bind(a,b).first();
    if(existing&&(existing.status==='accepted'||existing.expires_at>now)){
      if(existing.requester!==acc.id&&existing.status==='pending')throw new HttpError(409,'friend_pending');
      return friendView(db,acc.id);
    }
    const result=await db.prepare(`INSERT INTO friendships(a,b,requester,status,created_at,expires_at)
      SELECT ?1,?2,?3,'pending',?4,?5 WHERE
      (SELECT COUNT(*) FROM friendships WHERE (a=?3 OR b=?3) AND (status='accepted' OR expires_at>?4))<120
      AND (SELECT COUNT(*) FROM friendships WHERE (a=?6 OR b=?6) AND requester<>?6 AND status='pending' AND expires_at>?4)<20
      ON CONFLICT(a,b) DO UPDATE SET requester=excluded.requester,status='pending',created_at=excluded.created_at,expires_at=excluded.expires_at
      WHERE friendships.status='pending' AND friendships.expires_at<=?4`).bind(a,b,acc.id,now,now+FRIEND_TTL,target.id).run();
    if(!result.meta.changes)throw new HttpError(409,'friend_limit');
  }else if(action==='accept'){
    const result=await db.prepare(`UPDATE friendships SET status='accepted' WHERE a=?1 AND b=?2 AND status='pending' AND requester<>?3 AND expires_at>?4
      AND NOT EXISTS(SELECT 1 FROM player_blocks WHERE (blocker_id=?3 AND target_id=CASE WHEN ?3=?1 THEN ?2 ELSE ?1 END) OR (target_id=?3 AND blocker_id=CASE WHEN ?3=?1 THEN ?2 ELSE ?1 END))
      AND (SELECT COUNT(*) FROM friendships WHERE (a=?1 OR b=?1) AND status='accepted')<100
      AND (SELECT COUNT(*) FROM friendships WHERE (a=?2 OR b=?2) AND status='accepted')<100`).bind(a,b,acc.id,now).run();
    if(!result.meta.changes){const row=await db.prepare('SELECT status FROM friendships WHERE a=?1 AND b=?2').bind(a,b).first();if(row?.status!=='accepted')throw new HttpError(409,'friend_unavailable');}
  }else if(['remove','decline','cancel'].includes(action)){
    await db.prepare('DELETE FROM friendships WHERE a=?1 AND b=?2').bind(a,b).run();
  }else throw new HttpError(400,'bad_friend_action');
  return friendView(db,acc.id);
}

async function currentRoom(db,id){return db.prepare("SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.account_id=?1 AND r.status='open' AND r.expires_at>?2").bind(id,Date.now()).first();}
function reset(db,roomId){return db.prepare('UPDATE lobby_members SET ready=0 WHERE room_id=?1').bind(roomId);}
async function lobbyView(db,id){
  const room=await currentRoom(db,id);if(!room)return {room:null};
  const now=Date.now();
  await db.batch([
    db.prepare("INSERT INTO lobby_rooms(room_id) VALUES(?1) ON CONFLICT DO NOTHING").bind(room.id),
    db.prepare(`INSERT INTO lobby_members(room_id,account_id) SELECT room_id,account_id FROM room_members WHERE room_id=?1 ON CONFLICT DO NOTHING`).bind(room.id),
    db.prepare(`UPDATE rooms SET owner_id=(SELECT account_id FROM room_members WHERE room_id=?1 AND last_seen>?2 ORDER BY joined_at,account_id LIMIT 1),updated_at=?3
      WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM room_members WHERE room_id=?1 AND account_id=rooms.owner_id AND last_seen>?2)
      AND EXISTS(SELECT 1 FROM room_members WHERE room_id=?1 AND last_seen>?2)`).bind(room.id,now-IDLE,now),
    db.prepare('UPDATE lobby_members SET ready=0 WHERE room_id=?1 AND changes()>0').bind(room.id),
    db.prepare('UPDATE lobby_rooms SET revision=revision+1 WHERE room_id=?1 AND changes()>0').bind(room.id),
  ]);
  const fresh=await db.prepare('SELECT r.*,l.objective,l.revision FROM rooms r JOIN lobby_rooms l ON l.room_id=r.id WHERE r.id=?1').bind(room.id).first();
  const members=(await db.prepare('SELECT m.account_id,m.name,m.power,m.last_seen,m.last_action,l.role,l.ready FROM room_members m JOIN lobby_members l ON l.room_id=m.room_id AND l.account_id=m.account_id WHERE m.room_id=?1 ORDER BY m.joined_at,m.account_id').bind(room.id).all()).results.map(m=>({...m,online:m.last_seen>now-IDLE,ready:!!m.ready&&m.last_seen>now-IDLE}));
  return {room:{...fresh,members,all_ready:members.length>=2&&members.every(m=>m.online&&m.ready),presence_idle_ms:IDLE,lobby_only:true}};
}

export async function partyRoom(req,env,body,acc,me){
  const db=env.DB,now=Date.now();ctc(me);
  // Reconnect retains membership until the room TTL. Stale members are visible and consume capacity.
  await db.prepare(`DELETE FROM room_members WHERE account_id=?1 AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=room_members.room_id AND status='open' AND expires_at>?2)`).bind(acc.id,now).run();
  if(req.method==='GET')return lobbyView(db,acc.id);
  await writes(db,acc.id,'room');
  const action=String(body.action||'');let current=await currentRoom(db,acc.id);
  if(action==='create'){
    if(current)return lobbyView(db,acc.id);
    const id=randomToken(8);
    try{await db.batch([
      db.prepare('INSERT INTO rooms(id,owner_id,created_at,updated_at,expires_at) VALUES(?1,?2,?3,?3,?4)').bind(id,acc.id,now,now+ROOM_TTL),
      db.prepare('INSERT INTO room_members(room_id,account_id,name,power,joined_at,last_seen) VALUES(?1,?2,?3,?4,?5,?5)').bind(id,acc.id,me.name,me.power||0,now),
      db.prepare('INSERT INTO lobby_rooms(room_id) VALUES(?1)').bind(id),
      db.prepare('INSERT INTO lobby_members(room_id,account_id) VALUES(?1,?2)').bind(id,acc.id),
    ]);}catch(e){if(!await currentRoom(db,acc.id))throw e;}
    return lobbyView(db,acc.id);
  }
  if(action==='invite_accept'||action==='invite_decline'){
    const invite=await db.prepare('SELECT * FROM room_invites WHERE id=?1').bind(String(body.invite_id||'')).first();
    if(!invite||invite.recipient_id!==acc.id)throw new HttpError(403,'invite_forbidden');
    if(action==='invite_decline'){await db.prepare("UPDATE room_invites SET status='declined' WHERE id=?1 AND status='pending'").bind(invite.id).run();return lobbyView(db,acc.id);}
    if(await db.prepare('SELECT 1 FROM player_blocks WHERE (blocker_id=?1 AND target_id=?2) OR (blocker_id=?2 AND target_id=?1)').bind(acc.id,invite.sender_id).first())throw new HttpError(403,'player_blocked');
    if(invite.status==='accepted'&&current?.id===invite.room_id)return lobbyView(db,acc.id);
    if(invite.status!=='pending'||invite.expires_at<=now)throw new HttpError(409,'invite_expired');
    if(current)throw new HttpError(409,'already_in_room');
    body={...body,room_id:invite.room_id};
  }
  if(action==='join'||action==='invite_accept'){
    if(current)throw new HttpError(409,'already_in_room');
    const id=String(body.room_id||'');
    const results=await db.batch([
      db.prepare(`INSERT INTO room_members(room_id,account_id,name,power,joined_at,last_seen)
        SELECT ?1,?2,?3,?4,?5,?5 WHERE (SELECT COUNT(*) FROM room_members WHERE room_id=?1)<4
        AND EXISTS(SELECT 1 FROM rooms WHERE id=?1 AND status='open' AND expires_at>?5)
        AND NOT EXISTS(SELECT 1 FROM room_members WHERE account_id=?2)
        AND EXISTS(SELECT 1 FROM chars WHERE account_id=?2 AND json_extract(snapshot,'$.mode')='ctc' AND COALESCE(json_extract(snapshot,'$.sandbox'),0)=0)
        AND (?6='join' OR EXISTS(SELECT 1 FROM room_invites i WHERE i.id=?7 AND i.room_id=?1 AND i.recipient_id=?2 AND i.status='pending' AND i.expires_at>?5 AND EXISTS(SELECT 1 FROM room_members m WHERE m.room_id=i.room_id AND m.account_id=i.sender_id)))`)
        .bind(id,acc.id,me.name,me.power||0,now,action,String(body.invite_id||'')),
      db.prepare('INSERT INTO lobby_rooms(room_id) SELECT ?1 WHERE changes()>0 ON CONFLICT DO UPDATE SET revision=revision+1').bind(id),
      db.prepare("INSERT INTO lobby_members(room_id,account_id) SELECT ?1,?2 WHERE changes()>0 ON CONFLICT DO UPDATE SET role='damage',ready=0").bind(id,acc.id),
      db.prepare('UPDATE lobby_members SET ready=0 WHERE room_id=?1 AND changes()>0').bind(id),
      db.prepare('UPDATE rooms SET updated_at=?2 WHERE id=?1 AND changes()>0').bind(id,now),
      db.prepare("UPDATE room_invites SET status='accepted' WHERE id=?1 AND recipient_id=?2 AND changes()>0").bind(String(body.invite_id||''),acc.id),
    ]);
    if(!results[0].meta.changes){
      if(action==='invite_accept'&&(await currentRoom(db,acc.id))?.id===id)return lobbyView(db,acc.id);
      throw new HttpError(409,'room_full');
    }
    return lobbyView(db,acc.id);
  }
  if(!current)throw new HttpError(400,'not_in_room');
  // Repair/elect leader before checking manager actions.
  const view=await lobbyView(db,acc.id);current=view.room;
  const roomId=String(body.room_id||current.id);if(roomId!==current.id)throw new HttpError(409,'room_changed');
  if(action==='leave'){
    await db.batch([
      db.prepare('DELETE FROM room_members WHERE room_id=?1 AND account_id=?2').bind(roomId,acc.id),
      db.prepare('DELETE FROM lobby_members WHERE room_id=?1 AND account_id=?2').bind(roomId,acc.id),
      db.prepare("UPDATE rooms SET owner_id=COALESCE((SELECT account_id FROM room_members WHERE room_id=?1 ORDER BY last_seen>?3 DESC,joined_at,account_id LIMIT 1),owner_id),status=CASE WHEN EXISTS(SELECT 1 FROM room_members WHERE room_id=?1) THEN status ELSE 'closed' END,updated_at=?4 WHERE id=?1 AND owner_id=?2").bind(roomId,acc.id,now-IDLE,now),
      reset(db,roomId),
      db.prepare('UPDATE lobby_rooms SET revision=revision+1 WHERE room_id=?1').bind(roomId),
    ]);return {room:null};
  }
  if(action==='heartbeat'){
    await db.batch([
      db.prepare('UPDATE lobby_members SET ready=0 WHERE room_id=?1 AND account_id=?2 AND EXISTS(SELECT 1 FROM room_members WHERE room_id=?1 AND account_id=?2 AND last_seen<=?3)').bind(roomId,acc.id,now-IDLE),
      db.prepare('UPDATE room_members SET name=?3,power=?4,last_seen=?5 WHERE room_id=?1 AND account_id=?2').bind(roomId,acc.id,me.name,me.power||0,now),
    ]);
    return lobbyView(db,acc.id);
  }
  if(action==='role'||action==='ready'){
    if(action==='role'&&!['damage','control','support'].includes(body.role))throw new HttpError(400,'bad_role');
    if(action==='ready'&&typeof body.ready!=='boolean')throw new HttpError(400,'bad_ready');
    await db.batch([
      db.prepare(`UPDATE lobby_members SET role=CASE WHEN ?3='role' THEN ?4 ELSE role END,ready=CASE WHEN ?3='role' THEN 0 ELSE ?5 END
        WHERE room_id=?1 AND account_id=?2 AND EXISTS(SELECT 1 FROM room_members WHERE room_id=?1 AND account_id=?2 AND last_seen>?6)`).bind(roomId,acc.id,action,String(body.role||'damage'),body.ready?1:0,now-IDLE),
      db.prepare('UPDATE lobby_rooms SET revision=revision+1 WHERE room_id=?1 AND changes()>0').bind(roomId),
    ]);return lobbyView(db,acc.id);
  }
  if(['objective','transfer','kick'].includes(action)){
    if(current.owner_id!==acc.id)throw new HttpError(403,'leader_only');
    if(action==='objective'){
      if(!['farm','boss','siege','tk'].includes(body.objective))throw new HttpError(400,'bad_objective');
      await db.batch([
        db.prepare("UPDATE lobby_rooms SET objective=?3,revision=revision+1 WHERE room_id=?1 AND EXISTS(SELECT 1 FROM rooms WHERE id=?1 AND owner_id=?2 AND status='open')").bind(roomId,acc.id,body.objective),
        db.prepare('UPDATE lobby_members SET ready=0 WHERE room_id=?1 AND changes()>0').bind(roomId),
      ]);
    }else{
      const target=String(body.target_id||'');if(target===acc.id)throw new HttpError(400,'self_target');
      const statement=action==='transfer'?db.prepare(`UPDATE rooms SET owner_id=?3,updated_at=?4 WHERE id=?1 AND owner_id=?2 AND EXISTS(SELECT 1 FROM room_members WHERE room_id=?1 AND account_id=?3 AND last_seen>?5)`).bind(roomId,acc.id,target,now,now-IDLE):
        db.prepare(`DELETE FROM room_members WHERE room_id=?1 AND account_id=?3 AND EXISTS(SELECT 1 FROM rooms WHERE id=?1 AND owner_id=?2)`).bind(roomId,acc.id,target);
      const results=await db.batch([statement,db.prepare('UPDATE lobby_members SET ready=0 WHERE room_id=?1 AND changes()>0').bind(roomId),db.prepare('UPDATE lobby_rooms SET revision=revision+1 WHERE room_id=?1 AND changes()>0').bind(roomId)]);
      if(!results[0].meta.changes)throw new HttpError(409,'member_changed');
    }
    return lobbyView(db,acc.id);
  }
  if(action==='invite'){
    const target=await named(db,body.name);if(target.id===acc.id)throw new HttpError(400,'self_invite');
    const [a,b]=[acc.id,target.id].sort();
    const result=await db.prepare(`INSERT INTO room_invites(id,room_id,sender_id,recipient_id,created_at,expires_at)
      SELECT ?1,?2,?3,?4,?5,?6 WHERE EXISTS(SELECT 1 FROM room_members WHERE room_id=?2 AND account_id=?3)
      AND EXISTS(SELECT 1 FROM rooms WHERE id=?2 AND status='open' AND expires_at>?5)
      AND (EXISTS(SELECT 1 FROM friendships WHERE a=?7 AND b=?8 AND status='accepted') OR EXISTS(SELECT 1 FROM guild_members x JOIN guild_members y ON y.guild_id=x.guild_id WHERE x.account_id=?3 AND y.account_id=?4))
      AND NOT EXISTS(SELECT 1 FROM player_blocks WHERE (blocker_id=?3 AND target_id=?4) OR (blocker_id=?4 AND target_id=?3))
      AND NOT EXISTS(SELECT 1 FROM room_invites WHERE room_id=?2 AND recipient_id=?4 AND status='pending' AND expires_at>?5)
      AND (SELECT COUNT(*) FROM room_invites WHERE recipient_id=?4 AND status='pending' AND expires_at>?5)<20`).bind(randomToken(12),roomId,acc.id,target.id,now,now+INVITE_TTL,a,b).run();
    if(!result.meta.changes)throw new HttpError(409,'invite_unavailable','Chỉ mời bạn hoặc người cùng bang; có thể lời mời đang chờ hoặc đã hết chỗ lời mời');
    return {ok:true,...await lobbyView(db,acc.id)};
  }
  throw new HttpError(400,'bad_room_action');
}
