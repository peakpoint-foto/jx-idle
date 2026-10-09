// P06: weekly trial board. Results are produced only by the server simulating the run (sessions.js); nothing here accepts a score.
import {assertAccountFeature} from './capabilities.js';
import {HttpError} from './http.js';
import {rateLimit} from './db.js';
import {GAME} from '../gen/game.js';

export const TRIAL_RULES = Object.freeze({attemptsPerDay: 5, boardSize: 20, resultsKeepWeeks: 12});
const DAY = 864e5;
// UTC Monday 00:00 (07:00 in Vietnam), the same week index as the other weekly systems in activity.js.
export const trialWeekId = now => Math.floor((Math.floor(now / DAY) + 3) / 7);
export const trialWeekStart = id => (id * 7 - 3) * DAY;
export const trialTag = week => GAME.SESSION_TRIAL.version + ':' + GAME.sessionTrialRule(week).id;
// The seed is a pure function of the version and the week, so every player faces the same boss chain and it cannot change mid-week.
export function trialSeed(week) {
  let h = 2166136261;
  for (const c of `${GAME.SESSION_TRIAL.version}:${week}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
// Depth cleared plus the share of the current boss taken off; a full clear scores exactly the number of waves.
export function trialScore(state) {
  const b = state.boss;
  return state.objectives.depth + (state.status === 'completed' ? 0 : b.max > 0 ? Math.max(0, Math.min(.9999, 1 - b.hp / b.max)) : 0);
}

// Counts a finished run once (marker) and keeps only the best score per account/week/length/rules. Runs the server did not finish
// (operator abort, expiry before the simulation ended) keep an 'active' state and are never recorded.
export async function recordTrialResult(db, sessionId, state, now = Date.now()) {
  if (state.activity !== 'trial' || state.status === 'active') return false;
  const account = state.actors[0].id, score = trialScore(state);
  const results = await db.batch([
    db.prepare('INSERT OR IGNORE INTO trial_recorded(session_id,recorded_at) VALUES(?1,?2)').bind(sessionId, now),
    db.prepare(`INSERT INTO trial_results(week,length,account_id,rules,session_id,depth,score,ticks,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE changes()>0
      ON CONFLICT(week,length,account_id,rules) DO UPDATE SET session_id=excluded.session_id,depth=excluded.depth,score=excluded.score,ticks=excluded.ticks,created_at=excluded.created_at
      WHERE excluded.score>trial_results.score`)
      .bind(state.trial.week, state.trial.length, account, state.trial.version + ':' + state.trial.rule, sessionId, state.objectives.depth, score, state.tick, now),
  ]);
  return !!results[0].meta.changes;
}

export const trialAttemptsToday = async (db, accountId, now) => (await db.prepare(
  "SELECT COUNT(*) n FROM combat_sessions q JOIN session_members qm ON qm.session_id=q.id WHERE qm.account_id=?1 AND q.created_at>=?2 AND json_valid(q.state) AND json_extract(q.state,'$.activity')='trial'")
  .bind(accountId, now - now % DAY).first()).n;

const ORDER = 'r.score DESC,r.created_at,r.account_id';
const ELIGIBLE = "JOIN chars c ON c.account_id=r.account_id AND c.mode='phlt' AND c.flagged=0 AND c.validation_status='verified'";
async function board(db, week, length, accountId) {
  const tag = trialTag(week);
  const rows = (await db.prepare(`SELECT a.name,r.account_id,r.depth,r.score,r.ticks FROM trial_results r ${ELIGIBLE} JOIN accounts a ON a.id=r.account_id
    WHERE r.week=?1 AND r.length=?2 AND r.rules=?3 ORDER BY ${ORDER} LIMIT ${TRIAL_RULES.boardSize}`).bind(week, length, tag).all()).results;
  const mine = await db.prepare(`SELECT r.depth,r.score,r.ticks,r.session_id,
      (SELECT COUNT(*)+1 FROM trial_results o JOIN chars oc ON oc.account_id=o.account_id AND oc.mode='phlt' AND oc.flagged=0 AND oc.validation_status='verified'
        WHERE o.week=r.week AND o.length=r.length AND o.rules=r.rules AND (o.score>r.score OR (o.score=r.score AND (o.created_at<r.created_at OR (o.created_at=r.created_at AND o.account_id<r.account_id))))) AS placement
    FROM trial_results r ${ELIGIBLE} WHERE r.week=?1 AND r.length=?2 AND r.rules=?3 AND r.account_id=?4`).bind(week, length, tag, accountId).first();
  return {
    rows: rows.map((r, i) => ({placement: i + 1, name: r.name, depth: r.depth, score: r.score, me: r.account_id === accountId})),
    mine: mine ? {depth: mine.depth, score: mine.score, placement: mine.placement} : null,
  };
}

export async function trial(req, env) {
  const account = await assertAccountFeature(req, env, 'weekly_trial'), db = env.DB, now = Date.now();
  const c = await db.prepare('SELECT flagged,validation_status,updated_at FROM chars WHERE account_id=?1').bind(account.id).first();
  if (!c || c.flagged || c.validation_status !== 'verified' || !c.updated_at || c.updated_at < now - 30 * DAY) throw new HttpError(403, 'trial_locked');
  if (!await rateLimit(db, 'trial:' + account.id, 120, 60)) throw new HttpError(429, 'rate_limited');
  const week = trialWeekId(now), used = await trialAttemptsToday(db, account.id, now);
  return {
    v: 1, now,
    rules: {version: GAME.SESSION_TRIAL.version, attempts_per_day: TRIAL_RULES.attemptsPerDay, lengths: GAME.SESSION_TRIAL.lengths, board_size: TRIAL_RULES.boardSize},
    week: {id: week, start: trialWeekStart(week), end: trialWeekStart(week + 1), rule: GAME.sessionTrialRule(week).id, tag: trialTag(week)},
    attempts: {used, left: Math.max(0, TRIAL_RULES.attemptsPerDay - used)},
    boards: {short: await board(db, week, 'short', account.id), long: await board(db, week, 'long', account.id)},
  };
}
