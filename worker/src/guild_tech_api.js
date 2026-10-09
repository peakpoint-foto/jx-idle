import {guildTechContribute, guildTechDef, guildTechEffects, guildTechNodes} from './guild_tech.js';
import {seasonOf} from './seasons.js';
const getSeasonIdx = () => seasonOf(Date.now()).idx;

// 2.15: API guild tech tree.
export async function guildTech(req, env) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const guildId = url.searchParams.get('guild_id');
    if (!guildId) return Response.json({ok: false, msg: 'Thiếu guild_id'}, {status: 400});
    const seasonIdx = getSeasonIdx();
    const [nodes, eff] = await Promise.all([
      guildTechNodes(env.DB, guildId, seasonIdx),
      guildTechEffects(env.DB, guildId, seasonIdx),
    ]);
    return Response.json({ok: true, def: guildTechDef(), nodes, effects: eff, seasonIdx});
  }
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const {guild_id, node_id, gold, nonce} = body;
    // accountId từ auth — đơn giản hóa, lấy từ header
    const accountId = req.headers.get('x-account-id') || 'anon';
    if (!guild_id || !node_id || !nonce)
      return Response.json({ok: false, msg: 'Thiếu tham số'}, {status: 400});
    const seasonIdx = getSeasonIdx();
    const r = await guildTechContribute(env.DB, guild_id, accountId, node_id, gold, seasonIdx, nonce);
    return Response.json(r, {status: r.ok ? 200 : 400});
  }
  return Response.json({ok: false, msg: 'Method không hỗ trợ'}, {status: 405});
}
