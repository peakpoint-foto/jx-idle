import {auth} from './account.js';
import {HttpError,randomToken} from './http.js';
import {rateLimit} from './db.js';
import {GAME} from '../gen/game.js';
import {duelProfile} from './duel_rules.js';
import {recordTrialResult,trialAttemptsToday,trialScore,trialSeed,trialWeekId,TRIAL_RULES} from './trial.js';
const IDLE=10000,TTL=300000,STEP=250,MAX_CATCHUP=8;
// Each mode owns its activities, ledger asset and reward source. PHLT co-op pays rescue marks in its own ledger, never CTC merit.
const SESSION_MODES=Object.freeze({
  ctc:{asset:'merit',activities:['party','dungeon','siege'],defaultActivity:'party',source:{party:'party_completion',dungeon:'party_completion',siege:'siege_completion'}},
  phlt:{asset:'rescue_mark',activities:['rescue','trial'],defaultActivity:'rescue',source:{rescue:'rescue_completion'}},
});
const ACTIVITY_FLAG={dungeon:'party_dungeon',siege:'party_siege',rescue:'coop_rescue',trial:'weekly_trial'};
const ACTIVITY_KINDS={siege:['attack','guard','support','capture','supply'],rescue:['attack','guard','support','rescue']};
// Siege quota: one active-or-completed siege per account per UTC week (Monday start, same week index as activity.js). Aborted sessions refund the attempt.
function utcWeekStart(now){const day=Math.floor(now/864e5);return(Math.floor((day+3)/7)*7-3)*864e5;}
const SIEGE_QUOTA_SQL="SELECT 1 AS used FROM combat_sessions q JOIN session_members qm ON qm.session_id=q.id WHERE q.status IN ('active','completed') AND q.created_at>=?2 AND json_valid(q.state) AND json_extract(q.state,'$.activity')='siege' AND qm.account_id IN (SELECT account_id FROM room_members WHERE room_id=?1) LIMIT 1";
async function siegeQuotaUsed(db,roomId,weekStart){return !!await db.prepare(SIEGE_QUOTA_SQL).bind(roomId,weekStart).first();}
function commandTargetOk(state,kind,target,self){
  if(kind==='support')return state.actors.some(a=>a.id===target);
  if(kind==='supply'||kind==='rescue')return target!==self&&state.actors.some(a=>a.id===target);
  if(kind==='capture')return !!state.objectives?.points?.some(p=>p.id===target);
  return target==='boss';
}
async function memberRows(db,id){return (await db.prepare('SELECT * FROM session_members WHERE session_id=?1 ORDER BY account_id').bind(id).all()).results;}
function stateOf(row){let state;try{state=JSON.parse(row.state);}catch{}if(!state||state.v!==1||state.model!==GAME.COMBAT_MODEL_VERSION||state.rules!==GAME.SESSION_COMBAT.version)throw new HttpError(409,'session_model_changed');return state;}
async function rowFor(db,id,account){
  const row=await db.prepare('SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE s.id=?1 AND m.account_id=?2').bind(id,account).first();
  if(!row)throw new HttpError(404,'session_not_found');return row;
}
async function release(db,id){await db.prepare("UPDATE session_members SET active=0 WHERE session_id=?1 AND EXISTS(SELECT 1 FROM combat_sessions WHERE id=?1 AND status<>'active')").bind(id).run();}
async function recordIfTrial(db,row){
  if(typeof row.state!=='string'||!row.state.includes('"activity":"trial"'))return;
  let state;try{state=JSON.parse(row.state);}catch{return;}
  await recordTrialResult(db,row.id,state);
}
async function advance(db,row,now){
  if(row.status!=='active'){await release(db,row.id);await recordIfTrial(db,row);return row;}
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
  if(result[0].meta.changes&&done){await release(db,row.id);if(state.activity==='trial')await recordTrialResult(db,row.id,state,now);}
  return await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(row.id).first();
}
async function publicView(db,row,account){
  const state=stateOf(row),members=await memberRows(db,row.id),self=members.find(m=>m.account_id===account);
  const reward=await db.prepare('SELECT amount,day FROM session_rewards WHERE session_id=?1 AND account_id=?2').bind(row.id,account).first();
  return {session:{id:row.id,room_id:row.room_id,status:row.status,revision:row.revision,created_at:row.created_at,expires_at:row.expires_at,tick:state.tick,
    model:state.model,rules:state.rules,mode:state.mode,activity:state.activity||'party',objectives:state.objectives||null,boss:{hp:state.boss.hp,max:state.boss.max,stun:state.boss.stun,ward:state.boss.ward||0,wardPhase:state.boss.wardPhase||0,gate:state.boss.gate||0},
    actors:state.actors.map(a=>({id:a.id,name:a.name,role:a.role,hp:a.hp,maxHp:a.p.life,mp:a.mp,maxMp:a.p.mana,contribution:a.contribution,withdrawn:!!a.withdrawn,down:a.hp<=0&&a.downedUntil>0&&!a.withdrawn?a.downedUntil:0,rescued:a.rescued||0,
      connected:members.some(m=>m.account_id===a.id&&m.active&&m.last_seen>Date.now()-IDLE)})),events:state.events.slice(-32),next_seq:(self?.last_seq||0)+1,
    trial:state.trial?{...state.trial,score:trialScore(state)}:null,
    reward,transport:'polling',step_ms:STEP,catchup_max:MAX_CATCHUP,loot_policy:state.activity==='trial'?'Weekly trial: no reward. The server simulates the run and records your best score for the week on the PHLT board.':state.mode==='phlt'?'Rescue marks only (PHLT ledger, never CTC merit): 1 per completed run, +1 if you rescued an ally. Cap 3/day UTC, wallet 30; contribution required, withdrawn ineligible. No loot and no supplies: PHLT has no server-owned inventory.':'Server merit only; no offline gold/items. Shared earned cap3/day UTC, wallet30; contribution required, withdrawn ineligible.'}};
}
async function create(env,acc,now,requestId,activity,mode,length){
  const db=env.DB;
  if(requestId!=null){
    if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))throw new HttpError(400,'bad_session_id');
    const previous=await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(requestId).first();
    if(previous){if(previous.creator_id!==acc.id)throw new HttpError(403,'session_leader_required');const prior=stateOf(previous);if((prior.activity||'party')!==activity)throw new HttpError(409,'session_activity_conflict');return previous;}
  }
  if(!SESSION_MODES[mode]?.activities.includes(activity))throw new HttpError(400,'bad_session_activity');
  if(activity==='trial'&&!Object.prototype.hasOwnProperty.call(GAME.SESSION_TRIAL.lengths,length))throw new HttpError(400,'bad_trial_length');
  if(ACTIVITY_FLAG[activity]&&!GAME.featureEnabled(ACTIVITY_FLAG[activity],mode,env.FEATURE_FLAGS,false))throw new HttpError(403,'feature_disabled');
  if(!GAME.featureEnabled('party_lobby',mode,env.FEATURE_FLAGS,false))throw new HttpError(403,'lobby_required');
  const room=await db.prepare("SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.account_id=?1 AND r.status='open' AND r.expires_at>?2 AND r.mode=?3").bind(acc.id,now,mode).first();
  if(!room||room.owner_id!==acc.id)throw new HttpError(403,'session_leader_required');
  const roster=(await db.prepare(`SELECT a.id,a.name,a.play_sec,c.*,m.last_seen,l.role,l.ready FROM room_members m JOIN accounts a ON a.id=m.account_id JOIN chars c ON c.account_id=a.id JOIN lobby_members l ON l.room_id=m.room_id AND l.account_id=m.account_id WHERE m.room_id=?1 ORDER BY a.id`).bind(room.id).all()).results;
  if(activity==='trial'&&roster.length>1)throw new HttpError(409,'trial_solo_only');
  if(roster.length<(activity==='trial'?1:2)||roster.length>(activity==='trial'?1:4)||roster.some(r=>!r.ready||r.last_seen<=now-35000||r.flagged||r.validation_status!=='verified'||r.updated_at<now-30*864e5))throw new HttpError(409,'session_not_ready');
  const weekStart=utcWeekStart(now);
  if(activity==='siege'){
    // A repeated create must return the caller's own live session before the weekly quota is consulted (the live run itself counts toward the quota).
    const current=await db.prepare("SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE m.account_id=?1 AND m.active=1 AND s.status='active' AND s.room_id=?2").bind(acc.id,room.id).first();
    if(current)return current;
    if(await siegeQuotaUsed(db,room.id,weekStart))throw new HttpError(409,'siege_quota_used');
  }
  if(activity==='trial'){
    const current=await db.prepare("SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE m.account_id=?1 AND m.active=1 AND s.status='active' AND s.room_id=?2").bind(acc.id,room.id).first();
    if(current)return current;
    if(await trialAttemptsToday(db,acc.id,now)>=TRIAL_RULES.attemptsPerDay)throw new HttpError(409,'trial_attempts_used');
  }
  const actors=roster.map(r=>{
    duelProfile(r,mode);const previous=GAME.getS();try{GAME.setS(JSON.parse(r.snapshot));return GAME.sessionActor(r.id,r.name,GAME.calc(),r.role);}finally{GAME.setS(previous);}
  });
  const seed=crypto.getRandomValues(new Uint32Array(1))[0],id=requestId||randomToken(12),state=GAME.sessionCombatNew(mode,actors,activity==='trial'?trialSeed(trialWeekId(now)):seed,activity,activity==='trial'?{week:trialWeekId(now),length}:undefined);
  const values=[id,room.id,acc.id,now,now+TTL,JSON.stringify(state),roster.length,now-35000,now-30*864e5];
  values.push(mode);
  if(activity==='siege')values.push(weekStart);
  if(activity==='trial')values.push(now-now%864e5,TRIAL_RULES.attemptsPerDay);
  const quotaClause=activity==='siege'?" AND NOT EXISTS(SELECT 1 FROM combat_sessions q JOIN session_members qm ON qm.session_id=q.id WHERE q.status IN ('active','completed') AND q.created_at>=?11 AND json_valid(q.state) AND json_extract(q.state,'$.activity')='siege' AND qm.account_id IN (SELECT account_id FROM room_members WHERE room_id=?2))":'';
  const trialClause=activity==='trial'?" AND (SELECT COUNT(*) FROM combat_sessions q JOIN session_members qm ON qm.session_id=q.id WHERE qm.account_id=?3 AND q.created_at>=?11 AND json_valid(q.state) AND json_extract(q.state,'$.activity')='trial')<?12":'';
  let revisionChecks='';for(const r of roster){values.push(r.id,r.sync_rev);revisionChecks+=` AND EXISTS(SELECT 1 FROM chars WHERE account_id=?${values.length-1} AND sync_rev=?${values.length})`;}
  const statements=[db.prepare(`INSERT INTO combat_sessions(id,room_id,creator_id,created_at,expires_at,state,status)
    SELECT ?1,?2,?3,?4,?5,?6,'active' FROM rooms r WHERE r.id=?2 AND r.owner_id=?3 AND r.status='open' AND r.expires_at>?4 AND r.mode=?10
    AND (SELECT COUNT(*) FROM room_members WHERE room_id=?2)=?7
    AND NOT EXISTS(SELECT 1 FROM room_members m LEFT JOIN lobby_members l ON l.room_id=m.room_id AND l.account_id=m.account_id LEFT JOIN chars c ON c.account_id=m.account_id
      WHERE m.room_id=?2 AND (m.last_seen<=?8 OR COALESCE(l.ready,0)<>1 OR c.flagged<>0 OR c.validation_status<>'verified' OR c.updated_at<?9 OR
      CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')<>?10 OR COALESCE(json_extract(c.snapshot,'$.sandbox'),0)<>0 ELSE 1 END))
    ${quotaClause}${trialClause}${revisionChecks}`).bind(...values)];
  for(const r of roster)statements.push(db.prepare('INSERT INTO session_members(session_id,account_id,active,last_seen,connected_from) SELECT ?1,?2,1,?3,?3 WHERE EXISTS(SELECT 1 FROM combat_sessions WHERE id=?1)').bind(id,r.id,now));
  try{const result=await db.batch(statements);if(!result[0].meta.changes){if(activity==='siege'&&await siegeQuotaUsed(db,room.id,weekStart))throw new HttpError(409,'siege_quota_used');if(activity==='trial'&&await trialAttemptsToday(db,acc.id,now)>=TRIAL_RULES.attemptsPerDay)throw new HttpError(409,'trial_attempts_used');throw new HttpError(409,'session_not_ready');}}
  catch(e){if(requestId){const previous=await db.prepare('SELECT * FROM combat_sessions WHERE id=?1 AND creator_id=?2').bind(requestId,acc.id).first();if(previous)return previous;}const current=await db.prepare("SELECT s.* FROM combat_sessions s JOIN session_members m ON m.session_id=s.id WHERE m.account_id=?1 AND m.active=1 AND s.status='active'").bind(acc.id).first();if(current&&current.room_id===room.id)return current;if(e instanceof HttpError)throw e;throw new HttpError(409,'session_member_busy');}
  return await db.prepare('SELECT * FROM combat_sessions WHERE id=?1').bind(id).first();
}
async function claim(db,row,account,now){
  const state=stateOf(row),actor=state.actors.find(a=>a.id===account),member=await db.prepare('SELECT withdrawn FROM session_members WHERE session_id=?1 AND account_id=?2').bind(row.id,account).first();
  if(row.status!=='completed'||!actor||member?.withdrawn||Object.values(actor.contribution).reduce((x,y)=>x+y,0)<=0)throw new HttpError(409,'session_reward_unavailable');
  const cfg=SESSION_MODES[state.mode];if(!cfg||!cfg.source[state.activity])throw new HttpError(409,'session_reward_unavailable');
  const day=new Date(now).toISOString().slice(0,10),key='party:'+row.id,source=cfg.source[state.activity],want=state.activity==='rescue'&&actor.contribution.rescue>0?2:1;
  await db.batch([
    db.prepare(`INSERT INTO session_rewards(session_id,account_id,amount,day,created_at)
      SELECT ?1,?2,CASE WHEN ?3-ended_at<=86400000 THEN MAX(0,MIN(?8,
        3-COALESCE((SELECT SUM(delta) FROM resource_ledger WHERE account_id=?2 AND mode=?6 AND asset=?7 AND day=?4 AND delta>0),0),
        30-COALESCE((SELECT SUM(delta) FROM resource_ledger WHERE account_id=?2 AND mode=?6 AND asset=?7),0))) ELSE 0 END,?4,?3
      FROM combat_sessions WHERE id=?1 AND status='completed'
      AND EXISTS(SELECT 1 FROM session_members WHERE session_id=?1 AND account_id=?2 AND withdrawn=0)
      AND EXISTS(SELECT 1 FROM chars c WHERE c.account_id=?2 AND c.flagged=0 AND c.validation_status='verified' AND c.updated_at>=?5 AND CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')=?6 AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ELSE 0 END)
      ON CONFLICT(session_id,account_id) DO NOTHING`).bind(row.id,account,now,day,now-30*864e5,state.mode,cfg.asset,want),
    db.prepare(`INSERT INTO resource_ledger(account_id,mode,asset,request_id,source,delta,day,created_at)
      SELECT account_id,?5,?6,?3,?4,amount,day,created_at FROM session_rewards WHERE session_id=?1 AND account_id=?2 AND amount>0 AND changes()>0
      ON CONFLICT(account_id,mode,asset,request_id) DO NOTHING`).bind(row.id,account,key,source,state.mode,cfg.asset),
  ]);
  const receipt=await db.prepare('SELECT amount,day FROM session_rewards WHERE session_id=?1 AND account_id=?2').bind(row.id,account).first();if(!receipt)throw new HttpError(409,'session_reward_unavailable');return receipt;
}
export async function sessions(req,env,body,url=new URL(req.url)){
  const acc=await auth(req,env),db=env.DB,now=Date.now();
  const character=await db.prepare('SELECT snapshot,flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(acc.id).first();let saved;try{saved=JSON.parse(character?.snapshot);}catch{}
  if(!saved||!SESSION_MODES[saved.mode]||saved.sandbox)throw new HttpError(403,'session_mode_denied');
  const mode=saved.mode;
  const enabled=GAME.featureEnabled('party_combat',mode,env.FEATURE_FLAGS,false);
  // Expiry and flag rollback release active locks, without deleting frozen state/receipts.
  const dungeonEnabled=GAME.featureEnabled('party_dungeon','ctc',env.FEATURE_FLAGS,false),siegeEnabled=GAME.featureEnabled('party_siege','ctc',env.FEATURE_FLAGS,false),rescueEnabled=GAME.featureEnabled('coop_rescue','phlt',env.FEATURE_FLAGS,false);
  await db.prepare("UPDATE combat_sessions SET status='aborted',ended_at=?2,revision=revision+1 WHERE status='active' AND (expires_at<=?2 OR ?3=0 OR (json_valid(state) AND json_extract(state,'$.activity')='dungeon' AND ?4=0) OR (json_valid(state) AND json_extract(state,'$.activity')='siege' AND ?5=0) OR (json_valid(state) AND json_extract(state,'$.activity')='rescue' AND ?6=0)) AND EXISTS(SELECT 1 FROM session_members WHERE session_id=combat_sessions.id AND account_id=?1)").bind(acc.id,now,enabled?1:0,dungeonEnabled?1:0,siegeEnabled?1:0,rescueEnabled?1:0).run();
  await db.prepare("UPDATE session_members SET active=0 WHERE active=1 AND EXISTS(SELECT 1 FROM combat_sessions s JOIN session_members own ON own.session_id=s.id WHERE s.id=session_members.session_id AND s.status<>'active' AND own.account_id=?1)").bind(acc.id).run();
  if(!enabled)throw new HttpError(403,'feature_disabled');
  if(character.flagged||character.validation_status!=='verified'||!character.updated_at||character.updated_at<now-30*864e5)throw new HttpError(403,'session_locked');
  if(req.method==='POST'&&!await rateLimit(db,'sessions:'+acc.id,60,60))throw new HttpError(429,'rate_limited');
  if(req.method==='GET'&&!await rateLimit(db,'sessions-read:'+acc.id,180,60))throw new HttpError(429,'rate_limited');
  const action=body?.action;
  if(req.method==='POST'&&action!=='command'&&Object.keys(body||{}).some(k=>!['action','id',...(action==='create'?['activity','length']:[])].includes(k)))throw new HttpError(400,'forged_session_action');
  if(body?.length!==undefined&&body.activity!=='trial')throw new HttpError(400,'forged_session_action');
  let id=req.method==='GET'?url.searchParams.get('id'):body?.id,row;
  if(action==='create')row=await create(env,acc,now,id,body.activity||SESSION_MODES[mode].defaultActivity,mode,body.length);
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
  if(!Number.isSafeInteger(seq)||seq<1||seq>10000||!Number.isInteger(tick)||!(ACTIVITY_KINDS[state.activity]||['attack','guard','support']).includes(kind)||typeof target!=='string'||!commandTargetOk(state,kind,target,acc.id))throw new HttpError(400,'bad_session_command');
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
