// Server ledger for online activity entries. The client reports a result, but
// the server owns the UTC period, idempotency key and entry quota.
import { HttpError } from "./http.js";
import { auth, parseSave } from "./account.js";

const LIMITS = { siege: 1, tk: 1, tower: 7, survival: 3 };
const KINDS = new Set(Object.keys(LIMITS));
const KEY_RE = /^[A-Za-z0-9:_-]{8,160}$/;
const CLAIM_CAPS = {
  siege: { contribution: 1_000_000, cleared: 3 },
  tk: { contribution: 1_000_000, cleared: 5 },
  tower: { contribution: 10_000_000, cleared: 10_000 },
  survival: { contribution: 10_000_000, cleared: 10_000 },
};

export function utcPeriod(kind, now = Date.now()) {
  const d = new Date(now);
  if (kind === "tower" || kind === "survival") return d.toISOString().slice(0, 10);
  const day = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5);
  return `w${Math.floor((day + 3) / 7)}`;
}

function integer(value, min, max, code) {
  const n = Math.floor(+value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, code);
  return n;
}

export function validateActivityClaim(body) {
  const kind = String(body && body.activity || "");
  if (!KINDS.has(kind)) throw new HttpError(400, "bad_activity");
  const eventKey = String(body && (body.event_key || body.run_id) || "");
  if (!KEY_RE.test(eventKey)) throw new HttpError(400, "bad_event_key");
  const cap = CLAIM_CAPS[kind];
  const contribution = integer(body && body.contribution, 0, cap.contribution, "bad_contribution");
  const cleared = integer(body && body.cleared, 0, cap.cleared, "bad_cleared");
  return { kind, eventKey, contribution, cleared, won: body && body.won ? 1 : 0 };
}

export async function activityClaim(req, env, body) {
  const acc = await auth(req, env);
  const { kind, eventKey, contribution, cleared, won } = validateActivityClaim(body);
  const char = await env.DB.prepare("SELECT lvl,snapshot FROM chars WHERE account_id=?1").bind(acc.id).first();
  if (!char) throw new HttpError(404, "character_not_found");
  let state;
  try { state = char.snapshot ? parseSave(char.snapshot) : null; } catch { state = null; }
  if (!state || state.mode !== "ctc") throw new HttpError(409, "character_not_verified");
  if (state.activityRun) throw new HttpError(409, "activity_in_progress");

  const period = utcPeriod(kind);
  const old = await env.DB.prepare("SELECT event_key,activity,period,contribution,cleared,won FROM activity_events WHERE account_id=?1 AND event_key=?2")
    .bind(acc.id, eventKey).first();
  if (old) {
    if (old.activity !== kind) throw new HttpError(409, "event_key_reuse", "Mã lượt đã được dùng cho hoạt động khác");
    return { accepted: true, duplicate: true, event_key: eventKey, period: old.period, contribution: old.contribution, cleared: old.cleared, won: !!old.won, server_now: Date.now() };
  }
  let result;
  try {
    result = await env.DB.prepare(
      `INSERT INTO activity_events(account_id,event_key,activity,mode,period,contribution,cleared,won,accepted_at)
       SELECT ?1,?2,?3,'ctc',?4,?5,?6,?7,?8
       WHERE (SELECT COUNT(*) FROM activity_events WHERE account_id=?1 AND activity=?3 AND period=?4) < ?9`
    ).bind(acc.id, eventKey, kind, period, contribution, cleared, won, Date.now(), LIMITS[kind]).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return { accepted: true, duplicate: true, event_key: eventKey, period, server_now: Date.now() };
    throw e;
  }
  if (!result || result.meta && result.meta.changes === 0)
    throw new HttpError(409, "quota_exhausted", "Đã hết lượt hoạt động theo thời gian máy chủ");
  return { accepted: true, duplicate: false, event_key: eventKey, period, server_now: Date.now() };
}
