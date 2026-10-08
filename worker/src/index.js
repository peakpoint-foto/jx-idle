// Worker của Võ Lâm Idle: phục vụ file tĩnh (binding ASSETS) và API online cho Công Thành Chiến.
// Chỉ đường dẫn /api/* chạy qua Worker (assets.run_worker_first trong wrangler.jsonc).
import { HttpError, json, readJson, CORS } from "./http.js";
import { ensureSchema } from "./db.js";
import { register, heartbeat, sync, me, recover, recoverSnapshot } from "./account.js";
import { ladder, notices, adminFlags, adminUnflag } from "./ladder.js";
import { feedback, adminFeedback, adminFeedbackSet, adminFeedbackMetrics } from "./feedback.js";
import { profile } from "./ladder.js";
import { duels, guild, room } from "./social.js";
import { featureConfig, guardedFeature } from "./capabilities.js";
import {friends} from './lobby.js';
import {economy} from './economy.js';
import {sessions} from './sessions.js';

const ROUTES = {
  "GET /api/sessions": sessions,
  "POST /api/sessions": sessions,
  "GET /api/economy": economy,
  "POST /api/economy": economy,
  "GET /api/config": featureConfig,
  "POST /api/register": (req, env, body) => register(req, env, body),
  "POST /api/hb": (req, env) => heartbeat(req, env),
  "POST /api/sync": (req, env, body) => sync(req, env, body),
  "GET /api/me": (req, env) => me(req, env),
  "POST /api/recover": (req, env, body) => recover(req, env, body),
  "GET /api/ladder": ladder,
  "GET /api/notices": notices,
  "GET /api/profile": profile,
  "GET /api/recover": recoverSnapshot,
  "GET /api/duels": guardedFeature("async_duels", duels),
  "POST /api/duel": guardedFeature("async_duels", duels),
  "GET /api/guild": guardedFeature("guild_online", guild),
  "POST /api/guild": guardedFeature("guild_online", guild),
  "GET /api/room": guardedFeature("room_presence", room),
  "POST /api/room": guardedFeature("room_presence", room),
  "GET /api/friends": guardedFeature("party_lobby", friends),
  "POST /api/friends": guardedFeature("party_lobby", friends),
  "GET /api/admin/flags": adminFlags,
  "POST /api/admin/unflag": adminUnflag,
  "POST /api/feedback": feedback,
  "GET /api/admin/feedback": adminFeedback,
  "GET /api/admin/feedback/metrics": adminFeedbackMetrics,
  "POST /api/admin/feedback": adminFeedbackSet,
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const fn = ROUTES[req.method + " " + url.pathname];
    if (!fn) return json({ error: "not_found" }, 404);
    try {
      if (!env.DB) throw new HttpError(503, "no_db", "Chưa gắn cơ sở dữ liệu D1");
      await ensureSchema(env.DB);
      const body = req.method === "POST" ? await readJson(req,url.pathname==="/api/feedback"?32768:1<<20) : null;
      return json(await fn(req, env, body, url, ctx));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, msg: e.message, ...(e.data || {}) }, e.status);
      console.error("api", url.pathname, e && e.stack);
      return json({ error: "server", msg: "Lỗi máy chủ" }, 500);
    }
  },
};
