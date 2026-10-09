// C08: ranked seasons and capped asynchronous guild logistics. CTC only, flag `ranked_seasons`.
// Scores come exclusively from duel_scores (already server-validated); a season is four weekly duel seasons.
// Titles are cosmetic receipts: no stats, no resources, and no write to resource_ledger.
import {assertAccountFeature} from './capabilities.js';
import {HttpError} from './http.js';
import {rateLimit} from './db.js';

const WEEK = 7 * 864e5;
export const SEASON_RULES = Object.freeze({
  version: 1, weeks: 4, graceMs: 864e5, claimWindowMs: 28 * 864e5,
  minPoints: 3, minGroup: 5, boardSize: 10, guildCap: 30, sessionWeight: 3,
  titles: Object.freeze(['champion', 'top3', 'top10', 'contender']),
});

export function seasonInfo(idx) {
  const first = idx * SEASON_RULES.weeks;
  return {index: idx, first_week: first, last_week: first + SEASON_RULES.weeks - 1,
    start: first * WEEK, end: (first + SEASON_RULES.weeks) * WEEK};
}
export function seasonOf(now) {
  return seasonInfo(Math.floor(Math.floor(now / WEEK) / SEASON_RULES.weeks));
}
const cutoffOf = info => info.end + SEASON_RULES.graceMs;

// Shared by the live board and the freeze. ?1 first week, ?2 last week, ?3 min points, ?4 earliest character sync.
// Ties share a placement (RANK); only verified, unflagged, non-sandbox CTC characters take part.
const STANDINGS = `WITH s AS (
  SELECT account_id,SUM(points) AS points,SUM(wins) AS wins FROM duel_scores
  WHERE CAST(season AS INTEGER) BETWEEN ?1 AND ?2 GROUP BY account_id HAVING SUM(points)>=?3
), e AS (
  SELECT s.account_id,c.fac,c.bracket,s.points,s.wins FROM s JOIN chars c ON c.account_id=s.account_id
  WHERE c.flagged=0 AND c.validation_status='verified' AND c.bracket IS NOT NULL AND c.updated_at>=?4
  AND CASE WHEN json_valid(c.snapshot) THEN json_extract(c.snapshot,'$.mode')='ctc' AND COALESCE(json_extract(c.snapshot,'$.sandbox'),0)=0 ELSE 0 END
), r AS (
  SELECT e.*,RANK() OVER (PARTITION BY fac,bracket ORDER BY points DESC,wins DESC) AS placement,
    COUNT(*) OVER (PARTITION BY fac,bracket) AS group_size FROM e
)`;

const standingArgs = info => [info.first_week, info.last_week, SEASON_RULES.minPoints, info.start];

// Freeze exactly once: the meta row decides, so concurrent callers cannot insert twice or change a result.
async function freeze(db, info, now) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO season_meta(season_idx,frozen_at) VALUES(?1,?2)').bind(info.index, now),
    db.prepare(`${STANDINGS}
      INSERT INTO season_final(season_idx,account_id,fac,bracket,points,wins,placement,group_size,title)
      SELECT ?5,account_id,fac,bracket,points,wins,placement,group_size,
        CASE WHEN group_size>=?6 AND placement=1 THEN 'champion' WHEN group_size>=?6 AND placement<=3 THEN 'top3'
             WHEN group_size>=?6 AND placement<=10 THEN 'top10' ELSE 'contender' END
      FROM r WHERE changes()>0`).bind(...standingArgs(info), info.index, SEASON_RULES.minGroup),
  ]);
}
async function ensureFrozen(db, info, now) {
  if (now < cutoffOf(info) || now >= cutoffOf(info) + SEASON_RULES.claimWindowMs) return false;
  await freeze(db, info, now);
  return true;
}

// Per-member capped contribution (ranked duel points + weighted co-op merit receipts), derived from existing server records.
const CONTRIB = `(COALESCE((SELECT SUM(d.points) FROM duel_scores d WHERE d.account_id=m.account_id AND CAST(d.season AS INTEGER) BETWEEN ?1 AND ?2),0)
  +?4*COALESCE((SELECT SUM(sr.amount) FROM session_rewards sr WHERE sr.account_id=m.account_id AND sr.created_at>=?5 AND sr.created_at<?6),0))`;
const guildArgs = info => [info.first_week, info.last_week, SEASON_RULES.guildCap, SEASON_RULES.sessionWeight, info.start, info.end];
const VERIFIED = "JOIN chars c ON c.account_id=m.account_id AND c.flagged=0 AND c.validation_status='verified'";

async function guildView(db, accountId, info) {
  const mine = await db.prepare('SELECT g.id,g.name FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.account_id=?1').bind(accountId).first();
  if (!mine) return null;
  const members = (await db.prepare(`SELECT a.name,m.account_id AS id,MIN(?3,${CONTRIB}) AS points
    FROM guild_members m ${VERIFIED} JOIN accounts a ON a.id=m.account_id WHERE m.guild_id=?7 ORDER BY points DESC,a.name LIMIT 30`)
    .bind(...guildArgs(info), mine.id).all()).results;
  const board = (await db.prepare(`SELECT g.name,SUM(MIN(?3,${CONTRIB})) AS total
    FROM guild_members m ${VERIFIED} JOIN guilds g ON g.id=m.guild_id GROUP BY g.id HAVING total>0 ORDER BY total DESC,g.name LIMIT ${SEASON_RULES.boardSize}`)
    .bind(...guildArgs(info)).all()).results;
  return {id: mine.id, name: mine.name, cap: SEASON_RULES.guildCap,
    mine: members.find(x => x.id === accountId)?.points || 0,
    total: members.reduce((n, x) => n + x.points, 0),
    members: members.map(x => ({name: x.name, points: x.points})), board};
}

async function finalBoard(db, row) {
  return (await db.prepare(`SELECT f.placement,f.points,f.wins,a.name,f.account_id FROM season_final f JOIN accounts a ON a.id=f.account_id
    WHERE f.season_idx=?1 AND f.fac=?2 AND f.bracket=?3 ORDER BY f.placement,f.wins DESC,a.name LIMIT ${SEASON_RULES.boardSize}`)
    .bind(row.season_idx, row.fac, row.bracket).all()).results;
}
const resultOf = (row, info, now) => row && ({
  season: info.index, title: row.title, placement: row.placement, group_size: row.group_size, points: row.points, wins: row.wins,
  fac: row.fac, bracket: row.bracket, claimed_at: row.claimed_at,
  claim_open: now >= cutoffOf(info) && now < cutoffOf(info) + SEASON_RULES.claimWindowMs,
  claim_deadline: cutoffOf(info) + SEASON_RULES.claimWindowMs,
});

async function eligible(req, env) {
  const account = await assertAccountFeature(req, env, 'ranked_seasons');
  const c = await env.DB.prepare('SELECT fac,bracket,flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(account.id).first();
  if (!c || c.flagged || c.validation_status !== 'verified' || !c.updated_at || c.updated_at < Date.now() - 30 * 864e5)
    throw new HttpError(403, 'season_locked');
  return {account, character: c};
}

async function view(env, account, character, now) {
  const db = env.DB, current = seasonOf(now), recent = [seasonInfo(current.index - 1), seasonInfo(current.index - 2)];
  for (const info of recent) await ensureFrozen(db, info, now);
  const live = (await db.prepare(`SELECT SUM(points) AS points,SUM(wins) AS wins FROM duel_scores WHERE account_id=?1 AND CAST(season AS INTEGER) BETWEEN ?2 AND ?3`)
    .bind(account.id, current.first_week, current.last_week).first()) || {};
  const inGroup = character.bracket ? (await db.prepare(`${STANDINGS}
      SELECT r.placement,r.points,r.wins,r.group_size,a.name,r.account_id FROM r JOIN accounts a ON a.id=r.account_id
      WHERE r.fac=?5 AND r.bracket=?6 ORDER BY r.placement,r.wins DESC,a.name`).bind(...standingArgs(current), character.fac, character.bracket).all()).results : [];
  const self = inGroup.find(x => x.account_id === account.id);
  const claims = [];
  for (const info of recent) {
    const row = await db.prepare('SELECT * FROM season_final WHERE season_idx=?1 AND account_id=?2').bind(info.index, account.id).first();
    if (!row) continue;
    const entry = resultOf(row, info, now);
    if (info.index === current.index - 1) entry.board = (await finalBoard(db, row)).map(x => ({placement: x.placement, name: x.name, points: x.points, wins: x.wins, me: x.account_id === account.id}));
    claims.push(entry);
  }
  const titles = (await db.prepare('SELECT season_idx,title,placement,fac,bracket,claimed_at FROM season_final WHERE account_id=?1 AND claimed_at IS NOT NULL ORDER BY season_idx DESC LIMIT 8')
    .bind(account.id).all()).results;
  return {
    v: 1, rules: SEASON_RULES, now,
    season: {...current, final_at: cutoffOf(current)},
    standing: {fac: character.fac, bracket: character.bracket, points: live.points || 0, wins: live.wins || 0, min_points: SEASON_RULES.minPoints,
      eligible: !!self, placement: self?.placement ?? null, group_size: self?.group_size ?? null},
    board: inGroup.slice(0, SEASON_RULES.boardSize).map(x => ({placement: x.placement, name: x.name, points: x.points, wins: x.wins, me: x.account_id === account.id})),
    claims, titles: titles.map(x => ({season: x.season_idx, title: x.title, placement: x.placement, fac: x.fac, bracket: x.bracket, claimed_at: x.claimed_at})),
    guild: await guildView(db, account.id, current),
  };
}

async function claim(env, account, body, now) {
  const index = body.season, current = seasonOf(now);
  if (!Number.isSafeInteger(index) || index >= current.index || index < current.index - 2) throw new HttpError(400, 'bad_season');
  const info = seasonInfo(index);
  if (now < cutoffOf(info)) throw new HttpError(409, 'season_not_final');
  if (now >= cutoffOf(info) + SEASON_RULES.claimWindowMs) throw new HttpError(409, 'season_claim_expired');
  await freeze(env.DB, info, now);
  const row = await env.DB.prepare('SELECT * FROM season_final WHERE season_idx=?1 AND account_id=?2').bind(index, account.id).first();
  if (!row) throw new HttpError(409, 'season_no_title');
  await env.DB.prepare('UPDATE season_final SET claimed_at=COALESCE(claimed_at,?3) WHERE season_idx=?1 AND account_id=?2').bind(index, account.id, now).run();
  return resultOf(await env.DB.prepare('SELECT * FROM season_final WHERE season_idx=?1 AND account_id=?2').bind(index, account.id).first(), info, now);
}

export async function season(req, env, body) {
  const {account, character} = await eligible(req, env), now = Date.now();
  if (!await rateLimit(env.DB, 'season:' + account.id, req.method === 'GET' ? 120 : 60, 60)) throw new HttpError(429, 'rate_limited');
  if (req.method === 'GET') return view(env, account, character, now);
  if (Object.keys(body || {}).some(k => !['action', 'season'].includes(k)) || body?.action !== 'claim') throw new HttpError(400, 'bad_season_action');
  return {receipt: await claim(env, account, body, now), ...await view(env, account, character, now)};
}
