// Tài khoản online: đăng ký, heartbeat (đo giờ chơi phía server), đồng bộ save.
import { HttpError, bearer, sha256Hex, randomToken, ipHash } from "./http.js";
import { rateLimit } from "./db.js";
import { applyValidation } from "./ladder.js";
import { GAME } from "../gen/game.js";

// Khớp với js/save.js: offline tối đa 8 giờ mỗi lần, 12 giờ mỗi 24 giờ.
export const OFFLINE_MAX = 8 * 3600;
export const OFFLINE_DAY_MAX = 12 * 3600;
// Khoảng cách tối đa giữa hai heartbeat vẫn tính là đang chơi (client gửi mỗi 60 giây).
export const HB_ONLINE_GAP = 150;
// Chỉ nhận đăng ký khi nhân vật còn dưới bậc Sơ cấp, để đồng hồ server đo được từ đầu.
export const REGISTER_MAX_LVL = 39;
const SAVE_MAX_BYTES = 1 << 20;

const NAME_RE = /^[\p{L}\p{N} _.\-]{1,16}$/u;

export function cleanName(n) {
  const s = String(n ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(s)) throw new HttpError(400, "bad_name", "Tên 1–16 ký tự, chỉ chữ, số, khoảng trắng và . _ -");
  return s;
}

// Chế độ nào được mở tài khoản online. CTC luôn mở; PHLT/2.0 chỉ khi flag riêng của chế độ đó bật.
// Gọi parseSave không truyền env (các đường cũ) vẫn chỉ nhận CTC: mặc định đóng.
export const ACCOUNT_MODE_FLAGS = Object.freeze({ phlt: "online_account_phlt", g2: "online_account_g2" });
export function accountModeOpen(env, mode) {
  if (mode === "ctc") return true;
  const flag = Object.prototype.hasOwnProperty.call(ACCOUNT_MODE_FLAGS, mode) ? ACCOUNT_MODE_FLAGS[mode] : null;
  return !!(env && flag && GAME.featureEnabled(flag, mode, env.FEATURE_FLAGS, false));
}

// Nhận save ở dạng chuỗi pack ({d,h}) hoặc object trạng thái; trả về object trạng thái.
export function parseSave(save, env = null) {
  let state = save;
  if (typeof save === "string") {
    if (save.length > SAVE_MAX_BYTES) throw new HttpError(413, "save_too_large");
    try {
      const o = JSON.parse(save);
      state = o && typeof o.d === "string" ? JSON.parse(o.d) : o;
    } catch {
      throw new HttpError(400, "bad_save");
    }
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new HttpError(400, "bad_save");
  if (JSON.stringify(state).length > SAVE_MAX_BYTES) throw new HttpError(413, "save_too_large");
  if (state.sandbox) throw new HttpError(400, "sandbox_save");
  if (state.mode !== "ctc") {
    if (!env || !Object.prototype.hasOwnProperty.call(ACCOUNT_MODE_FLAGS, state.mode))
      throw new HttpError(400, "not_ctc", "Chỉ nhân vật Công Thành Chiến được chơi online");
    if (!accountModeOpen(env, state.mode)) throw new HttpError(403, "mode_not_open", "Chế độ này chưa mở tài khoản online");
  }
  if (!state.fac) throw new HttpError(400, "no_faction");
  if (state.cid != null && !/^c_[A-Za-z0-9_-]{8,100}$/.test(String(state.cid))) throw new HttpError(400, "bad_character_id");
  const lvl = Math.floor(+state.lvl);
  if (!(lvl >= 1 && lvl <= 300)) throw new HttpError(400, "bad_level");
  return state;
}

export async function auth(req, env) {
  const tok = bearer(req);
  if (!tok) throw new HttpError(401, "no_token");
  const acc = await env.DB.prepare("SELECT * FROM accounts WHERE token_hash=?1")
    .bind(await sha256Hex(tok))
    .first();
  if (!acc) throw new HttpError(401, "bad_token");
  return acc;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const d = await r.json().catch(() => ({}));
  return !!d.success;
}

export async function register(req, env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "bad_request");
  const ih = await ipHash(req, env);
  if (!(await rateLimit(env.DB, "reg:" + ih, 5, 3600)))
    throw new HttpError(429, "rate_limited", "Đăng ký quá nhiều, thử lại sau");
  if (!(await verifyTurnstile(env, body.turnstile, req.headers.get("cf-connecting-ip"))))
    throw new HttpError(403, "captcha", "Xác minh chống bot không thành công");
  const name = cleanName(body.name);
  const state = parseSave(body.save, env);
  if (state.lvl > REGISTER_MAX_LVL)
    throw new HttpError(400, "too_late", `Chỉ đăng ký được khi nhân vật dưới cấp ${REGISTER_MAX_LVL + 1}`);

  const id = randomToken(9);
  const token = randomToken(24);
  const characterId = String(state.cid || "c_" + randomToken(12));
  state.cid = characterId;
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO accounts(id,token_hash,name,created_at,ip_hash,last_hb) VALUES(?1,?2,?3,?4,?5,?4)"
      ).bind(id, await sha256Hex(token), name, now, ih),
      env.DB.prepare(
        "INSERT INTO chars(account_id,character_id,fac,sex,lvl,xp,snapshot,updated_at,sync_n,sync_rev,mode) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,1,1,?9)"
      ).bind(id, characterId, String(state.fac), state.sex ? 1 : 0, Math.floor(state.lvl), +state.xp || 0, JSON.stringify(state), now, state.mode),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, "name_taken", "Tên đã có người dùng");
    throw e;
  }
  const v = await applyValidation(env, id, state, 0, 1);
  return { id, token, name, character_id: characterId, sync_rev: 1, play_sec: 0, ...v };
}

// Cộng giờ chơi theo đồng hồ server. Hai tab cùng gửi cũng chỉ cộng đúng thời gian thực đã trôi.
export function creditTime(acc, now) {
  let play = +acc.play_sec || 0,
    offT0 = acc.off_t0,
    offSec = +acc.off_sec || 0;
  const gap = acc.last_hb ? Math.max(0, (now - acc.last_hb) / 1000) : 0;
  if (gap <= HB_ONLINE_GAP) play += gap;
  else {
    if (!offT0 || now - offT0 >= 864e5) {
      offT0 = now;
      offSec = 0;
    }
    const credit = Math.min(OFFLINE_MAX, gap, Math.max(0, OFFLINE_DAY_MAX - offSec));
    offSec += credit;
    play += credit;
  }
  return { play_sec: play, off_t0: offT0 ?? null, off_sec: offSec, last_hb: now };
}

export async function heartbeat(req, env) {
  let acc = await auth(req, env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = creditTime(acc, Date.now());
    const r = await env.DB.prepare(
      "UPDATE accounts SET play_sec=?2,off_t0=?3,off_sec=?4,last_hb=?5 WHERE id=?1 AND last_hb IS ?6"
    ).bind(acc.id, t.play_sec, t.off_t0, t.off_sec, t.last_hb, acc.last_hb ?? null).run();
    if (r.meta.changes) {
      const now = Date.now();
      return { play_sec: Math.floor(t.play_sec), server_now: now, utc_week: Math.floor((now / 864e5 + 3) / 7) };
    }
    acc = await auth(req, env);
  }
  throw new HttpError(409, "heartbeat_conflict", "Heartbeat đồng thời, thử lại sau");
}

export async function sync(req, env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "bad_request");
  const acc = await auth(req, env);
  if (!(await rateLimit(env.DB, "sync:" + acc.id, 20, 3600)))
    throw new HttpError(429, "rate_limited", "Đồng bộ quá nhiều, thử lại sau");
  const state = parseSave(body.save, env);
  const row = await env.DB.prepare("SELECT character_id,sync_rev,snapshot,updated_at,mode FROM chars WHERE account_id=?1").bind(acc.id).first();
  if (!row) throw new HttpError(404, "character_not_found");
  // A character's mode is its identity: a transfer or edited save must never move an account between mode economies and boards.
  if ((row.mode || "ctc") !== state.mode) throw new HttpError(409, "mode_locked", "Tài khoản online đã khóa theo chế độ của nhân vật");
  if (!state.cid || !row.character_id || String(state.cid) !== String(row.character_id))
    throw new HttpError(409, "character_mismatch", "Mã online thuộc nhân vật khác hoặc cần liên kết lại");
  const baseRev = body && body.base_rev == null ? null : Math.max(0, Math.floor(+body.base_rev || 0));
  if (baseRev == null && (row.sync_rev || 1) > 1 && !body.force)
    throw new HttpError(409, "sync_conflict", "Cần tải lại phiên bản máy chủ trước khi đồng bộ", {
      server_rev: row.sync_rev,
      server_save: row.snapshot,
      server_updated_at: row.updated_at,
    });
  if (baseRev != null && baseRev !== row.sync_rev && !body.force)
    throw new HttpError(409, "sync_conflict", "Bản lưu trên máy chủ đã thay đổi", {
      server_rev: row.sync_rev,
      server_save: row.snapshot,
      server_updated_at: row.updated_at,
    });
  const now = Date.now();
  const q = body.force || baseRev == null
    ? `UPDATE chars SET fac=?2,sex=?3,lvl=?4,xp=?5,snapshot=?6,updated_at=?7,sync_n=sync_n+1,sync_rev=sync_rev+1,validation_status='pending_verification',bracket=NULL WHERE account_id=?1 RETURNING sync_rev`
    : `UPDATE chars SET fac=?2,sex=?3,lvl=?4,xp=?5,snapshot=?6,updated_at=?7,sync_n=sync_n+1,sync_rev=sync_rev+1,validation_status='pending_verification',bracket=NULL WHERE account_id=?1 AND sync_rev=?8 RETURNING sync_rev`;
  const binds = [acc.id, String(state.fac), state.sex ? 1 : 0, Math.floor(state.lvl), +state.xp || 0, JSON.stringify(state), now];
  if (!(body.force || baseRev == null)) binds.push(baseRev);
  const updated = await env.DB.prepare(q).bind(...binds).first();
  if (!updated) {
    const latest = await env.DB.prepare("SELECT sync_rev,snapshot,updated_at FROM chars WHERE account_id=?1").bind(acc.id).first();
    throw new HttpError(409, "sync_conflict", "Bản lưu trên máy chủ đã thay đổi", {
      server_rev: latest.sync_rev,
      server_save: latest.snapshot,
      server_updated_at: latest.updated_at,
    });
  }
  const v = await applyValidation(env, acc.id, state, +acc.play_sec || 0, updated.sync_rev);
  return { ok: true, lvl: Math.floor(state.lvl), play_sec: Math.floor(acc.play_sec), sync_rev: updated.sync_rev, ...v };
}

export async function recoverSnapshot(req, env) {
  const acc = await auth(req, env);
  const row = await env.DB.prepare("SELECT snapshot,sync_rev,updated_at FROM chars WHERE account_id=?1").bind(acc.id).first();
  if (!row) throw new HttpError(404, "no_character");
  return { id: acc.id, name: acc.name, snapshot: row.snapshot, sync_rev: row.sync_rev, updated_at: row.updated_at };
}

export async function me(req, env) {
  const acc = await auth(req, env);
  const ch = await env.DB.prepare("SELECT character_id,fac,lvl,updated_at,power,bracket,flagged,validation_status,validation_note,sync_rev,mode FROM chars WHERE account_id=?1").bind(acc.id).first();
  const fl = await env.DB.prepare("SELECT code,detail,at FROM flags WHERE account_id=?1 AND cleared_at IS NULL ORDER BY at").bind(acc.id).all();
  return { id: acc.id, name: acc.name, created_at: acc.created_at, play_sec: Math.floor(acc.play_sec), char: ch || null, flags: fl.results };
}

// One-time migration for legacy accounts created before character_id existed.
// It links only the authenticated account and never replaces its snapshot.
export async function recover(req, env, body) {
  const acc = await auth(req, env);
  const characterId = String(body && body.character_id || "");
  if (!/^c_[A-Za-z0-9_-]{8,100}$/.test(characterId)) throw new HttpError(400, "bad_character_id");
  const ch = await env.DB.prepare("SELECT fac,character_id FROM chars WHERE account_id=?1").bind(acc.id).first();
  if (!ch) throw new HttpError(404, "character_not_found");
  if (ch.character_id && ch.character_id !== characterId) throw new HttpError(409, "character_mismatch");
  await env.DB.prepare("UPDATE chars SET character_id=?2 WHERE account_id=?1 AND character_id IS NULL").bind(acc.id, characterId).run();
  const linked = await env.DB.prepare("SELECT character_id FROM chars WHERE account_id=?1").bind(acc.id).first();
  if (linked.character_id !== characterId) throw new HttpError(409, "character_mismatch");
  return { ok: true, character_id: characterId };
}
