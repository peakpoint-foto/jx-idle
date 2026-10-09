import {GAME} from '../gen/game.js';

// 3.2: Duel league async — league theo bậc, cặp đấu async với "bóng" đối thủ
// (snapshot đã xác thực, mô phỏng bởi server). Replay: lưu seed + rule version.
// Mùa league 2 tuần.
export const LEAGUE_TIERS = ["dong", "bac", "vang", "bachkim", "kimcuong"];
export const LEAGUE_SEASON_DAYS = 14;

export function leagueTierFor(points) {
  if (points >= 2000) return "kimcuong";
  if (points >= 1200) return "bachkim";
  if (points >= 700) return "vang";
  if (points >= 300) return "bac";
  return "dong";
}

// Mô phỏng duel giữa 2 snapshot bằng session combat (1v1).
// Trả về winner accountId.
export function simulateDuel(p1snap, p2snap, seed) {
  // Dùng GAME.sessionActor nếu có, fallback đơn giản.
  const mk = (snap, id) => {
    const stats = snap.stats || snap;
    const a = GAME.sessionActor
      ? GAME.sessionActor(id, snap.name || id, stats, "damage")
      : {id, hp: 1000, p: {life: 1000}};
    return a;
  };
  // Đơn giản: so power đã xác thực + random theo seed.
  // (Full session 1v1 sẽ làm ở bước sau; hiện tại dùng power + seed để deterministic.)
  const p1 = p1snap.power || 0, p2 = p2snap.power || 0;
  let h = seed >>> 0;
  const rnd = () => (h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 4294967296;
  const s1 = p1 * (0.9 + rnd() * 0.2), s2 = p2 * (0.9 + rnd() * 0.2);
  return s1 >= s2 ? p1snap.accountId : p2snap.accountId;
}

export async function leagueMatchmake(db, seasonIdx) {
  // Ghép cặp trong cùng tier: lấy standings chưa có trận tuần này.
  const tiers = await db.prepare(
    `SELECT account_id, tier FROM league_standings WHERE season_idx=?1`
  ).bind(seasonIdx).all();
  const byTier = {};
  for (const r of (tiers.results || [])) {
    (byTier[r.tier] = byTier[r.tier] || []).push(r.account_id);
  }
  const matches = [];
  for (const [tier, ids] of Object.entries(byTier)) {
    // xáo trộn deterministic theo season
    const shuffled = ids.slice().sort((a, b) => (a < b ? -1 : 1));
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const id = `lm_${seasonIdx}_${tier}_${Date.now()}_${i}`;
      matches.push({id, tier, p1: shuffled[i], p2: shuffled[i + 1]});
    }
  }
  return matches;
}
