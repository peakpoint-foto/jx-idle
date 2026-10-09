// Kết quả kiểm định, bảng xếp hạng theo bậc, bảng thông báo nghi gian lận và gỡ cờ (quản trị).
import { HttpError } from "./http.js";
import { validateChar, BRACKETS, FLAG_TEXT } from "./validate.js";

// Validation must belong to the same snapshot revision. Each batch is atomic;
// stale requests cannot overwrite newer power or insert flags for an old save.
export async function applyValidation(env, accId, state, playSec, revision = null) {
  const r = validateChar(state, playSec);
  const now = Date.now();
  const stmts = r.flags.map(([code, detail]) =>
    env.DB.prepare(`INSERT INTO flags(account_id,code,detail,at)
      SELECT ?1,?2,?3,?4 WHERE EXISTS(
        SELECT 1 FROM chars WHERE account_id=?1 AND (?5 IS NULL OR sync_rev=?5))
      AND NOT EXISTS(SELECT 1 FROM flags WHERE account_id=?1 AND code=?2 AND cleared_at IS NULL)`)
      .bind(accId, code, String(detail).slice(0,300), now, revision)
  );
  stmts.push(env.DB.prepare(`UPDATE chars SET power=?2,
    bracket=CASE WHEN ?4=1 OR EXISTS(SELECT 1 FROM flags WHERE account_id=?1 AND cleared_at IS NULL) THEN NULL ELSE ?3 END,
    flagged=EXISTS(SELECT 1 FROM flags WHERE account_id=?1 AND cleared_at IS NULL),
    validation_status=CASE WHEN EXISTS(SELECT 1 FROM flags WHERE account_id=?1 AND cleared_at IS NULL)
      THEN 'flagged' WHEN ?4=1 THEN 'pending_verification' ELSE 'verified' END,
    validation_note=?5 WHERE account_id=?1 AND (?6 IS NULL OR sync_rev=?6)`)
    .bind(accId, r.power, r.bracket ? r.bracket.k : null, r.pending.length ? 1 : 0,
      r.pending.map(([, detail])=>detail).join("; ") || null, revision));
  await env.DB.batch(stmts);
  const row = await env.DB.prepare("SELECT power,bracket,flagged,validation_status,validation_note FROM chars WHERE account_id=?1").bind(accId).first();
  const flags = await env.DB.prepare("SELECT code FROM flags WHERE account_id=?1 AND cleared_at IS NULL").bind(accId).all();
  return { ...row, flagged: !!row.flagged, flags: flags.results.map(x=>x.code) };
}
export async function ladder(req, env, body, url) {
  const b = url.searchParams.get("b") || "so";
  if (!BRACKETS.some((x) => x.k === b)) throw new HttpError(400, "bad_bracket");
  const cutoff = Date.now() - 30 * 864e5;
  const rows = await env.DB.prepare(
    `SELECT a.name, c.fac, c.lvl, c.power, c.updated_at AS last_sync FROM chars c JOIN accounts a ON a.id=c.account_id
     WHERE c.mode='ctc' AND c.bracket=?1 AND c.flagged=0 AND c.validation_status='verified' AND (c.updated_at IS NULL OR c.updated_at>?2)
     ORDER BY c.power DESC, c.lvl DESC LIMIT 100`
  ).bind(b, cutoff).all();
  return {
    bracket: b,
    brackets: BRACKETS.map((x) => ({ k: x.k, n: x.n, lo: x.lo, hi: Number.isFinite(x.hi) ? x.hi : null })),
    rows: rows.results.map((x, i) => ({ rank: i + 1, ...x })),
  };
}

export async function profile(req, env, body, url) {
  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) throw new HttpError(400, "missing_name");
  const row = await env.DB.prepare(
    `SELECT a.name,c.fac,c.lvl,c.power,c.bracket,c.flagged,c.validation_status,c.mode,c.updated_at AS last_sync
     FROM accounts a JOIN chars c ON c.account_id=a.id WHERE a.name=?1 COLLATE NOCASE`
  ).bind(name).first();
  if (!row) throw new HttpError(404, "not_found");
  return {
    name: row.name,
    fac: row.fac,
    lvl: row.lvl,
    power: row.power,
    bracket: row.bracket,
    mode: row.mode || "ctc",
    ranked: (row.mode || "ctc") === "ctc" && row.validation_status === "verified" && !row.flagged && !!row.bracket,
    validation_status: row.validation_status || (row.flagged ? "flagged" : "verified"),
    last_sync: row.last_sync,
  };
}

// Bảng thông báo: nhân vật bị loại khỏi bảng xếp hạng vì nghi gian lận (chỉ tên và lý do chung).
export async function notices(req, env) {
  const rows = await env.DB.prepare(
    `SELECT a.name, c.lvl, f.code, MAX(f.at) AS at FROM flags f JOIN accounts a ON a.id=f.account_id
     JOIN chars c ON c.account_id=f.account_id
     WHERE f.cleared_at IS NULL GROUP BY f.account_id, f.code ORDER BY at DESC LIMIT 200`
  ).all();
  const by = new Map();
  for (const r of rows.results) {
    const o = by.get(r.name) || { name: r.name, lvl: r.lvl, at: r.at, reasons: [] };
    const t = FLAG_TEXT[r.code] || r.code;
    if (!o.reasons.includes(t)) o.reasons.push(t);
    o.at = Math.max(o.at, r.at);
    by.set(r.name, o);
  }
  return { rows: [...by.values()].sort((a, b) => b.at - a.at).slice(0, 100) };
}

/* ---- Quản trị: header x-admin-key phải khớp secret ADMIN_KEY ---- */
export function admin(req, env) {
  const k = req.headers.get("x-admin-key") || "";
  if (k.length < 16 || k.length > 256) throw new HttpError(403, "forbidden");
  if (env.ADMIN_KEYS) {
    let keys;
    try { keys = JSON.parse(env.ADMIN_KEYS); } catch { throw new HttpError(503, "admin_config_invalid"); }
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) throw new HttpError(503, "admin_config_invalid");
    for (const [id, secret] of Object.entries(keys)) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof secret !== "string" || secret.length < 16 || secret.length > 256)
        throw new HttpError(503, "admin_config_invalid");
      if (secret.length === k.length) {
        let diff = 0;
        for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ k.charCodeAt(i);
        if (diff === 0) return "admin:" + id;
      }
    }
    throw new HttpError(403, "forbidden");
  }
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length !== k.length) throw new HttpError(403, "forbidden");
  let diff = 0;
  for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ env.ADMIN_KEY.charCodeAt(i);
  if (diff !== 0) throw new HttpError(403, "forbidden");
  return "admin";
}

export async function adminFlags(req, env, body, url) {
  admin(req, env);
  const name = url.searchParams.get("name");
  const rows = await env.DB.prepare(
    `SELECT f.id, a.name, f.code, f.detail, f.at, f.cleared_at FROM flags f JOIN accounts a ON a.id=f.account_id
     WHERE (?1 IS NULL OR a.name=?1 COLLATE NOCASE) ORDER BY f.at DESC LIMIT 200`
  ).bind(name).all();
  return { rows: rows.results };
}

// Gỡ toàn bộ cờ đang mở của một nhân vật (theo tên online).
export async function adminUnflag(req, env, body) {
  admin(req, env);
  const acc = await env.DB.prepare("SELECT id FROM accounts WHERE name=?1 COLLATE NOCASE").bind(String(body.name || "")).first();
  if (!acc) throw new HttpError(404, "not_found");
  const now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare("UPDATE flags SET cleared_at=?2 WHERE account_id=?1 AND cleared_at IS NULL").bind(acc.id, now),
    env.DB.prepare("UPDATE chars SET flagged=0,validation_status=CASE WHEN validation_status='pending_verification' THEN 'pending_verification' ELSE 'verified' END WHERE account_id=?1").bind(acc.id),
  ]);
  return { ok: true, cleared: r[0].meta.changes };
}
