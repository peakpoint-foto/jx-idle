import {quotaClaim} from './quota.js';

// 2.15: Guild tech tree — cả bang đóng góp vàng qua khung quota 0.3 để mở node.
// Node có cấp, reset theo mùa (season_idx). Đóng góp tích lũy; đủ cost thì lên cấp.
let TECH = null;
try {
  const fs = await import('node:fs');
  TECH = JSON.parse(fs.readFileSync('data/content/guild_tech.v1.json', 'utf8'));
} catch { TECH = {nodes: []}; }

export function guildTechDef() { return TECH; }

export async function guildTechNodes(db, guildId, seasonIdx) {
  const res = await db.prepare(
    `SELECT node_id, level, contributed FROM guild_tech_nodes WHERE guild_id=?1 AND season_idx=?2`
  ).bind(guildId, seasonIdx).all();
  const rows = res.results || [];
  return Object.fromEntries(rows.map(r => [r.node_id, {level: r.level, contributed: r.contributed}]));
}

export async function guildTechEffects(db, guildId, seasonIdx) {
  const nodes = await guildTechNodes(db, guildId, seasonIdx);
  const eff = {expPct: 0, forgeDiscount: 0, memberSlots: 0};
  for (const n of TECH.nodes) {
    const lv = nodes[n.id]?.level || 0;
    if (n.effect.expPct) eff.expPct += n.effect.expPct * lv;
    if (n.effect.forgeDiscount) eff.forgeDiscount += n.effect.forgeDiscount * lv;
    if (n.effect.memberSlots) eff.memberSlots += n.effect.memberSlots * lv;
  }
  return eff;
}

// Đóng góp vàng. Idempotent theo nonce của client.
export async function guildTechContribute(db, guildId, accountId, nodeId, gold, seasonIdx, nonce) {
  const node = TECH.nodes.find(n => n.id === nodeId);
  if (!node) return {ok: false, msg: "Node không tồn tại"};
  if (!(gold > 0) || !Number.isSafeInteger(gold)) return {ok: false, msg: "Số vàng không hợp lệ"};
  const nodes = await guildTechNodes(db, guildId, seasonIdx);
  const cur = nodes[nodeId]?.level || 0;
  if (cur >= node.maxLevel) return {ok: false, msg: "Đã max cấp"};
  if (node.requires && !(nodes[node.requires]?.level > 0))
    return {ok: false, msg: `Cần mở ${node.requires} trước`};
  const q = await quotaClaim(db, {
    accountId, scope: "guild_tech", period: `s${seasonIdx}`,
    idemKey: `donate:${guildId}:${nodeId}:${nonce}`, limit: 1000,
  }).catch(() => null);
  if (!q || !q.accepted) return {ok: false, msg: "Đóng góp trùng lặp", already: true};
  if (q.duplicate) return {ok: false, msg: "Đóng góp trùng lặp", already: true};
  const contributed = (nodes[nodeId]?.contributed || 0) + gold;
  const cost = node.costs[cur];
  let level = cur, remaining = contributed;
  // lên nhiều cấp nếu đóng góp vượt
  while (level < node.maxLevel && remaining >= node.costs[level]) {
    remaining -= node.costs[level];
    level++;
  }
  db.prepare(
    `INSERT INTO guild_tech_nodes(guild_id, node_id, season_idx, level, contributed)
     VALUES(?1,?2,?3,?4,?5)
     ON CONFLICT(guild_id, node_id, season_idx)
     DO UPDATE SET level=?4, contributed=?5`
  ).bind(guildId, nodeId, seasonIdx, level, remaining).run();
  return {ok: true, nodeId, level, contributed: remaining, leveledUp: level > cur};
}
