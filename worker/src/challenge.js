// G04: community challenges for mode 2.0. A challenge is a validated build plus a preset, shared by code. Players run it against the same
// deterministic boss chain; the server simulates every run (sessions.js drives the ticks) and nothing here accepts a score.
import {assertAccountFeature} from './capabilities.js';
import {HttpError, randomToken, sha256Hex} from './http.js';
import {rateLimit} from './db.js';
import {GAME} from '../gen/game.js';
import {trialScore} from './trial.js';

export const CHALLENGE_RULES = Object.freeze({publishPerDay: 5, openPerAuthor: 20, attemptsPerDay: 10, boardSize: 20, listSize: 20, sessionTtl: 300000});
const DAY = 864e5, CODE = /^CH-[A-HJ-NP-Z2-9]{8}$/, ID = /^[A-Za-z0-9_-]{8,80}$/, ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'CH-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ALPHABET[b % ALPHABET.length]).join('');
// The seed depends only on the version and the code, so everyone who runs a challenge faces the identical fight.
export function challengeSeed(code) {
  let h = 2166136261;
  for (const c of `${GAME.CHALLENGE_VERSION}:${code}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const challengeWeek = code => challengeSeed(code) % 1024;

async function eligible(req, env) {
  const account = await assertAccountFeature(req, env, 'community_challenge'), now = Date.now();
  const c = await env.DB.prepare('SELECT flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(account.id).first();
  if (!c || c.flagged || c.validation_status !== 'verified' || !c.updated_at || c.updated_at < now - 30 * DAY) throw new HttpError(403, 'challenge_locked');
  return {account, now};
}

const ELIGIBLE = "JOIN chars c ON c.account_id=r.account_id AND c.mode='g2' AND c.flagged=0 AND c.validation_status='verified'";
async function board(db, code, accountId) {
  const rows = (await db.prepare(`SELECT a.name,r.account_id,r.depth,r.score,r.ticks FROM challenge_results r ${ELIGIBLE} JOIN accounts a ON a.id=r.account_id
    WHERE r.challenge_id=?1 ORDER BY r.score DESC,r.ticks,r.created_at,r.account_id LIMIT ${CHALLENGE_RULES.boardSize}`).bind(code).all()).results;
  const mine = await db.prepare(`SELECT r.depth,r.score,r.ticks,
      (SELECT COUNT(*)+1 FROM challenge_results o JOIN chars oc ON oc.account_id=o.account_id AND oc.mode='g2' AND oc.flagged=0 AND oc.validation_status='verified'
        WHERE o.challenge_id=r.challenge_id AND (o.score>r.score OR (o.score=r.score AND (o.ticks<r.ticks OR (o.ticks=r.ticks AND (o.created_at<r.created_at OR (o.created_at=r.created_at AND o.account_id<r.account_id))))))) AS placement
    FROM challenge_results r ${ELIGIBLE} WHERE r.challenge_id=?1 AND r.account_id=?2`).bind(code, accountId).first();
  return {
    rows: rows.map((r, i) => ({placement: i + 1, name: r.name, depth: r.depth, score: r.score, ticks: r.ticks, me: r.account_id === accountId})),
    mine: mine ? {depth: mine.depth, score: mine.score, ticks: mine.ticks, placement: mine.placement} : null,
  };
}
const summary = row => ({code: row.id, preset: row.preset, version: row.version, author: row.author_name, status: row.status, created_at: row.created_at,
  finishers: row.finishers ?? 0, outdated: row.version !== GAME.CHALLENGE_VERSION, spec: JSON.parse(row.spec)});
const LIST = `SELECT c.*,a.name AS author_name,(SELECT COUNT(*) FROM challenge_results r WHERE r.challenge_id=c.id) AS finishers FROM challenges c JOIN accounts a ON a.id=c.author_id`;
const attemptsToday = async (db, id, now) => (await db.prepare('SELECT COUNT(*) n FROM challenge_attempts WHERE account_id=?1 AND created_at>=?2').bind(id, now - now % DAY).first()).n;

function presetsView() {
  return Object.values(GAME.CHALLENGE_PRESETS).map(p => ({id: p.id, label: p.label, level: p.level, waves: p.waves, scale: p.scale, budget: GAME.challengeBudgets(p.id)}));
}
async function view(db, account, now, code) {
  const base = {v: 1, now, rules: {version: GAME.CHALLENGE_VERSION, ...CHALLENGE_RULES}, presets: presetsView(),
    attempts: {used: await attemptsToday(db, account.id, now), left: 0}};
  base.attempts.left = Math.max(0, CHALLENGE_RULES.attemptsPerDay - base.attempts.used);
  if (code !== undefined) {
    if (typeof code !== 'string' || !CODE.test(code)) throw new HttpError(400, 'bad_challenge_code');
    const row = await db.prepare(`${LIST} WHERE c.id=?1`).bind(code).first();
    if (!row) throw new HttpError(404, 'challenge_not_found');
    return {...base, challenge: summary(row), board: await board(db, code, account.id)};
  }
  const mine = (await db.prepare(`${LIST} WHERE c.author_id=?1 AND c.status='open' ORDER BY c.created_at DESC LIMIT ${CHALLENGE_RULES.openPerAuthor}`).bind(account.id).all()).results;
  const recent = (await db.prepare(`${LIST} WHERE c.status='open' AND c.version=?1 ORDER BY c.created_at DESC LIMIT ${CHALLENGE_RULES.listSize}`).bind(GAME.CHALLENGE_VERSION).all()).results;
  return {...base, mine: mine.map(summary), recent: recent.map(summary)};
}

async function publish(db, account, body, now) {
  const checked = GAME.challengeSpecCheck(body.spec, body.preset);
  if (!checked.ok) throw new HttpError(400, 'challenge_' + checked.code);
  const spec = JSON.stringify(checked.spec), hash = await sha256Hex(spec), version = GAME.CHALLENGE_VERSION;
  const existing = () => db.prepare('SELECT id,status FROM challenges WHERE author_id=?1 AND preset=?2 AND version=?3 AND spec_hash=?4').bind(account.id, body.preset, version, hash).first();
  const prior = await existing();
  if (prior && prior.status === 'open') return prior.id;
  for (let tries = 0; tries < 4; tries++) {
    const code = newCode();
    // Caps are enforced in the INSERT itself so concurrent publishes cannot exceed them. A retired build can be reopened under the same code.
    const result = await db.batch([
      prior
        ? db.prepare(`UPDATE challenges SET status='open' WHERE id=?1 AND author_id=?2 AND status<>'open'
            AND (SELECT COUNT(*) FROM challenges WHERE author_id=?2 AND created_at>=?3)<?4 AND (SELECT COUNT(*) FROM challenges WHERE author_id=?2 AND status='open')<?5`)
          .bind(prior.id, account.id, now - now % DAY, CHALLENGE_RULES.publishPerDay, CHALLENGE_RULES.openPerAuthor)
        : db.prepare(`INSERT INTO challenges(id,author_id,preset,version,spec,spec_hash,status,created_at)
            SELECT ?1,?2,?3,?4,?5,?6,'open',?7 WHERE (SELECT COUNT(*) FROM challenges WHERE author_id=?2 AND created_at>=?8)<?9
            AND (SELECT COUNT(*) FROM challenges WHERE author_id=?2 AND status='open')<?10 ON CONFLICT DO NOTHING`)
          .bind(code, account.id, body.preset, version, spec, hash, now, now - now % DAY, CHALLENGE_RULES.publishPerDay, CHALLENGE_RULES.openPerAuthor),
    ]).catch(() => null);
    const row = await existing();
    if (row && row.status === 'open') return row.id;
    if (result) break; // refused by a cap, not by a code collision
  }
  const usedToday = (await db.prepare('SELECT COUNT(*) n FROM challenges WHERE author_id=?1 AND created_at>=?2').bind(account.id, now - now % DAY).first()).n;
  throw new HttpError(409, usedToday >= CHALLENGE_RULES.publishPerDay ? 'challenge_publish_limit' : 'challenge_open_limit');
}

async function retire(db, account, body) {
  if (typeof body.code !== 'string' || !CODE.test(body.code)) throw new HttpError(400, 'bad_challenge_code');
  const result = await db.prepare("UPDATE challenges SET status='retired' WHERE id=?1 AND author_id=?2").bind(body.code, account.id).run();
  if (!result.meta.changes) throw new HttpError(404, 'challenge_not_found');
}

// Builds the fighter from the stored build only (never from the caller's save), then inserts the session, member and attempt row atomically.
async function start(env, account, body, now) {
  const db = env.DB;
  if (typeof body.code !== 'string' || !CODE.test(body.code)) throw new HttpError(400, 'bad_challenge_code');
  if (body.id != null && (typeof body.id !== 'string' || !ID.test(body.id))) throw new HttpError(400, 'bad_session_id');
  const row = await db.prepare('SELECT * FROM challenges WHERE id=?1').bind(body.code).first();
  if (!row || row.status !== 'open') throw new HttpError(404, 'challenge_not_found');
  if (row.version !== GAME.CHALLENGE_VERSION) throw new HttpError(409, 'challenge_outdated');
  if (body.id) {
    const previous = await db.prepare('SELECT s.id,s.creator_id,a.challenge_id FROM combat_sessions s JOIN challenge_attempts a ON a.session_id=s.id WHERE s.id=?1').bind(body.id).first();
    if (previous) { if (previous.creator_id !== account.id || previous.challenge_id !== body.code) throw new HttpError(409, 'session_activity_conflict'); return previous.id; }
  }
  const current = await db.prepare("SELECT s.id,a.challenge_id FROM combat_sessions s JOIN session_members m ON m.session_id=s.id LEFT JOIN challenge_attempts a ON a.session_id=s.id WHERE m.account_id=?1 AND m.active=1 AND s.status='active'").bind(account.id).first();
  if (current) { if (current.challenge_id === body.code) return current.id; throw new HttpError(409, 'session_member_busy'); }
  if (await attemptsToday(db, account.id, now) >= CHALLENGE_RULES.attemptsPerDay) throw new HttpError(409, 'challenge_attempts_used');
  const preset = GAME.CHALLENGE_PRESETS[row.preset], checked = GAME.challengeSpecCheck(JSON.parse(row.spec), row.preset);
  if (!preset || !checked.ok) throw new HttpError(409, 'challenge_outdated');
  const previousS = GAME.getS();
  let actor;
  try { GAME.setS(GAME.challengeSave(checked.spec, row.preset)); actor = GAME.sessionActor(account.id, account.name || 'Người chơi', GAME.calc(), 'damage'); } finally { GAME.setS(previousS); }
  const state = GAME.sessionCombatNew('g2', [actor], challengeSeed(body.code), 'challenge', {week: challengeWeek(body.code), version: GAME.CHALLENGE_VERSION + ':' + row.preset, waves: preset.waves, scale: preset.scale});
  const id = body.id || randomToken(12), room = 'challenge:' + account.id;
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO combat_sessions(id,room_id,creator_id,created_at,expires_at,state,status)
        SELECT ?1,?2,?3,?4,?5,?6,'active' WHERE (SELECT COUNT(*) FROM challenge_attempts WHERE account_id=?3 AND created_at>=?7)<?8
        AND EXISTS(SELECT 1 FROM challenges WHERE id=?9 AND status='open' AND version=?10)`)
        .bind(id, room, account.id, now, now + CHALLENGE_RULES.sessionTtl, JSON.stringify(state), now - now % DAY, CHALLENGE_RULES.attemptsPerDay, body.code, GAME.CHALLENGE_VERSION),
      db.prepare('INSERT INTO session_members(session_id,account_id,active,last_seen,connected_from) SELECT ?1,?2,1,?3,?3 WHERE EXISTS(SELECT 1 FROM combat_sessions WHERE id=?1)').bind(id, account.id, now),
      db.prepare('INSERT INTO challenge_attempts(session_id,challenge_id,account_id,created_at) SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM combat_sessions WHERE id=?1)').bind(id, body.code, account.id, now),
    ]);
    if (!result[0].meta.changes) throw new HttpError(409, 'challenge_attempts_used');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const again = await db.prepare("SELECT s.id FROM combat_sessions s JOIN session_members m ON m.session_id=s.id JOIN challenge_attempts a ON a.session_id=s.id WHERE m.account_id=?1 AND m.active=1 AND s.status='active' AND a.challenge_id=?2").bind(account.id, body.code).first();
    if (again) return again.id;
    throw new HttpError(409, 'session_member_busy');
  }
  return id;
}

// Counts a finished run once (the attempt row's recorded_at is the marker) and keeps only the best score per account and challenge.
export async function recordChallengeResult(db, sessionId, state, now = Date.now()) {
  if (state.activity !== 'challenge' || state.status === 'active') return false;
  const score = trialScore(state);
  const results = await db.batch([
    db.prepare('UPDATE challenge_attempts SET recorded_at=?2 WHERE session_id=?1 AND recorded_at IS NULL').bind(sessionId, now),
    db.prepare(`INSERT INTO challenge_results(challenge_id,account_id,session_id,depth,score,ticks,created_at)
      SELECT challenge_id,account_id,session_id,?2,?3,?4,?5 FROM challenge_attempts WHERE session_id=?1 AND changes()>0
      ON CONFLICT(challenge_id,account_id) DO UPDATE SET session_id=excluded.session_id,depth=excluded.depth,score=excluded.score,ticks=excluded.ticks,created_at=excluded.created_at
      WHERE excluded.score>challenge_results.score OR (excluded.score=challenge_results.score AND excluded.ticks<challenge_results.ticks)`)
      .bind(sessionId, state.objectives.depth, score, state.tick, now),
  ]);
  return !!results[0].meta.changes;
}
export async function challengeOf(db, sessionId) {
  return (await db.prepare('SELECT challenge_id AS code FROM challenge_attempts WHERE session_id=?1').bind(sessionId).first())?.code ?? null;
}

export async function challenge(req, env, body) {
  const {account, now} = await eligible(req, env), db = env.DB;
  if (!await rateLimit(db, 'challenge:' + account.id, req.method === 'GET' ? 120 : 60, 60)) throw new HttpError(429, 'rate_limited');
  if (req.method === 'GET') return view(db, account, now, new URL(req.url).searchParams.get('code') ?? undefined);
  const action = body?.action, allowed = {publish: ['action', 'preset', 'spec'], retire: ['action', 'code'], start: ['action', 'code', 'id']}[action];
  if (!allowed || Object.keys(body).some(k => !allowed.includes(k))) throw new HttpError(400, 'bad_challenge_action');
  if (action === 'publish') return {code: await publish(db, account, body, now), ...await view(db, account, now)};
  if (action === 'retire') { await retire(db, account, body); return view(db, account, now); }
  return {session_id: await start(env, account, body, now)};
}
