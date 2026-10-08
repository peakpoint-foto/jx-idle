import { HttpError, randomToken } from "./http.js";
import { auth, cleanName } from "./account.js";

const DUEL_TTL = 3 * 864e5;
const ROOM_TTL = 2 * 3600e3;
const ROOM_IDLE = 35e3;
const BOSS_MAX = 1_000_000;
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
    "SELECT a.id,a.name,c.snapshot,c.power,c.bracket,c.lvl,c.flagged FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.id=?1"
  ).bind(accountId).first();
  if (!row) throw new HttpError(404, "no_character");
  return row;
}

function hashSeed(seed, side) {
  let h = 2166136261;
  for (const c of `${seed}:${side}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function duelScore(power, seed, side) {
  return Math.max(1, Number(power) || 1) * (0.9 + (hashSeed(seed, side) % 21) / 100);
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
  };
}

async function duelList(db, accountId) {
  const rows = await db.prepare(
    `SELECT * FROM duels WHERE challenger_id=?1 OR defender_id=?1
     ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 30`
  ).bind(accountId).all();
  const score = await db.prepare(
    "SELECT points,wins,losses FROM duel_scores WHERE account_id=?1 AND season=?2"
  ).bind(accountId, weekKey()).first();
  return { season: weekKey(), score: score || { points: 0, wins: 0, losses: 0 }, duels: rows.results.map(r => duelView(r, accountId)) };
}

async function resolveDuel(db, row) {
  const cScore = duelScore(row.challenger_power, row.id, "c");
  const dScore = duelScore(row.defender_power, row.id, "d");
  const winner = cScore >= dScore ? row.challenger_id : row.defender_id;
  const loser = winner === row.challenger_id ? row.defender_id : row.challenger_id;
  const now = Date.now();
  const season = row.season;
  await db.batch([
    db.prepare(
      `UPDATE duels SET status='resolved',winner_id=?2,challenger_score=?3,defender_score=?4,resolved_at=?5
       WHERE id=?1 AND status='resolving'`
    ).bind(row.id, winner, cScore, dScore, now),
    db.prepare(
      `INSERT INTO duel_scores(account_id,season,points,wins,losses) VALUES(?1,?2,3,1,0)
       ON CONFLICT(account_id,season) DO UPDATE SET points=points+3,wins=wins+1`
    ).bind(winner, season),
    db.prepare(
      `INSERT INTO duel_scores(account_id,season,points,wins,losses) VALUES(?1,?2,1,0,1)
       ON CONFLICT(account_id,season) DO UPDATE SET points=points+1,losses=losses+1`
    ).bind(loser, season),
  ]);
  return { winner, challenger_score: cScore, defender_score: dScore };
}

export async function duels(req, env, body, url) {
  const acc = await auth(req, env);
  if (req.method === "GET") return duelList(env.DB, acc.id);
  const action = String(body && body.action || "");
  const me = await charFor(env.DB, acc.id);

  if (action === "challenge") {
    const targetName = cleanName(body.opponent);
    const target = await env.DB.prepare(
      `SELECT a.id,a.name,c.snapshot,c.power,c.bracket,c.lvl,c.flagged
       FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.name=?1 COLLATE NOCASE`
    ).bind(targetName).first();
    if (!target) throw new HttpError(404, "opponent_not_found", "Không tìm thấy người chơi");
    if (target.id === acc.id) throw new HttpError(400, "self_duel", "Không thể tự thách đấu");
    if (me.flagged || target.flagged) throw new HttpError(403, "ranked_locked", "Nhân vật đang bị khóa PvP xếp hạng");
    if (!me.bracket || me.bracket !== target.bracket) throw new HttpError(400, "different_bracket", "Hai người chơi phải cùng bậc PvP");
    const active = await env.DB.prepare(
      `SELECT id FROM duels WHERE status='pending' AND expires_at>?3
       AND ((challenger_id=?1 AND defender_id=?2) OR (challenger_id=?2 AND defender_id=?1)) LIMIT 1`
    ).bind(acc.id, target.id, Date.now()).first();
    if (active) throw new HttpError(409, "duel_exists", "Đã có lời thách đấu đang chờ");
    const now = Date.now();
    const id = randomToken(12);
    await env.DB.prepare(
      `INSERT INTO duels(id,season,challenger_id,defender_id,challenger_name,defender_name,challenger_power,defender_power,
       challenger_bracket,defender_bracket,challenger_snapshot,defender_snapshot,status,created_at,expires_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'pending',?13,?14)`
    ).bind(id, weekKey(now), acc.id, target.id, me.name, target.name, me.power || 0, target.power || 0,
      me.bracket, target.bracket, me.snapshot, target.snapshot, now, now + DUEL_TTL).run();
    return { ok: true, duel: { id, opponent: target.name, status: "pending", expires_at: now + DUEL_TTL } };
  }

  const id = String(body && body.id || "");
  if (!id) throw new HttpError(400, "missing_duel");
  const row = await env.DB.prepare("SELECT * FROM duels WHERE id=?1").bind(id).first();
  if (!row) throw new HttpError(404, "duel_not_found");
  if (action === "decline") {
    if (row.defender_id !== acc.id || row.status !== "pending") throw new HttpError(403, "duel_forbidden");
    await env.DB.prepare("UPDATE duels SET status='declined',resolved_at=?2 WHERE id=?1 AND status='pending'").bind(id, Date.now()).run();
    return duelList(env.DB, acc.id);
  }
  if (action !== "accept") throw new HttpError(400, "bad_duel_action");
  if (row.defender_id !== acc.id) throw new HttpError(403, "duel_forbidden");
  if (row.status !== "pending") return duelList(env.DB, acc.id);
  if (row.expires_at < Date.now()) {
    await env.DB.prepare("UPDATE duels SET status='expired',resolved_at=?2 WHERE id=?1 AND status='pending'").bind(id, Date.now()).run();
    return duelList(env.DB, acc.id);
  }
  const claimed = await env.DB.prepare("UPDATE duels SET status='resolving' WHERE id=?1 AND status='pending'").bind(id).run();
  if (!claimed.meta.changes) return duelList(env.DB, acc.id);
  const result = await resolveDuel(env.DB, row);
  return { ok: true, result, ...await duelList(env.DB, acc.id) };
}

async function guildFor(db, accountId) {
  return db.prepare(
    `SELECT g.*,m.role,m.contrib,m.weekly_damage,m.attack_day,m.attack_count
     FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.account_id=?1`
  ).bind(accountId).first();
}

async function refreshGuildWeek(db, guildRow) {
  const wk = weekKey();
  if (guildRow.week === wk) return guildRow;
  await db.batch([
    db.prepare("UPDATE guilds SET week=?2,boss_hp=boss_max_hp,updated_at=?3 WHERE id=?1").bind(guildRow.id, wk, Date.now()),
    db.prepare("UPDATE guild_members SET weekly_damage=0,attack_day=NULL,attack_count=0 WHERE guild_id=?1").bind(guildRow.id),
  ]);
  guildRow.week = wk;
  guildRow.boss_hp = guildRow.boss_max_hp;
  guildRow.weekly_damage = 0;
  guildRow.attack_day = null;
  guildRow.attack_count = 0;
  return guildRow;
}

async function guildView(db, accountId) {
  let g = await guildFor(db, accountId);
  if (!g) return { guild: null, suggestions: (await db.prepare("SELECT id,name,level,xp,boss_hp,boss_max_hp FROM guilds ORDER BY level DESC,xp DESC LIMIT 20").all()).results };
  g = await refreshGuildWeek(db, g);
  const members = await db.prepare(
    `SELECT a.name,c.lvl,c.power,m.role,m.contrib,m.weekly_damage
     FROM guild_members m JOIN accounts a ON a.id=m.account_id JOIN chars c ON c.account_id=a.id
     WHERE m.guild_id=?1 ORDER BY m.role='owner' DESC,m.contrib DESC LIMIT 30`
  ).bind(g.id).all();
  return {
    guild: {
      id: g.id,name: g.name,level: g.level,xp: g.xp,boss_hp: g.boss_hp,boss_max_hp: g.boss_max_hp,
      role: g.role,contrib: g.contrib,weekly_damage: g.weekly_damage,attack_count: g.attack_day === dayKey() ? g.attack_count : 0,
      week: g.week,
    },
    members: members.results,
  };
}

export async function guild(req, env, body) {
  const acc = await auth(req, env);
  if (req.method === "GET") return guildView(env.DB, acc.id);
  const action = String(body && body.action || "");
  const me = await charFor(env.DB, acc.id);
  const current = await guildFor(env.DB, acc.id);

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
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?1").bind(target.id).first();
    if (count.n >= GUILD_MAX_MEMBERS) throw new HttpError(409, "guild_full", "Bang đã đủ người");
    await env.DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES(?1,?2,'member',?3,?3)").bind(target.id,acc.id,Date.now()).run();
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
    const amount = Math.max(1, Math.min(100, Math.floor(+body.amount || 1)));
    await env.DB.batch([
      env.DB.prepare("UPDATE guilds SET xp=xp+?2,updated_at=?3 WHERE id=?1").bind(g.id,amount,Date.now()),
      env.DB.prepare("UPDATE guild_members SET contrib=contrib+?3,last_seen=?4 WHERE guild_id=?1 AND account_id=?2").bind(g.id,acc.id,amount,Date.now()),
    ]);
    return guildView(env.DB, acc.id);
  }
  if (action === "boss_attack") {
    const today = dayKey();
    const used = g.attack_day === today ? g.attack_count : 0;
    if (used >= 3) throw new HttpError(429, "boss_daily_limit", "Mỗi ngày được đánh boss 3 lần");
    if (g.boss_hp <= 0) throw new HttpError(409, "boss_defeated", "Boss tuần đã bị hạ");
    const damage = Math.min(g.boss_hp, Math.max(1, Math.round((me.power || 1) * (0.8 + (hashSeed(acc.id + today, used) % 41) / 100))));
    await env.DB.batch([
      env.DB.prepare("UPDATE guilds SET boss_hp=MAX(0,boss_hp-?2),updated_at=?3 WHERE id=?1").bind(g.id,damage,Date.now()),
      env.DB.prepare("UPDATE guild_members SET weekly_damage=weekly_damage+?3,attack_day=?4,attack_count=?5,last_seen=?6 WHERE guild_id=?1 AND account_id=?2").bind(g.id,acc.id,damage,today,used+1,Date.now()),
    ]);
    return { damage, ...await guildView(env.DB, acc.id) };
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
  if (req.method === "GET") return roomView(env.DB, await activeRoom(env.DB, acc.id));
  const action = String(body && body.action || "");
  const me = await charFor(env.DB, acc.id);
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
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM room_members WHERE room_id=?1").bind(id).first();
    if (count.n >= 4) throw new HttpError(409, "room_full", "Phòng đã đủ 4 người");
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO room_members(room_id,account_id,name,power,joined_at,last_seen) VALUES(?1,?2,?3,?4,?5,?5)").bind(id,acc.id,me.name,me.power||0,now),
      env.DB.prepare("UPDATE rooms SET updated_at=?2 WHERE id=?1").bind(id,now),
    ]);
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
