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
  const character = await env.DB.prepare("SELECT snapshot FROM chars WHERE account_id=?1").bind(account.id).first();
  let state;
  try { state = character && JSON.parse(character.snapshot); } catch (e) {}
  // The request's query/body mode is not evidence of the account's mode.
  if (!state || !GAME.featureEnabled(feature,state.mode,env.FEATURE_FLAGS,!!state.sandbox))
    throw new HttpError(403,"feature_disabled","Tính năng chưa mở cho nhân vật hoặc chế độ này");
  return account;
}

export function guardedFeature(feature, handler) {
  return async function (req, env, ...args) {
    await assertAccountFeature(req,env,feature);
    return handler(req,env,...args);
  };
}
