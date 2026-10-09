// Telemetry ẩn danh tối thiểu — mục 0.4 của DEPTH_ROADMAP.
// Không định danh bền: client tự tính cohort (install_week, active_days bucket)
// và chỉ gửi bucket tổng hợp. Không nhận chuỗi tự do ngoài allowlist.
import { HttpError, ipHash } from "./http.js";
import { rateLimit } from "./db.js";
import { admin } from "./ladder.js";

export const TELE_RETENTION_MS = 90 * 864e5;
export const TELE_MAX_BATCH = 50;
const WEEK_RE = /^\d{4}-W\d{2}$/;
const AD_BUCKET = new Set(["1", "2-6", "7-13", "14-29", "30+"]);
const MODE_RE = /^[a-z0-9]{0,8}$/;

// event -> kiểm tra value (đồng bộ với js/telemetry.js TELE_EVENTS)
const EVENT_CHECKS = {
  active_day: v => v && (v.weekend === 0 || v.weekend === 1),
  session_length: v => ["<5m", "5-15m", "15-60m", "60m+"].includes(v),
  feature_used: v => typeof v === "string" && /^[a-z0-9_]{1,24}$/.test(v),
  report_detail_opened: v => v == null,
  advisor_suggestion_applied: v => ["gear", "skill", "attrs"].includes(v),
  trial_started: v => typeof v === "string" && /^[a-z0-9_]{1,24}$/.test(v),
  gold_sink_spent: v => v && typeof v.sink === "string" && /^[a-z0-9_]{1,24}$/.test(v.sink) && typeof v.amount === "string" && v.amount.length <= 16,
  gold_total: v => ["<1k", "1k-10k", "10k-100k", "100k-1M", "1M+"].includes(v),
  story_read: v => typeof v === "string" && /^[a-z0-9_]{1,16}$/.test(v),
};

export function cleanTelemetryEvent(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) throw new HttpError(400, "bad_event", "Sự kiện không hợp lệ");
  const check = EVENT_CHECKS[e.e];
  if (!check) throw new HttpError(400, "bad_event", "Loại sự kiện không được phép");
  if (!check(e.v)) throw new HttpError(400, "bad_event", "Giá trị sự kiện không hợp lệ");
  if (typeof e.iw !== "string" || !WEEK_RE.test(e.iw)) throw new HttpError(400, "bad_event", "Cohort tuần không hợp lệ");
  if (typeof e.ad !== "string" || !AD_BUCKET.has(e.ad)) throw new HttpError(400, "bad_event", "Bucket ngày hoạt động không hợp lệ");
  if (typeof e.mode !== "string" || !MODE_RE.test(e.mode)) throw new HttpError(400, "bad_event", "Mode không hợp lệ");
  const at = Number(e.at);
  const now = Date.now();
  if (!Number.isFinite(at) || at < now - 864e5 || at > now + 6e4) throw new HttpError(400, "bad_event", "Thời gian sự kiện không hợp lệ");
  return { e: e.e, v: e.v == null ? null : JSON.stringify(e.v), iw: e.iw, ad: e.ad, mode: e.mode, at: Math.floor(at) };
}

export function cleanTelemetryBatch(body) {
  const events = body && body.events;
  if (!Array.isArray(events) || events.length === 0) throw new HttpError(400, "bad_batch", "Batch trống");
  if (events.length > TELE_MAX_BATCH) throw new HttpError(400, "bad_batch", `Tối đa ${TELE_MAX_BATCH} sự kiện mỗi batch`);
  return events.map(cleanTelemetryEvent);
}

export async function purgeTelemetry(db, now = Date.now()) {
  await db.prepare("DELETE FROM telemetry_events WHERE at<?1").bind(now - TELE_RETENTION_MS).run();
}

export async function telemetry(req, env, body, url, ectx) {
  const events = cleanTelemetryBatch(body);
  const ih = await ipHash(req, env);
  if (!(await rateLimit(env.DB, "tele:" + ih, 240, 3600))) throw new HttpError(429, "rate", "Gửi quá nhiều sự kiện, thử lại sau");
  const now = Date.now();
  await purgeTelemetry(env.DB, now);
  await env.DB.batch(
    events.map(e =>
      env.DB.prepare("INSERT INTO telemetry_events(at,event,install_week,active_days,mode,value) VALUES(?1,?2,?3,?4,?5,?6)")
        .bind(e.at, e.e, e.iw, e.ad, e.mode, e.v)
    )
  );
  return { ok: true, accepted: events.length };
}

// Tổng hợp cho admin: số lượng theo sự kiện/ngày trong N ngày gần nhất.
export async function adminTelemetry(req, env, body, url) {
  admin(req, env);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const event = url.searchParams.get("event") || null;
  if (event && !EVENT_CHECKS[event]) throw new HttpError(400, "bad_event", "Loại sự kiện không được phép");
  const since = Date.now() - days * 864e5;
  const rows = await env.DB.prepare(
    `SELECT event, CAST(at/86400000 AS INTEGER) AS day, COUNT(*) AS n
     FROM telemetry_events WHERE at>=?1 AND (?2 IS NULL OR event=?2)
     GROUP BY event, day ORDER BY day DESC, event LIMIT 5000`
  ).bind(since, event).all();
  return { rows: rows.results };
}
