import { GAME } from "../gen/game.js";
import { auth } from "./account.js";
import { HttpError } from "./http.js";

export function featureConfig(req, env) {
  const mode = new URL(req.url).searchParams.get("mode") || "ctc";
  if (!["ctc","phlt","g2"].includes(mode)) throw new HttpError(400,"bad_mode");
  return { turnstile: env.TURNSTILE_SITEKEY || "", v: 1,
    combat_version: GAME.COMBAT_MODEL_VERSION, ...GAME.featureConfigSnapshot(mode,env.FEATURE_FLAGS) };
}

export async function assertAccountFeature(req, env, feature) {
  const account = await auth(req,env);
  const character = await env.DB.prepare("SELECT snapshot,power,validation_status FROM chars WHERE account_id=?1").bind(account.id).first();
  let state;
  try { state = character && JSON.parse(character.snapshot); } catch (e) {}
  // W1-2: power do SERVER tự tính lúc validate (ladder.js applyValidation từ
  // snapshot đã kiểm định) — không phải số client khai. Gắn sẵn vào account để
  // handler dùng, khỏi SELECT thêm lần nữa.
  const p = Math.floor(+character?.power || 0);
  account.charPower = Number.isFinite(p) && p > 0 ? p : 0;
  account.charValidation = character?.validation_status || null;
  // The request's query/body mode is not evidence of the account's mode.
  if (!state || !GAME.featureEnabled(feature,state.mode,env.FEATURE_FLAGS,!!state.sandbox))
    throw new HttpError(403,"feature_disabled","Tính năng chưa mở cho nhân vật hoặc chế độ này");
  return account;
}

export function guardedFeature(feature, handler) {
  return async function (req, env, ...args) {
    const account = await assertAccountFeature(req,env,feature);
    // W1-2: truyền account đã auth (kèm charPower từ DB) cho handler; các handler
    // cũ bỏ qua tham số thừa này.
    return handler(req,env,...args,account);
  };
}

/** Fail-closed: guild tech cần biến Worker riêng, không chỉ FEATURE_FLAGS client. */
export function guildTechServerGate(env) {
  if (String(env?.GUILD_TECH_SERVER_ENABLED || "") !== "1") {
    throw new HttpError(
      503,
      "feature_disabled",
      "Cây công nghệ bang tắt trên máy chủ (GUILD_TECH_SERVER_ENABLED)"
    );
  }
}
