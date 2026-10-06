// Tài khoản online: đăng ký, heartbeat (đo giờ chơi phía server), đồng bộ save.
import { HttpError, bearer, sha256Hex, randomToken, ipHash } from "./http.js";
import { rateLimit } from "./db.js";
import { applyValidation } from "./ladder.js";

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

// Nhận save ở dạng chuỗi pack ({d,h}) hoặc object trạng thái; trả về object trạng thái.
export function parseSave(save) {
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
  if (state.mode !== "ctc") throw new HttpError(400, "not_ctc", "Chỉ nhân vật Công Thành Chiến được chơi online");
  if (!state.fac) throw new HttpError(400, "no_faction");
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
  const ih = await ipHash(req, env);
  if (!(await rateLimit(env.DB, "reg:" + ih, 5, 3600)))
    throw new HttpError(429, "rate_limited", "Đăng ký quá nhiều, thử lại sau");
  if (!(await verifyTurnstile(env, body.turnstile, req.headers.get("cf-connecting-ip"))))
    throw new HttpError(403, "captcha", "Xác minh chống bot không thành công");
  const name = cleanName(body.name);
  const state = parseSave(body.save);
  if (state.lvl > REGISTER_MAX_LVL)
    throw new HttpError(400, "too_late", `Chỉ đăng ký được khi nhân vật dưới cấp ${REGISTER_MAX_LVL + 1}`);

  const id = randomToken(9);
  const token = randomToken(24);
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO accounts(id,token_hash,name,created_at,ip_hash,last_hb) VALUES(?1,?2,?3,?4,?5,?4)"
      ).bind(id, await sha256Hex(token), name, now, ih),
      env.DB.prepare(
        "INSERT INTO chars(account_id,fac,sex,lvl,xp,snapshot,updated_at,sync_n) VALUES(?1,?2,?3,?4,?5,?6,?7,1)"
      ).bind(id, String(state.fac), state.sex ? 1 : 0, Math.floor(state.lvl), +state.xp || 0, JSON.stringify(state), now),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, "name_taken", "Tên đã có người dùng");
    throw e;
  }
  const v = await applyValidation(env, id, state, 0);
  return { id, token, name, play_sec: 0, ...v };
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
  const acc = await auth(req, env);
  const t = creditTime(acc, Date.now());
  await env.DB.prepare("UPDATE accounts SET play_sec=?2,off_t0=?3,off_sec=?4,last_hb=?5 WHERE id=?1")
    .bind(acc.id, t.play_sec, t.off_t0, t.off_sec, t.last_hb)
    .run();
  return { play_sec: Math.floor(t.play_sec) };
}

export async function sync(req, env, body) {
  const acc = await auth(req, env);
  if (!(await rateLimit(env.DB, "sync:" + acc.id, 20, 3600)))
    throw new HttpError(429, "rate_limited", "Đồng bộ quá nhiều, thử lại sau");
  const state = parseSave(body.save);
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE chars SET fac=?2,sex=?3,lvl=?4,xp=?5,snapshot=?6,updated_at=?7,sync_n=sync_n+1 WHERE account_id=?1`
  )
    .bind(acc.id, String(state.fac), state.sex ? 1 : 0, Math.floor(state.lvl), +state.xp || 0, JSON.stringify(state), now)
    .run();
  const v = await applyValidation(env, acc.id, state, +acc.play_sec || 0);
  return { ok: true, lvl: Math.floor(state.lvl), play_sec: Math.floor(acc.play_sec), ...v };
}

export async function me(req, env) {
  const acc = await auth(req, env);
  const ch = await env.DB.prepare("SELECT fac,lvl,updated_at,power,bracket,flagged FROM chars WHERE account_id=?1").bind(acc.id).first();
  const fl = await env.DB.prepare("SELECT code,detail,at FROM flags WHERE account_id=?1 AND cleared_at IS NULL ORDER BY at").bind(acc.id).all();
  return { id: acc.id, name: acc.name, created_at: acc.created_at, play_sec: Math.floor(acc.play_sec), char: ch || null, flags: fl.results };
}
