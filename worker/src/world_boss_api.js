import {worldBossCurrent, worldBossHit, worldBossRewards} from './world_boss.js';

// 3.3: API world boss.
export async function worldBoss(req, env) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const boss = await worldBossCurrent(env.DB);
    if (!boss) return Response.json({ok: true, boss: null});
    const rewards = await worldBossRewards(env.DB, boss.id);
    return Response.json({ok: true, boss, top: rewards.slice(0, 10)});
  }
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const {boss_id, snapshot, nonce} = body;
    const accountId = req.headers.get('x-account-id') || 'anon';
    if (!boss_id || !nonce) return Response.json({ok: false, msg: 'Thiếu tham số'}, {status: 400});
    const r = await worldBossHit(env.DB, boss_id, accountId, snapshot || {}, nonce);
    return Response.json(r, {status: r.ok ? 200 : 400});
  }
  return Response.json({ok: false}, {status: 405});
}
