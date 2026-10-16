import {worldBossCurrent, worldBossHit, worldBossRewards} from './world_boss.js';
import {auth} from './account.js';

// 3.3: API world boss.
// NOTE (wave1 W1-0): index.js đọc body qua readJson() trước rồi truyền vào tham số
// thứ 3 — handler KHÔNG đọc lại req.json() (body đã bị tiêu thụ). Fallback req.json()
// chỉ giữ cho unit test gọi handler trực tiếp.
export async function worldBoss(req, env, body) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const boss = await worldBossCurrent(env.DB);
    if (!boss) return Response.json({ok: true, boss: null});
    const rewards = await worldBossRewards(env.DB, boss.id);
    return Response.json({ok: true, boss, top: rewards.slice(0, 10)});
  }
  if (req.method === 'POST') {
    const b = body && typeof body === "object" ? body : await req.json().catch(() => ({}));
    const {boss_id, snapshot, nonce} = b;
    // Legacy rows may use account_id 'anon' from pre-Bearer <redacted>; do not delete or rewrite them here.
    const acc = await auth(req, env);
    const accountId = acc.id;
    if (!boss_id || !nonce) return Response.json({ok: false, msg: 'Thiếu tham số'}, {status: 400});
    const r = await worldBossHit(env.DB, boss_id, accountId, snapshot || {}, nonce);
    return Response.json(r, {status: r.ok ? 200 : 400});
  }
  return Response.json({ok: false}, {status: 405});
}
