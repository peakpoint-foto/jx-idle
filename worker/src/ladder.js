// Kết quả kiểm định, bảng xếp hạng theo bậc, bảng thông báo nghi gian lận và gỡ cờ (quản trị).
import { HttpError } from "./http.js";
import { validateChar, BRACKETS, FLAG_TEXT } from "./validate.js";

// Kiểm định rồi lưu lực chiến, bậc và cờ. Cờ giữ nguyên cho tới khi quản trị gỡ,
// để không thể gian lận rồi xóa dấu vết bằng một lần đồng bộ sạch.
export async function applyValidation(env, accId, state, playSec) {
  const r = validateChar(state, playSec);
  const now = Date.now();
  const active = await env.DB.prepare("SELECT code FROM flags WHERE account_id=?1 AND cleared_at IS NULL").bind(accId).all();
  const have = new Set(active.results.map((x) => x.code));
  const fresh = [];
  for (const [code, detail] of r.flags) if (!have.has(code)) { have.add(code); fresh.push([code, detail]) }
  const stmts = fresh.map(([code, detail]) =>
    env.DB.prepare("INSERT INTO flags(account_id,code,detail,at) VALUES(?1,?2,?3,?4)").bind(accId, code, String(detail).slice(0, 300), now)
  );
  stmts.push(
    env.DB.prepare("UPDATE chars SET power=?2,bracket=?3,flagged=?4 WHERE account_id=?1").bind(
      accId, r.power, r.bracket ? r.bracket.k : null, have.size ? 1 : 0
    )
  );
  await env.DB.batch(stmts);
  return { power: r.power, bracket: r.bracket ? r.bracket.k : null, flagged: have.size > 0, flags: [...have] };
}

export async function ladder(req, env, body, url) {
  const b = url.searchParams.get("b") || "so";
  if (!BRACKETS.some((x) => x.k === b)) throw new HttpError(400, "bad_bracket");
  const rows = await env.DB.prepare(
    `SELECT a.name, c.fac, c.lvl, c.power FROM chars c JOIN accounts a ON a.id=c.account_id
     WHERE c.bracket=?1 AND c.flagged=0 ORDER BY c.power DESC, c.lvl DESC LIMIT 100`
  ).bind(b).all();
  return {
    bracket: b,
    brackets: BRACKETS.map((x) => ({ k: x.k, n: x.n, lo: x.lo, hi: Number.isFinite(x.hi) ? x.hi : null })),
    rows: rows.results.map((x, i) => ({ rank: i + 1, ...x })),
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
  if (!env.ADMIN_KEY || k.length < 16 || k !== env.ADMIN_KEY) throw new HttpError(403, "forbidden");
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
    env.DB.prepare("UPDATE chars SET flagged=0 WHERE account_id=?1").bind(acc.id),
  ]);
  return { ok: true, cleared: r[0].meta.changes };
}
