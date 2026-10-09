import {auth} from './account.js';
import {HttpError,randomToken} from './http.js';
import {rateLimit} from './db.js';
import {GAME} from '../gen/game.js';
import {duelProfile} from './duel_rules.js';
const IDLE=10000,TTL=300000,STEP=250,MAX_CATCHUP=8;
async function memberRows(db,id){return (await db.prepare('SELECT * FROM session_members WHERE session_id=?1 ORDER BY account_id').bind(id).all()).results;}
function stateOf(row){let state;try{state=JSON.parse(row.state);}catch{}if(!state||state.v!==1||state.model!==GAME.COMBAT_MODEL_VERSION||state.rules!==GAME.SESSION_COMBAT.version)throw new HttpError(409,'session_model_changed');return state;}
async function rowFor(db,id,account){
  const row=await db.prepare('SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE s.id=?1 AND m.account_id=?2').bind(id,account).first();
  if(!row)throw new HttpError(404,'session_not_found');return row;
}
async function release(db,id){await db.prepare("UPDATE session_members SET active=0 WHERE session_id=?1 AND EXISTS(SELECT 1 FROM combat_sessions WHERE id=?1 AND status<>'active')").bind(id).run();}
async function advance(db,row,now){
  if(row.status!=='active'){await release(db,row.id);return row;}
  if(row.expires_at<=now){await db.prepare("UPDATE combat_sessions SET status='aborted',ended_at=?2,revision=revision+1 WHERE id=?1 AND status='active'").bind(row.id,now).run();await release(db,row.id);return await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(row.id).first();}
  const original=stateOf(row),due=Math.min(MAX_CATCHUP,Math.max(0,Math.floor((now-row.created_at)/STEP)-original.tick));
  if(!due)return row;
  const members=await memberRows(db,row.id),lastTick=original.tick+due;
  const commands=(await db.prepare('SELECT * FROM session_actions WHERE session_id=?1 AND applied=0 AND scheduled_tick<=?2 ORDER BY scheduled_tick,account_id,seq LIMIT 64').bind(row.id,lastTick).all()).results;
  let state=original;
  for(let n=0;n<due&&state.status==='active';n++){
    const tick=state.tick+1,at=row.created_at+tick*STEP;
    for(const actor of state.actors){const m=members.find(m=>m.account_id===actor.id);if(!m||m.withdrawn){actor.hp=0;actor.withdrawn=true;}}
    const connected=members.filter(m=>m.active&&!m.withdrawn&&m.connected_from<=at&&m.last_seen+IDLE>=at).map(m=>m.account_id);
    state=GAME.sessionCombatStep(state,commands.filter(c=>c.scheduled_tick===tick).map(c=>({actor:c.account_id,seq:c.seq,kind:c.kind,target:c.target})),connected);
  }
  const done=state.status!=='active',ids=commands.filter(c=>c.scheduled_tick<=state.tick).map(c=>c.id);
  const statements=[db.prepare('UPDATE combat_sessions SET state=?3,status=?4,revision=revision+1,ended_at=?5 WHERE id=?1 AND revision=?2 AND status=\'active\'')
    .bind(row.id,row.revision,JSON.stringify(state),state.status,done?now:null)];
  if(ids.length)statements.push(db.prepare(`UPDATE session_actions SET applied=1 WHERE id IN (${ids.map((_,i)=>'?'+(i+1)).join(',')}) AND changes()>0`).bind(...ids));
  const result=await db.batch(statements);
  if(result[0].meta.changes&&done)await release(db,row.id);
  return await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(row.id).first();
}
async function publicView(db,row,account){
  const state=stateOf(row),members=await memberRows(db,row.id),self=members.find(m=>m.account_id===account);
  const reward=await db.prepare('SELECT amount,day FROM session_rewards WHERE session_id=?1 AND account_id=?2').bind(row.id,account).first();
  return {session:{id:row.id,room_id:row.room_id,status:row.status,revision:row.revision,created_at:row.created_at,expires_at:row.expires_at,tick:state.tick,
    model:state.model,rules:state.rules,mode:state.mode,activity:state.activity||'party',objectives:state.objectives||null,boss:{hp:state.boss.hp,max:state.boss.max,stun:state.boss.stun,ward:state.boss.ward||0,wardPhase:state.boss.wardPhase||0},
    actors:state.actors.map(a=>({id:a.id,name:a.name,role:a.role,hp:a.hp,maxHp:a.p.life,mp:a.mp,maxMp:a.p.mana,contribution:a.contribution,withdrawn:!!a.withdrawn,
      connected:members.some(m=>m.account_id===a.id&&m.active&&m.last_seen>Date.now()-IDLE)})),events:state.events.slice(-32),next_seq:(self?.last_seq||0)+1,
    reward,transport:'polling',step_ms:STEP,catchup_max:MAX_CATCHUP,loot_policy:'Server merit only; no offline gold/items. Shared earned cap3/day UTC, wallet30; contribution required, withdrawn ineligible.'}};
}
async function create(env,acc,now,requestId,activity='party'){
  const db=env.DB;
  if(requestId!=null){
    if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))throw new HttpError(400,'bad_session_id');
    const previous=await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(requestId).first();
    if(previous){if(previous.creator_id!==acc.id)throw new HttpError(403,'session_leader_required');const prior=stateOf(previous);if((prior.activity||'party')!==activity)throw new HttpError(409,'session_activity_conflict');return previous;}
  }
  if(!['party','dungeon'].includes(activity))throw new HttpError(400,'bad_session_activity');
  if(activity==='dungeon'&&!GAME.featureEnabled('party_dungeon','ctc',env.FEATURE_FLAGS,false))throw new HttpError(403,'feature_disabled');
  if(!GAME.featureEnabled('party_lobby','ctc',env.FEATURE_FLAGS,false))throw new HttpError(403,'lobby_required');
  const room=await db.prepare("SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.account_id=?1 AND r.status='open' AND r.expires_at>?2").bind(acc.id,now).first();
  if(!room||room.owner_id!==acc.id)throw new HttpError(403,'session_leader_required');
  const roster=(await db.prepare(`SELECT a.id,a.name,a.play_sec,c.*,m.last_seen,l.role,l.ready FROM room_members m JOIN accounts a ON a.id=m.account_id JOIN chars c ON c.account_id=a.id JOIN lobby_members l ON l.room_id=m.room_id AND l.account_id=m.account_id WHERE m.room_id=?1 ORDER BY a.id`).bind(room.id).all()).results;
  if(roster.length<2||roster.length>4||roster.some(r=>!r.ready||r.last_seen<=now-35000||r.flagged||r.validation_status!=='verified'||r.updated_at<now-30*864e5))throw new HttpError(409,'session_not_ready');
  const actors=roster.map(r=>{
    duelProfile(r);const previous=GAME.getS();try{GAME.setS(JSON.parse(r.snapshot));return GAME.sessionActor(r.id,r.name,GAME.calc(),r.role);}finally{GAME.setS(previous);}
  });
  const seed=crypto.getRandomValues(new Uint32Array(1))[0],id=requestId||randomToken(12),state=GAME.sessionCombatNew('ctc',actors,seed,activity);
  const values=[id,room.id,acc.id,now,now+TTL,JSON.stringify(state),roster.length,now-35000,now-30*864e5];
  let revisionChecks='';for(const r of roster){values.push(r.id,r.sync_rev);revisionChecks+=` AND EXISTS(SELECT 1 FROM chars WHERE account_id=?${values.length-1} AND sync_rev=?${values.length})`;}
  const statements=[db.prepare(`INSERT INTO combat_sessions(id,room_id,creator_id,created_at,expires_at,state,status)
    SELECT ?1,?2,?3,?4,?5,?6,'active' FROM rooms r WHERE r.id=?2 AND r.owner_id=?3 AND r.status='open' AND r.expires_at>?4
    AND (SELECT COUNT(*) FROM room_members WHERE room_id=?2)=?7
    AND NOT EXISTS(SELECT 1 FROM room_members m LEFT JOIN lobby_members l ON l.room_id=m.room_id AND l.account_id=m.account_id LEFT JOIN chars c ON c.account_id=m.account_id
      WHERE m.room_id=?2 AND (m.last_seen<=?8 OR COALESCE(l.ready,0)<>1 OR c.flagged<>0 OR c.validation_status<>'verified' OR c.updated_at<?9 OR
      CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')<>'ctc' OR COALESCE(json_extract(c.snapshot,'$.sandbox'),0)<>0 ELSE 1 END))
    ${revisionChecks}`).bind(...values)];
  for(const r of roster)statements.push(db.prepare('INSERT INTO session_members(session_id,account_id,active,last_seen,connected_from) SELECT ?1,?2,1,?3,?3 WHERE EXISTS(SELECT 1 FROM combat_sessions WHERE id=?1)').bind(id,r.id,now));
  try{const result=await db.batch(statements);if(!result[0].meta.changes)throw new HttpError(409,'session_not_ready');}
  catch(e){if(requestId){const previous=await db.prepare('SELECT * FROM combat_sessions WHERE id=?1 AND creator_id=?2').bind(requestId,acc.id).first();if(previous)return previous;}const current=await db.prepare("SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE m.account_id=?1 AND m.active=1 AND s.status='active'").bind(acc.id).first();if(current&&current.room_id===room.id)return current;if(e instanceof HttpError)throw e;throw new HttpError(409,'session_member_busy');}
  return await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(id).first();
}
async function claim(db,row,account,now){
  const state=stateOf(row),actor=state.actors.find(a=>a.id===account),member=await db.prepare('SELECT withdrawn FROM session_members WHERE session_id=?1 AND account_id=?2').bind(row.id,account).first();
  if(row.status!=='completed'||!actor||member?.withdrawn||Object.values(actor.contribution).reduce((x,y)=>x+y,0)<=0)throw new HttpError(409,'session_reward_unavailable');
  const day=new Date(now).toISOString().slice(0,10),key='party:'+row.id;
  await db.batch([
    db.prepare(`INSERT INTO session_rewards(session_id,account_id,amount,day,created_at)
      SELECT ?1,?2,CASE WHEN ?3-ended_at<=86400000
      AND COALESCE((SELECT SUM(delta) FROM resource_ledger WHERE account_id=?2 AND mode='ctc' AND asset='merit'),0)<30
      AND COALESCE((SELECT SUM(delta) FROM resource_ledger WHERE account_id=?2 AND mode='ctc' AND asset='merit' AND day=?4 AND delta>0),0)<3 THEN 1 ELSE 0 END,?4,?3
      FROM combat_sessions WHERE id=?1 AND status='completed'
      AND EXISTS(SELECT 1 FROM session_members WHERE session_id=?1 AND account_id=?2 AND withdrawn=0)
      AND EXISTS(SELECT 1 FROM chars c WHERE c.account_id=?2 AND c.flagged=0 AND c.validation_status='verified' AND c.updated_at>=?5 AND CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')='ctc' AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ELSE 0 END)
      ON CONFLICT(session_id,account_id) DO NOTHING`).bind(row.id,account,now,day,now-30*864e5),
    db.prepare(`INSERT INTO resource_ledger(account_id,mode,asset,request_id,source,delta,day,created_at)
      SELECT account_id,'ctc','merit',?3,'party_completion',amount,day,created_at FROM session_rewards WHERE session_id=?1 AND account_id=?2 AND amount>0 AND changes()>0
      ON CONFLICT(account_id,mode,asset,request_id) DO NOTHING`).bind(row.id,account,key),
  ]);
  const receipt=await db.prepare('SELECT amount,day FROM session_rewards WHERE session_id=?1 AND account_id=?2').bind(row.id,account).first();if(!receipt)throw new HttpError(409,'session_reward_unavailable');return receipt;
}
export async function sessions(req,env,body,url=new URL(req.url)){
  const acc=await auth(req,env),db=env.DB,now=Date.now();
  const character=await db.prepare('SELECT snapshot,flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(acc.id).first();let saved;try{saved=JSON.parse(character?.snapshot);}catch{}
  if(!saved||saved.mode!=='ctc'||saved.sandbox)throw new HttpError(403,'session_mode_denied');
  const enabled=GAME.featureEnabled('party_combat','ctc',env.FEATURE_FLAGS,false);
  // Expiry and flag rollback release active locks, without deleting frozen state/receipts.
  const dungeonEnabled=GAME.featureEnabled('party_dungeon','ctc',env.FEATURE_FLAGS,false);
  await db.prepare("UPDATE combat_sessions SET status='aborted',ended_at=?2,revision=revision+1 WHERE status='active' AND (expires_at<=?2 OR ?3=0 OR (json_valid(state) AND json_extract(state,'$.activity')='dungeon' AND ?4=0)) AND EXISTS(SELECT 1 FROM session_members WHERE session_id=combat_sessions.id AND account_id=?1)").bind(acc.id,now,enabled?1:0,dungeonEnabled?1:0).run();
  await db.prepare("UPDATE session_members SET active=0 WHERE active=1 AND EXISTS(SELECT 1 FROM combat_sessions s JOIN session_members own ON own.session_id=s.id WHERE s.id=session_members.session_id AND s.status<>'active' AND own.account_id=?1)").bind(acc.id).run();
  if(!enabled)throw new HttpError(403,'feature_disabled');
  if(character.flagged||character.validation_status!=='verified'||!character.updated_at||character.updated_at<now-30*864e5)throw new HttpError(403,'session_locked');
  if(req.method==='POST'&&!await rateLimit(db,'sessions:'+acc.id,60,60))throw new HttpError(429,'rate_limited');
  if(req.method==='GET'&&!await rateLimit(db,'sessions-read:'+acc.id,180,60))throw new HttpError(429,'rate_limited');
  const action=body?.action;
  if(req.method==='POST'&&action!=='command'&&Object.keys(body||{}).some(k=>!['action','id',...(action==='create'?['activity']:[])].includes(k)))throw new HttpError(400,'forged_session_action');
  let id=req.method==='GET'?url.searchParams.get('id'):body?.id,row;
  if(action==='create')row=await create(env,acc,now,id,body.activity||'party');
  else if(id){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw new HttpError(400,'bad_session_id');row=await rowFor(db,id,acc.id);}
  else if(req.method==='GET')row=await db.prepare("SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE m.account_id=?1 AND m.active=1 ORDER BY s.created_at DESC LIMIT 1").bind(acc.id).first();
  else throw new HttpError(400,'bad_session_action');
  if(!row)return {session:null};
  row=await advance(db,row,now);
  if(req.method==='GET'){
    await db.prepare('UPDATE session_members SET connected_from=CASE WHEN last_seen<?3 THEN ?2 ELSE connected_from END,last_seen=?2 WHERE session_id=?1 AND account_id=?4 AND active=1 AND withdrawn=0').bind(row.id,now,now-IDLE,acc.id).run();
    return publicView(db,row,acc.id);
  }
  if(action==='create')return publicView(db,row,acc.id);
  if(action==='claim'){const receipt=await claim(db,row,acc.id,now);return {receipt,...await publicView(db,row,acc.id)};}
  if(action==='leave'){
    await db.prepare('UPDATE session_members SET withdrawn=1,active=0 WHERE session_id=?1 AND account_id=?2').bind(row.id,acc.id).run();
    if(!(await memberRows(db,row.id)).some(m=>m.active&&!m.withdrawn)){await db.prepare("UPDATE combat_sessions SET status='aborted',ended_at=?2,revision=revision+1 WHERE id=?1 AND status='active'").bind(row.id,now).run();await release(db,row.id);}
    return {left:true,session:null};
  }
  if(action!=='command')throw new HttpError(409,'session_not_active');
  const state=stateOf(row),actor=state.actors.find(a=>a.id===acc.id),member=await db.prepare('SELECT * FROM session_members WHERE session_id=?1 AND account_id=?2').bind(row.id,acc.id).first();
  if(Object.keys(body).some(k=>!['action','id','seq','tick','kind','target'].includes(k)))throw new HttpError(400,'forged_session_action');
  const {seq,tick,kind}=body,target=body.target||'boss';
  if(!Number.isSafeInteger(seq)||seq<1||seq>10000||!Number.isInteger(tick)||!['attack','guard','support'].includes(kind)||typeof target!=='string'||(kind==='support'?!state.actors.some(a=>a.id===target):target!=='boss'))throw new HttpError(400,'bad_session_command');
  const payload=JSON.stringify({tick,kind,target}),prior=await db.prepare('SELECT payload,scheduled_tick FROM session_actions WHERE session_id=?1 AND account_id=?2 AND seq=?3').bind(row.id,acc.id,seq).first();
  if(prior){if(prior.payload!==payload)throw new HttpError(409,'command_seq_reused');return {command:{seq,scheduled_tick:prior.scheduled_tick,replayed:true},...await publicView(db,row,acc.id)};}
  if(row.status!=='active'||!member?.active||member.withdrawn||!actor||actor.hp<=0)throw new HttpError(403,'session_actor_inactive');
  if(tick<state.tick-4||tick>state.tick+4||seq!==member.last_seq+1)throw new HttpError(409,'command_window','Lệnh quá trễ/tương lai hoặc thứ tự sai; tải trạng thái mới');
  const scheduled=Math.max(state.tick+1,tick),commandId=randomToken(12);
  const result=await db.batch([
    db.prepare(`INSERT INTO session_actions(id,session_id,account_id,seq,scheduled_tick,kind,target,payload,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM session_members m JOIN combat_sessions s ON s.id=m.session_id
      WHERE m.session_id=?2 AND m.account_id=?3 AND m.active=1 AND m.withdrawn=0 AND m.last_seq=?4-1 AND s.status='active' AND s.revision=?10)
      AND NOT EXISTS(SELECT 1 FROM session_actions WHERE session_id=?2 AND account_id=?3 AND created_at>?9-500)
      ON CONFLICT DO NOTHING`).bind(commandId,row.id,acc.id,seq,scheduled,kind,target,payload,now,row.revision),
    db.prepare('UPDATE session_members SET last_seq=?3,last_seen=?4,connected_from=CASE WHEN last_seen<?4-10000 THEN ?4 ELSE connected_from END WHERE session_id=?1 AND account_id=?2 AND changes()>0').bind(row.id,acc.id,seq,now),
  ]);
  if(!result[0].meta.changes){const retry=await db.prepare('SELECT payload,scheduled_tick FROM session_actions WHERE session_id=?1 AND account_id=?2 AND seq=?3').bind(row.id,acc.id,seq).first();if(!retry||retry.payload!==payload)throw new HttpError(409,'command_conflict');}
  return {command:{seq,scheduled_tick:scheduled},...await publicView(db,row,acc.id)};
}
