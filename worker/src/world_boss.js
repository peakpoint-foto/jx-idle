import {GAME} from '../gen/game.js';
import {quotaClaim} from './quota.js';

// 3.3: World boss — boss thế giới theo khung giờ (20h-22h VN, 2 lần/tuần).
// Server mô phỏng từ tổng đóng góp; người chơi gửi lượt đánh async,
// damage từ snapshot đã xác thực, ghi qua khung quota 0.3.
// Thưởng theo mốc cá nhân + mốc chung.
export const WB_HP_BASE = 100000000; // 100M
export const WB_MAX_HITS = 5; // 5 lượt/người/boss

export function worldBossSchedule(now = Date.now()) {
  // 2 lần/tuần: Thứ 4 và Thứ 7, 20h-22h VN (UTC+7).
  const vn = new Date(now + 7 * 3600e3);
  const day = vn.getUTCDay(); // 0=CN
  const days = [3, 6]; // Thứ 4, Thứ 7
  // tìm kỳ gần nhất
  return {days, hourStart: 20, hourEnd: 22, tz: "Asia/Ho_Chi_Minh"};
}

export async function worldBossCurrent(db) {
  const now = Date.now();
  return await db.prepare(
    `SELECT * FROM world_boss WHERE starts_at<=?1 AND ends_at>=?2 AND status='active' ORDER BY starts_at DESC LIMIT 1`
  ).bind(now, now).first();
}

export async function worldBossHit(db, bossId, accountId, snapshot, nonce) {
  // kiểm tra lượt qua quota; nonce từ client để idempotent
  if (!nonce) return {ok: false, msg: "Thiếu nonce"};
  const q = await quotaClaim(db, {
    accountId, scope: "world_boss", period: bossId,
    idemKey: `hit:${bossId}:${nonce}`, limit: WB_MAX_HITS,
  }).catch(() => null);
  if (!q || !q.accepted) return {ok: false, msg: "Hết lượt đánh"};
  if (q.duplicate) return {ok: false, msg: "Lượt đánh trùng lặp", already: true};
  // damage từ snapshot đã xác thực (đơn giản: power/10)
  const power = snapshot.power || 0;
  const damage = Math.max(1, Math.floor(power / 10));
  const boss = await db.prepare(`SELECT * FROM world_boss WHERE id=?1`).bind(bossId).first();
  if (!boss || boss.status !== 'active') return {ok: false, msg: "Boss không còn"};
  const newHp = Math.max(0, boss.hp - damage);
  await db.batch([
    db.prepare(`INSERT INTO world_boss_hits(id,boss_id,account_id,damage,created_at)
      VALUES(?1,?2,?3,?4,?5)`)
      .bind(`wbh_${bossId}_${accountId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, bossId, accountId, damage, Date.now()),
    db.prepare(`UPDATE world_boss SET hp=?2 WHERE id=?1`).bind(bossId, newHp),
  ]);
  const killed = newHp <= 0;
  if (killed)
    await db.prepare(`UPDATE world_boss SET status='killed' WHERE id=?1`).bind(bossId).run();
  return {ok: true, damage, bossHp: newHp, killed};
}

export async function worldBossRewards(db, bossId) {
  // tổng damage theo account, xếp hạng
  const rows = await db.prepare(
    `SELECT account_id, SUM(damage) AS total FROM world_boss_hits WHERE boss_id=?1 GROUP BY account_id ORDER BY total DESC LIMIT 100`
  ).bind(bossId).all();
  return (rows.results || []).map((r, i) => ({
    accountId: r.account_id, damage: r.total, rank: i + 1,
    // mốc thưởng: top 1/10/50/100
    reward: i === 0 ? "1M vàng" : i < 10 ? "500k vàng" : i < 50 ? "200k vàng" : "50k vàng",
  }));
}
