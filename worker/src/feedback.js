// Góp ý của người chơi: lưu vào D1 để chủ host xem qua /api/admin/feedback (header x-admin-key),
// và nếu có biến FEEDBACK_WEBHOOK (Discord/Slack-compatible) thì đẩy thêm một tin nhắn ngắn.
import { HttpError, ipHash } from "./http.js";
import { rateLimit } from "./db.js";
import { admin } from "./ladder.js";

export const FB_CATS = { bug: "Lỗi", ui: "Giao diện", balance: "Cân bằng", idea: "Ý tưởng", other: "Khác" };
export const FB_MAX = 2000;
const CTX_KEYS = ["mode", "lvl", "fac", "stage", "ver", "w", "h", "ua", "lang", "admin"];

// Chuẩn hoá nội dung gửi lên; ném HttpError nếu không hợp lệ.
export function cleanFeedback(body) {
  const text = String((body && body.text) || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (text.length < 5) throw new HttpError(400, "too_short", "Nội dung góp ý quá ngắn (tối thiểu 5 ký tự)");
  if (text.length > FB_MAX) throw new HttpError(400, "too_long", `Nội dung góp ý tối đa ${FB_MAX} ký tự`);
  const cat = Object.prototype.hasOwnProperty.call(FB_CATS, body.cat) ? body.cat : "other";
  const contact = String(body.contact || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
  const ctx = {};
  if (body.ctx && typeof body.ctx === "object" && !Array.isArray(body.ctx))
    for (const k of CTX_KEYS) {
      const v = body.ctx[k];
      if (typeof v === "number" && Number.isFinite(v)) ctx[k] = v;
      else if (typeof v === "string" || typeof v === "boolean") ctx[k] = String(v).slice(0, 200);
    }
  return { text, cat, contact, ctx };
}

export async function feedback(req, env, body, url, ectx) {
  const fb = cleanFeedback(body);
  const ih = await ipHash(req, env);
  if (!(await rateLimit(env.DB, "fb:" + ih, 5, 3600))) throw new HttpError(429, "rate", "Bạn đã gửi nhiều góp ý trong giờ này, thử lại sau");
  const at = Date.now();
  const r = await env.DB.prepare("INSERT INTO feedback(at,cat,text,contact,ctx,ip_hash,status) VALUES(?1,?2,?3,?4,?5,?6,'open') RETURNING id")
    .bind(at, fb.cat, fb.text, fb.contact || null, JSON.stringify(fb.ctx), ih).first();
  if (env.FEEDBACK_WEBHOOK) {
    const msg = `[Góp ý #${r.id} · ${FB_CATS[fb.cat]}] ${fb.text.slice(0, 1500)}${fb.contact ? `\nLiên hệ: ${fb.contact}` : ""}\n${JSON.stringify(fb.ctx).slice(0, 300)}`;
    const p = fetch(env.FEEDBACK_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: msg, text: msg, allowed_mentions: { parse: [] } }) }).catch(() => {});
    if (ectx && ectx.waitUntil) ectx.waitUntil(p); else await p;
  }
  return { ok: true, id: r.id };
}

export async function adminFeedback(req, env, body, url) {
  admin(req, env);
  const st = url.searchParams.get("status");
  const rows = await env.DB.prepare(
    "SELECT id,at,cat,text,contact,ctx,status FROM feedback WHERE (?1 IS NULL OR status=?1) ORDER BY at DESC LIMIT 200"
  ).bind(st).all();
  return { rows: rows.results.map((x) => ({ ...x, ctx: JSON.parse(x.ctx || "{}") })) };
}

// Đánh dấu đã xử lý (status=done) hoặc mở lại (status=open).
export async function adminFeedbackSet(req, env, body) {
  admin(req, env);
  const id = Math.floor(+body.id), status = body.status === "open" ? "open" : "done";
  if (!(id > 0)) throw new HttpError(400, "bad_id");
  const r = await env.DB.prepare("UPDATE feedback SET status=?2 WHERE id=?1").bind(id, status).run();
  if (!r.meta.changes) throw new HttpError(404, "not_found");
  return { ok: true, id, status };
}
