import { HttpError, randomToken } from "./http.js";
import { auth, cleanName } from "./account.js";
import { rateLimit } from "./db.js";
import { manageGuild } from "./guild_management.js";
import {partyRoom} from './lobby.js';
import {GAME} from '../gen/game.js';
import {DUEL_RULES,advancedDuels,duelProfile,checkDuelMatch,duelOutcome,duelFactor} from './duel_rules.js';

const DUEL_TTL = 3 * 864e5;
const ROOM_TTL = 2 * 3600e3;
const ROOM_IDLE = 35e3;
const BOSS_MAX = 1_000_000;
import {GUILD_BOSS_RULES, guildBossWeekId, guildBossSeed, simulateGuildBossAttack, guildBossMilestones} from './guild_boss.js';
const GUILD_MAX_MEMBERS = 30;

const weekKey = (t = Date.now()) => String(Math.floor(t / (7 * 864e5)));
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

function safeGuildName(value) {
  const s = String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N} _.\-]{3,24}$/u.test(s))
    throw new HttpError(400, "bad_guild_name", "Tên bang 3–24 ký tự, chỉ chữ, số, khoảng trắng và . _ -");
  return s;
}

async function charFor(db, accountId) {
  const row = await db.prepare(
    "SELECT a.id,a.name,a.play_sec,c.fac,c.sync_rev,c.snapshot,c.power,c.bracket,c.lvl,c.flagged,c.validation_status,c.updated_at FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.id=?1"
  ).bind(accountId).first();
  if (!row) throw new HttpError(404, "no_character");
  return row;
}

function requireVerified(row) {
  if (row.flagged || row.validation_status !== "verified" || !row.updated_at || row.updated_at < Date.now()-30*864e5)
    throw new HttpError(403,"ranked_locked","Nhân vật cần đồng bộ và được xác minh trước khi tham gia");
}

async function limitWrites(db, scope, id) {
  if (!(await rateLimit(db,scope+":"+id,60,60))) throw new HttpError(429,"rate_limited");
}

function hashSeed(seed, side) {
  let h = 2166136261;
  for (const c of `${seed}:${side}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function duelView(row, accountId) {
  const incoming = row.defender_id === accountId;
  return {
    id: row.id,
    season: row.season,
    direction: incoming ? "incoming" : "outgoing",
    opponent: incoming ? row.challenger_name : row.defender_name,
    challenger: row.challenger_name,
    defender: row.defender_name,
    challenger_power: row.challenger_power,
    defender_power: row.defender_power,
    status: row.status,
    winner: row.winner_id === row.challenger_id ? row.challenger_name : row.winner_id === row.defender_id ? row.defender_name : null,
    challenger_score: row.challenger_score,
    defender_score: row.defender_score,
    created_at: row.created_at,
    expires_at: row.expires_at,
    kind:row.kind||'ranked',rules_version:row.rules_version||'legacy-power-v1',combat_version:row.combat_version||null,
    explanation:row.status==='resolved'?{algorithm:'power_estimate',challenger_factor:duelFactor(row.id,'c'),defender_factor:duelFactor(row.id,'d'),tie:!row.winner_id,ranked:row.kind!=='friendly'}:null,
  };
}

async function duelList(db, accountId, advanced=false) {
  const now=Date.now(),season=weekKey(now);
  await db.prepare("UPDATE duels SET status='expired',resolved_at=?2 WHERE status='pending' AND (challenger_id=?1 OR defender_id=?1) AND (expires_at<=?2 OR (season<>?3 AND EXISTS(SELECT 1 FROM duel_meta m WHERE m.duel_id=duels.id AND m.kind='ranked' AND m.rules_version='power-v2')))").bind(accountId,now,season).run();
  const rows = await db.prepare(
    `SELECT d.*,m.kind,m.rules_version,m.combat_version FROM duels d LEFT JOIN duel_meta m ON m.duel_id=d.id WHERE d.challenger_id=?1 OR d.defender_id=?1
     ORDER BY CASE WHEN d.status='pending' THEN 0 ELSE 1 END, d.created_at DESC LIMIT 30`
  ).bind(accountId).all();
  const score = await db.prepare(
    "SELECT points,wins,losses FROM duel_scores WHERE account_id=?1 AND season=?2"
  ).bind(accountId, weekKey()).first();
  const draws=await db.prepare("SELECT COUNT(*) AS n FROM duels d JOIN duel_meta m ON m.duel_id=d.id WHERE d.season=?2 AND d.status='resolved' AND d.winner_id IS NULL AND m.kind='ranked' AND (d.challenger_id=?1 OR d.defender_id=?1)").bind(accountId,season).first();
  let matches=[],rankedReady=false;
  if(advanced){try{
    let me=await charFor(db,accountId);requireVerified(me);me=duelProfile(me);rankedReady=!!me.bracket;
    if(rankedReady)matches=(await db.prepare("SELECT a.name,c.lvl,c.power,c.bracket FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.id<>?1 AND c.mode='ctc' AND c.bracket=?2 AND c.validation_status='verified' AND c.flagged=0 AND c.updated_at>=?3 AND c.power BETWEEN ?4 AND ?5 AND json_extract(c.snapshot,'$.mode')='ctc' AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ORDER BY ABS(c.power-?6) LIMIT 10").bind(accountId,me.bracket,now-30*864e5,me.power/DUEL_RULES.powerRatio,me.power*DUEL_RULES.powerRatio,me.power).all()).results;
  }catch(e){if(!(e instanceof HttpError))throw e;}}
  return { season,season_start:Number(season)*7*864e5,season_end:(Number(season)+1)*7*864e5,ttl_ms:DUEL_TTL,pair_daily_cap:advanced?DUEL_RULES.pairDaily:null,
    ranked_ready:rankedReady,matches,score: {...(score || { points: 0, wins: 0, losses: 0 }),draws:draws?.n||0}, duels: rows.results.map(r => duelView(r, accountId)) };
}

async function resolveDuel(db, row) {
  const outcome=duelOutcome(row),cScore=outcome.challenger_score,dScore=outcome.defender_score,winner=outcome.winner;
  const now = Date.now();
  const season = row.season;
  await db.batch([
    db.prepare(
      `INSERT INTO duel_scores(account_id,season,points,wins,losses)
       SELECT ?1,?2,?4,?5,?6 WHERE ?7='ranked' AND EXISTS(SELECT 1 FROM duels WHERE id=?3 AND status='resolving')
       ON CONFLICT(account_id,season) DO UPDATE SET points=points+excluded.points,wins=wins+excluded.wins,losses=losses+excluded.losses`
    ).bind(row.challenger_id,season,row.id,outcome.tie?1:winner===row.challenger_id?3:1,outcome.tie?0:winner===row.challenger_id?1:0,outcome.tie?0:winner===row.challenger_id?0:1,row.kind||'ranked'),
    db.prepare(
      `INSERT INTO duel_scores(account_id,season,points,wins,losses)
       SELECT ?1,?2,?4,?5,?6 WHERE ?7='ranked' AND EXISTS(SELECT 1 FROM duels WHERE id=?3 AND status='resolving')
       ON CONFLICT(account_id,season) DO UPDATE SET points=points+excluded.points,wins=wins+excluded.wins,losses=losses+excluded.losses`
    ).bind(row.defender_id,season,row.id,outcome.tie?1:winner===row.defender_id?3:1,outcome.tie?0:winner===row.defender_id?1:0,outcome.tie?0:winner===row.defender_id?0:1,row.kind||'ranked'),
    db.prepare(
      `UPDATE duels SET status='resolved',winner_id=?2,challenger_score=?3,defender_score=?4,resolved_at=?5
       WHERE id=?1 AND status='resolving'`
    ).bind(row.id, winner, cScore, dScore, now),
  ]);
  return { winner, challenger_score: cScore, defender_score: dScore };
}

export async function duels(req, env, body, url) {
  const acc=await auth(req,env);
  let me=await charFor(env.DB,acc.id);
  const advanced=advancedDuels(env,me);
  const list=()=>duelList(env.DB,acc.id,advanced);
  if(req.method==="GET")return list();
  await limitWrites(env.DB,"duel",acc.id);
  const action=String(body&&body.action||"");
  if(action==="challenge"){
    const kind=String(body.kind||"ranked");
    if(!["friendly","ranked"].includes(kind))throw new HttpError(400,"bad_duel_kind");
    if(!advanced&&kind==="friendly")throw new HttpError(403,"feature_disabled");
    const targetName=cleanName(body.opponent);
    let target=await env.DB.prepare("SELECT a.id,a.name,a.play_sec,c.fac,c.sync_rev,c.snapshot,c.power,c.bracket,c.lvl,c.flagged,c.validation_status,c.updated_at FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.name=?1 COLLATE NOCASE").bind(targetName).first();
    if(!target)throw new HttpError(404,"opponent_not_found");
    if(target.id===acc.id)throw new HttpError(400,"self_duel");
    requireVerified(me);requireVerified(target);
    if(advanced){
      me=duelProfile(me);target=duelProfile(target);checkDuelMatch(me,target,kind);
    }else if(!me.bracket||me.bracket!==target.bracket)throw new HttpError(400,"different_bracket");
    const now=Date.now(),id=randomToken(12),dayStart=Math.floor(now/864e5)*864e5;
    const insert=env.DB.prepare(`INSERT INTO duels(id,season,challenger_id,defender_id,challenger_name,defender_name,challenger_power,defender_power,
      challenger_bracket,defender_bracket,challenger_snapshot,defender_snapshot,status,created_at,expires_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'pending',?13,?14
      WHERE NOT EXISTS(SELECT 1 FROM duels WHERE status IN ('pending','resolving') AND expires_at>?13
        AND ((challenger_id=?3 AND defender_id=?4) OR (challenger_id=?4 AND defender_id=?3)))
      AND (?15=0 OR (
        EXISTS(SELECT 1 FROM chars WHERE account_id=?3 AND sync_rev=?16 AND flagged=0 AND validation_status='verified' AND updated_at>=?18)
        AND EXISTS(SELECT 1 FROM chars WHERE account_id=?4 AND sync_rev=?17 AND flagged=0 AND validation_status='verified' AND updated_at>=?18)
        AND (?19='friendly' OR (SELECT COUNT(*) FROM duels d JOIN duel_meta m ON m.duel_id=d.id
          WHERE m.kind='ranked' AND d.created_at>=?20 AND ((d.challenger_id=?3 AND d.defender_id=?4) OR (d.challenger_id=?4 AND d.defender_id=?3)))<?21)))`)
      .bind(id,weekKey(now),acc.id,target.id,me.name,target.name,me.power||0,target.power||0,
        me.bracket,target.bracket,me.snapshot,target.snapshot,now,now+DUEL_TTL,advanced?1:0,
        me.sync_rev,target.sync_rev,now-30*864e5,kind,dayStart,DUEL_RULES.pairDaily);
    const results=await env.DB.batch(advanced?[insert,env.DB.prepare(`INSERT INTO duel_meta(duel_id,kind,rules_version,combat_version,challenger_rev,defender_rev)
      SELECT ?1,?2,?3,?4,?5,?6 WHERE changes()>0`).bind(id,kind,DUEL_RULES.version,GAME.COMBAT_MODEL_VERSION,me.sync_rev,target.sync_rev)]:[insert]);
    if(!results[0].meta.changes)throw new HttpError(409,advanced?"duel_unavailable":"duel_exists","Cặp đang có trận, đã hết lượt ranked hôm nay hoặc snapshot vừa thay đổi; hãy tải lại");
    return {ok:true,duel:{id,opponent:target.name,status:"pending",expires_at:now+DUEL_TTL,kind,rules_version:advanced?DUEL_RULES.version:"legacy-power-v1"}};
  }
  const id=String(body&&body.id||"");
  if(!id)throw new HttpError(400,"missing_duel");
  const row=await env.DB.prepare("SELECT d.*,m.kind,m.rules_version,m.combat_version,m.challenger_rev,m.defender_rev FROM duels d LEFT JOIN duel_meta m ON m.duel_id=d.id WHERE d.id=?1").bind(id).first();
  if(!row)throw new HttpError(404,"duel_not_found");
  if(row.defender_id!==acc.id)throw new HttpError(403,"duel_forbidden");
  if(action==="decline"){
    if(row.status==="pending")await env.DB.prepare("UPDATE duels SET status='declined',resolved_at=?2 WHERE id=?1 AND status='pending'").bind(id,Date.now()).run();
    return list();
  }
  if(action!=="accept")throw new HttpError(400,"bad_duel_action");
  if(!["pending","resolving"].includes(row.status))return list();
  const v2=row.rules_version===DUEL_RULES.version,now=Date.now();
  if(row.status==="pending"&&(row.expires_at<=now||(v2&&row.kind==="ranked"&&row.season!==weekKey(now)))){
    await env.DB.prepare("UPDATE duels SET status='expired',resolved_at=?2 WHERE id=?1 AND status='pending'").bind(id,now).run();
    return list();
  }
  let challenger=await charFor(env.DB,row.challenger_id);
  requireVerified(me);requireVerified(challenger);
  if(v2){
    if(!advanced)throw new HttpError(403,"feature_disabled");
    if(row.combat_version!==GAME.COMBAT_MODEL_VERSION)throw new HttpError(409,"combat_version_changed");
    me=duelProfile(me);challenger=duelProfile(challenger);
    // Verify frozen snapshots as well as current eligibility. Later syncs never change this offer's build.
    for(const [account,snapshot,power] of [[challenger,row.challenger_snapshot,row.challenger_power],[me,row.defender_snapshot,row.defender_power]]){
      let state;try{state=JSON.parse(snapshot);}catch(e){throw new HttpError(403,"snapshot_invalid");}
      if(!state||typeof state!=="object")throw new HttpError(403,"snapshot_invalid");
      const frozen=duelProfile({...account,snapshot,fac:state.fac,lvl:state.lvl});
      if(frozen.power!==power)throw new HttpError(403,"snapshot_invalid");
    }
  }
  if(row.status==="resolving")return {ok:true,result:await resolveDuel(env.DB,row),...await list()};
  const claimed=await env.DB.prepare(`UPDATE duels SET status='resolving' WHERE id=?1 AND status='pending' AND expires_at>?2
    AND (?3=0 OR (EXISTS(SELECT 1 FROM chars WHERE account_id=?4 AND sync_rev=?5 AND flagged=0 AND validation_status='verified' AND updated_at>=?8)
      AND EXISTS(SELECT 1 FROM chars WHERE account_id=?6 AND sync_rev=?7 AND flagged=0 AND validation_status='verified' AND updated_at>=?8)))`)
    .bind(id,now,v2?1:0,acc.id,me.sync_rev,challenger.id,challenger.sync_rev,now-30*864e5).run();
  if(!claimed.meta.changes)return list();
  return {ok:true,result:await resolveDuel(env.DB,row),...await list()};
}
async function guildFor(db, accountId) {
  return db.prepare(
    `SELECT g.*,m.account_id,m.role,m.contrib,m.weekly_damage,m.attack_day,m.attack_count
     FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.account_id=?1`
  ).bind(accountId).first();
}

async function refreshGuildWeek(db, guildRow) {
  const wk = weekKey();
  if (guildRow.week === wk) return guildRow;
  await db.batch([
    db.prepare(`UPDATE guilds SET week=?2,
      boss_max_hp=MAX(?4,?4*(SELECT COUNT(*) FROM guild_members WHERE guild_id=?1)),
      boss_hp=boss_max_hp,updated_at=?3 WHERE id=?1 AND week<>?2`)
      .bind(guildRow.id, wk, Date.now(), GUILD_BOSS_RULES.hpPerMember),
    db.prepare("UPDATE guild_members SET weekly_damage=0,attack_day=NULL,attack_count=0 WHERE guild_id=?1 AND changes()>0").bind(guildRow.id),
  ]);
  return {...guildRow,...await db.prepare(`SELECT g.*,m.role,m.contrib,m.weekly_damage,m.attack_day,m.attack_count
    FROM guilds g JOIN guild_members m ON m.guild_id=g.id WHERE g.id=?1 AND m.account_id=?2`).bind(guildRow.id,guildRow.account_id).first()};
}

async function guildView(db, accountId) {
  let g = await guildFor(db, accountId);
  if (!g) return { guild: null, suggestions: (await db.prepare("SELECT id,name,level,xp,boss_hp,boss_max_hp FROM guilds ORDER BY level DESC,xp DESC LIMIT 20").all()).results };
  g = await refreshGuildWeek(db, g);
  const members = await db.prepare(
    `SELECT a.id AS account_id,a.name,c.lvl,c.power,m.role,m.contrib,m.weekly_damage
     FROM guild_members m JOIN accounts a ON a.id=m.account_id JOIN chars c ON c.account_id=a.id
     WHERE m.guild_id=?1 ORDER BY m.role='owner' DESC,m.contrib DESC LIMIT 30`
  ).bind(g.id).all();
  return {
    guild: {
      id: g.id,name: g.name,level: g.level,xp: g.xp,boss_hp: g.boss_hp,boss_max_hp: g.boss_max_hp,
      role: g.role,contrib: g.contrib,weekly_damage: g.weekly_damage,attack_count: (await db.prepare('SELECT COUNT(*) AS n FROM boss_receipts WHERE account_id=?1 AND day=?2').bind(accountId,dayKey()).first()).n,
      week: g.week,
      boss_milestones: guildBossMilestones(g.boss_hp, g.boss_max_hp),
      boss_rules: {attemptsPerDay: GUILD_BOSS_RULES.attemptsPerDay, milestones: GUILD_BOSS_RULES.milestones},
    },
    members: members.results,
    logs:(await db.prepare('SELECT l.action,l.target_id,l.created_at,a.name AS actor FROM guild_logs l LEFT JOIN accounts a ON a.id=l.account_id WHERE l.guild_id=?1 ORDER BY l.created_at DESC LIMIT 40').bind(g.id).all()).results,
    calendar:(await db.prepare('SELECT id,title,activity,starts_at FROM guild_calendar WHERE guild_id=?1 AND cancelled=0 AND starts_at>=?2 ORDER BY starts_at LIMIT 10').bind(g.id,Date.now()-864e5).all()).results,
    contribution_source:"verified_snapshot_boss_receipts",
  };
}

export async function guild(req, env, body) {
  const acc = await auth(req, env);
  if (req.method === "GET") return guildView(env.DB, acc.id);
  await limitWrites(env.DB,"guild",acc.id);
  const action = String(body && body.action || "");
  const me = await charFor(env.DB, acc.id);
  const current = await guildFor(env.DB, acc.id);
  const managed=await manageGuild(env,acc,current,me,body,guildView);
  if(managed)return managed;

  if (action === "create") {
    if (current) throw new HttpError(409, "already_in_guild", "Bạn đã ở trong bang hội");
    const name = safeGuildName(body.name);
    const now = Date.now(), id = randomToken(9), wk = weekKey(now);
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO guilds(id,name,owner_id,week,boss_hp,boss_max_hp,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5,?6,?6)").bind(id,name,acc.id,wk,BOSS_MAX,now),
        env.DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES(?1,?2,'owner',?3,?3)").bind(id,acc.id,now),
      ]);
    } catch (e) {
      if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, "guild_name_taken", "Tên bang đã có người dùng");
      throw e;
    }
    return guildView(env.DB, acc.id);
  }
  if (action === "join") {
    if (current) throw new HttpError(409, "already_in_guild", "Bạn đã ở trong bang hội");
    const name = safeGuildName(body.name);
    const target = await env.DB.prepare("SELECT * FROM guilds WHERE name=?1 COLLATE NOCASE").bind(name).first();
    if (!target) throw new HttpError(404, "guild_not_found");
    const joined = await env.DB.prepare(`INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen)
      SELECT ?1,?2,'member',?3,?3 WHERE (SELECT COUNT(*) FROM guild_members WHERE guild_id=?1)<?4
      AND NOT EXISTS(SELECT 1 FROM guild_members WHERE account_id=?2)`)
      .bind(target.id,acc.id,Date.now(),GUILD_MAX_MEMBERS).run();
    if (!joined.meta.changes) throw new HttpError(409,"guild_full","Bang đã đủ người hoặc bạn đã vào bang khác");
    return guildView(env.DB, acc.id);
  }
  if (!current) throw new HttpError(400, "not_in_guild", "Bạn chưa ở trong bang hội");
  const g = await refreshGuildWeek(env.DB, current);
  if (action === "leave") {
    if (g.role === "owner") throw new HttpError(400, "owner_cannot_leave", "Chủ bang cần chuyển quyền trước");
    await env.DB.prepare("DELETE FROM guild_members WHERE guild_id=?1 AND account_id=?2").bind(g.id,acc.id).run();
    return { guild: null };
  }
  if (action === "donate") {
    throw new HttpError(403,"donation_disabled","Đóng góp tài nguyên tạm khóa đến khi có ledger xác thực");
  }
  if (action === "boss_attack") {
    requireVerified(me);
    const today = dayKey();
    const requestId = body.request_id == null ? randomToken(12) : String(body.request_id);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw new HttpError(400,"bad_request_id");
    // 2.7: damage từ mô phỏng session thật trên server (deterministic theo tuần + build).
    const now=Date.now();
    let damage;
    try {
      damage = simulateGuildBossAttack(me.snapshot, guildBossWeekId(now));
    } catch (e) {
      throw new HttpError(500, "boss_sim_failed");
    }
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO boss_receipts(account_id,request_id,guild_id,week,day,damage,created_at)
        SELECT ?1,?2,g.id,g.week,?4,MIN(?5,g.boss_hp),?6 FROM guilds g JOIN guild_members m ON m.guild_id=g.id
        WHERE g.id=?3 AND m.account_id=?1 AND g.boss_hp>0
        AND (m.attack_day IS NOT ?4 OR m.attack_count<3)
        AND (SELECT COUNT(*) FROM boss_receipts WHERE account_id=?1 AND day=?4)<3
        ON CONFLICT(account_id,request_id) DO NOTHING`).bind(acc.id,requestId,g.id,today,damage,now),
      env.DB.prepare(`UPDATE guild_members SET weekly_damage=weekly_damage+(SELECT damage FROM boss_receipts WHERE account_id=?2 AND request_id=?3),
        attack_count=CASE WHEN attack_day=?4 THEN attack_count+1 ELSE 1 END,attack_day=?4,last_seen=?5
        WHERE guild_id=?1 AND account_id=?2 AND changes()>0`).bind(g.id,acc.id,requestId,today,now),
      env.DB.prepare(`UPDATE guilds SET boss_hp=boss_hp-(SELECT damage FROM boss_receipts WHERE account_id=?2 AND request_id=?3),updated_at=?4
        WHERE id=?1 AND changes()>0`).bind(g.id,acc.id,requestId,now),
    ]);
    const receipt=await env.DB.prepare("SELECT guild_id,damage,week,day FROM boss_receipts WHERE account_id=?1 AND request_id=?2").bind(acc.id,requestId).first();
    if (!receipt) {
      const fresh=await guildFor(env.DB,acc.id);
      if (!fresh || fresh.id!==g.id) throw new HttpError(409,"guild_changed");
      if (fresh.boss_hp<=0) throw new HttpError(409,"boss_defeated");
      throw new HttpError(429,"boss_daily_limit","Mỗi ngày được đánh boss 3 lần");
    }
    if (receipt.guild_id!==g.id) throw new HttpError(409,"request_id_reused");
    return { damage:receipt.damage,request_id:requestId,receipt, ...await guildView(env.DB, acc.id) };
  }
  throw new HttpError(400, "bad_guild_action");
}

async function activeRoom(db, accountId) {
  return db.prepare(
    `SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id
     WHERE m.account_id=?1 AND r.status='open' AND r.expires_at>?2 ORDER BY r.updated_at DESC LIMIT 1`
  ).bind(accountId, Date.now()).first();
}

async function roomView(db, roomRow) {
  if (!roomRow) return { room: null };
  const now = Date.now();
  const members = await db.prepare(
    `SELECT name,power,joined_at,last_seen,action_seq,last_action
     FROM room_members WHERE room_id=?1 AND last_seen>?2 ORDER BY joined_at`
  ).bind(roomRow.id, now - ROOM_IDLE).all();
  return { room: { id: roomRow.id,owner_id: roomRow.owner_id,status: roomRow.status,expires_at: roomRow.expires_at,updated_at: roomRow.updated_at,members: members.results } };
}

export async function room(req, env, body) {
  const acc = await auth(req, env);
  const accountChar=await charFor(env.DB,acc.id);
  let state;try{state=JSON.parse(accountChar.snapshot);}catch(e){}
  if(state&&state.mode!=='ctc'&&!GAME.featureEnabled('party_lobby',state.mode,env.FEATURE_FLAGS,!!state.sandbox))throw new HttpError(403,'feature_disabled','Phòng của chế độ này chưa mở');
  if(state&&GAME.featureEnabled('party_lobby',state.mode,env.FEATURE_FLAGS,!!state.sandbox))return partyRoom(req,env,body,acc,accountChar);
  if (req.method === "GET") return roomView(env.DB, await activeRoom(env.DB, acc.id));
  await limitWrites(env.DB,"room",acc.id);
  const action = String(body && body.action || "");
  const me = await charFor(env.DB, acc.id);
  // Expired memberships must not keep the unique account slot occupied.
  await env.DB.prepare(`DELETE FROM room_members WHERE account_id=?1 AND NOT EXISTS(
    SELECT 1 FROM rooms WHERE id=room_members.room_id AND status='open' AND expires_at>?2)`).bind(acc.id,Date.now()).run();
  let current = await activeRoom(env.DB, acc.id);
  if (action === "create") {
    if (current) return roomView(env.DB, current);
    const now = Date.now(), id = randomToken(8);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO rooms(id,owner_id,created_at,updated_at,expires_at) VALUES(?1,?2,?3,?3,?4)").bind(id,acc.id,now,now+ROOM_TTL),
      env.DB.prepare("INSERT INTO room_members(room_id,account_id,name,power,joined_at,last_seen) VALUES(?1,?2,?3,?4,?5,?5)").bind(id,acc.id,me.name,me.power||0,now),
    ]);
    return roomView(env.DB, await activeRoom(env.DB, acc.id));
  }
  if (action === "join") {
    if (current) throw new HttpError(409, "already_in_room", "Bạn đã ở trong phòng");
    const id = String(body.room_id || "").slice(0, 32);
    const target = await env.DB.prepare("SELECT * FROM rooms WHERE id=?1 AND status='open' AND expires_at>?2").bind(id,Date.now()).first();
    if (!target) throw new HttpError(404, "room_not_found", "Không tìm thấy phòng");
    const now = Date.now();
    const joined=await env.DB.batch([
      env.DB.prepare(`INSERT INTO room_members(room_id,account_id,name,power,joined_at,last_seen)
        SELECT ?1,?2,?3,?4,?5,?5 WHERE (SELECT COUNT(*) FROM room_members WHERE room_id=?1)<4
        AND EXISTS(SELECT 1 FROM rooms WHERE id=?1 AND status='open' AND expires_at>?5)
        AND NOT EXISTS(SELECT 1 FROM room_members WHERE account_id=?2)
        AND EXISTS(SELECT 1 FROM rooms WHERE id=?1 AND mode='ctc')`).bind(id,acc.id,me.name,me.power||0,now),
      env.DB.prepare("UPDATE rooms SET updated_at=?2 WHERE id=?1 AND changes()>0").bind(id,now),
    ]);
    if (!joined[0].meta.changes) throw new HttpError(409,"room_full","Phòng đã đầy, hết hạn hoặc bạn đã vào phòng khác");
    return roomView(env.DB, await activeRoom(env.DB, acc.id));
  }
  if (!current) throw new HttpError(400, "not_in_room", "Bạn chưa ở trong phòng");
  if (action === "leave") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM room_members WHERE room_id=?1 AND account_id=?2").bind(current.id,acc.id),
      env.DB.prepare("UPDATE rooms SET updated_at=?2 WHERE id=?1").bind(current.id,Date.now()),
    ]);
    return { room: null };
  }
  const now = Date.now();
  if (action === "heartbeat") {
    await env.DB.batch([
      env.DB.prepare("UPDATE room_members SET name=?3,power=?4,last_seen=?5 WHERE room_id=?1 AND account_id=?2").bind(current.id,acc.id,me.name,me.power||0,now),
      env.DB.prepare("UPDATE rooms SET updated_at=?2 WHERE id=?1").bind(current.id,now),
    ]);
    return roomView(env.DB, current);
  }
  if (action === "action") {
    const value = String(body.value || "").slice(0, 80);
    await env.DB.batch([
      env.DB.prepare("UPDATE room_members SET last_action=?3,action_seq=action_seq+1,last_seen=?4 WHERE room_id=?1 AND account_id=?2").bind(current.id,acc.id,value,now),
      env.DB.prepare("UPDATE rooms SET updated_at=?2 WHERE id=?1").bind(current.id,now),
    ]);
    return roomView(env.DB, current);
  }
  throw new HttpError(400, "bad_room_action");
}
