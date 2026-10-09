import {leagueTierFor, simulateDuel, leagueMatchmake, LEAGUE_TIERS} from './league.js';

// 3.2: API duel league.
export async function league(req, env) {
  const url = new URL(req.url);
  const db = env.DB;
  if (req.method === 'GET') {
    const season = url.searchParams.get('season');
    // standings
    const rows = await db.prepare(
      `SELECT * FROM league_standings WHERE season_idx=?1 ORDER BY points DESC LIMIT 100`
    ).bind(season || 0).all();
    return Response.json({ok: true, tiers: LEAGUE_TIERS, standings: rows.results || []});
  }
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'join') {
      const {account_id} = body;
      // lấy hoặc tạo season hiện tại
      let s = await db.prepare(`SELECT idx FROM league_seasons WHERE status='active' ORDER BY idx DESC LIMIT 1`).first();
      if (!s) {
        const now = Date.now(), idx = Math.floor(now / (14 * 864e5));
        await db.prepare(`INSERT INTO league_seasons(idx,start_at,end_at) VALUES(?1,?2,?3)`)
          .bind(idx, now, now + 14 * 864e5).run();
        s = {idx};
      }
      await db.prepare(
        `INSERT INTO league_standings(season_idx,account_id,tier) VALUES(?1,?2,'dong')
         ON CONFLICT(season_idx,account_id) DO NOTHING`
      ).bind(s.idx, account_id).run();
      return Response.json({ok: true, season: s.idx});
    }
    if (body.action === 'fight') {
      // mô phỏng 1 trận với đối thủ cùng tier
      const {account_id, season_idx} = body;
      const me = await db.prepare(
        `SELECT * FROM league_standings WHERE season_idx=?1 AND account_id=?2`
      ).bind(season_idx, account_id).first();
      if (!me) return Response.json({ok: false, msg: 'Chưa tham gia'}, {status: 400});
      const opp = await db.prepare(
        `SELECT * FROM league_standings WHERE season_idx=?1 AND tier=?2 AND account_id<>?3 ORDER BY RANDOM() LIMIT 1`
      ).bind(season_idx, me.tier, account_id).first();
      if (!opp) return Response.json({ok: false, msg: 'Chưa có đối thủ'}, {status: 400});
      // snapshot power đã xác thực
      const p1 = await db.prepare(`SELECT power FROM chars WHERE account_id=?1`).bind(account_id).first();
      const p2 = await db.prepare(`SELECT power FROM chars WHERE account_id=?1`).bind(opp.account_id).first();
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const winner = simulateDuel(
        {accountId: account_id, power: p1?.power || 0},
        {accountId: opp.account_id, power: p2?.power || 0},
        seed
      );
      const mid = `lm_${season_idx}_${Date.now()}_${seed.toString(36)}`;
      await db.batch([
        db.prepare(`INSERT INTO league_matches(id,season_idx,tier,p1,p2,winner,seed,rules_version,created_at,resolved_at)
          VALUES(?1,?2,?3,?4,?5,?6,?7,'power-v1',?8,?8)`)
          .bind(mid, season_idx, me.tier, account_id, opp.account_id, winner, seed, Date.now()),
        db.prepare(`UPDATE league_standings SET points=points+?2,wins=wins+?3,losses=losses+?4 WHERE season_idx=?1 AND account_id=?5`)
          .bind(season_idx, winner === account_id ? 25 : 5, winner === account_id ? 1 : 0, winner === account_id ? 0 : 1, account_id),
      ]);
      // cập nhật tier
      const st = await db.prepare(`SELECT points FROM league_standings WHERE season_idx=?1 AND account_id=?2`)
        .bind(season_idx, account_id).first();
      const tier = leagueTierFor(st.points);
      if (tier !== me.tier)
        await db.prepare(`UPDATE league_standings SET tier=?3 WHERE season_idx=?1 AND account_id=?2`)
          .bind(season_idx, account_id, tier).run();
      return Response.json({ok: true, win: winner === account_id, seed, tier, matchId: mid});
    }
  }
  return Response.json({ok: false}, {status: 405});
}
