// 2.9: Sư phụ / đồ đệ — một sư phụ nhiều đồ đệ, mỗi đồ đệ một sư phụ.
// Milestone (đồ đệ lên 60/100/180) thưởng cả hai; ghi idempotent qua khung 0.3.
// Chống abuse: đồ đệ phải dưới cấp 100 khi bái sư; sư phụ từ cấp 60.
import {HttpError, randomToken} from './http.js';
import {quotaClaim, quotaPeriodWeek} from './quota.js';

export const MENTOR_RULES = Object.freeze({
  milestones: [60, 100, 180],
  rewards: {60: 50000, 100: 200000, 180: 1000000}, // vàng cho mỗi người mỗi mốc
  maxDiscipleLvl: 100,   // đồ đệ phải dưới cấp này khi bái sư
  minMentorLvl: 60,      // sư phụ tối thiểu cấp này
  codeLen: 8,
});

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(MENTOR_RULES.codeLen)),
  b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

async function me(db, accountId) {
  const r = await db.prepare('SELECT account_id,lvl,validation_status,flagged FROM chars WHERE account_id=?1').bind(accountId).first();
  if (!r || r.flagged || r.validation_status !== 'verified') throw new HttpError(403, 'mentor_locked');
  return r;
}

// Quét milestone cho một đồ đệ; ghi idempotent, trả về các mốc mới đạt.
async function scanMilestones(db, mentorId, discipleId, now) {
  const d = await db.prepare('SELECT lvl FROM chars WHERE account_id=?1').bind(discipleId).first();
  if (!d) return [];
  const fresh = [];
  for (const m of MENTOR_RULES.milestones) {
    if (d.lvl < m) continue;
    const done = await db.prepare('SELECT 1 FROM mentor_milestones WHERE mentor_id=?1 AND disciple_id=?2 AND milestone=?3')
      .bind(mentorId, discipleId, m).first();
    if (done) continue;
    // Idempotent: INSERT OR IGNORE — hai request đồng thời không tạo trùng.
    const ins = await db.prepare('INSERT OR IGNORE INTO mentor_milestones(mentor_id,disciple_id,milestone,created_at) VALUES(?1,?2,?3,?4)')
      .bind(mentorId, discipleId, m, now).run();
    if (ins.meta.changes) {
      const gold = MENTOR_RULES.rewards[m];
      for (const acc of [mentorId, discipleId]) {
        await db.prepare(`INSERT OR IGNORE INTO mentor_rewards(account_id,milestone,disciple_id,gold,created_at)
          VALUES(?1,?2,?3,?4,?5)`).bind(acc, m, discipleId, gold, now).run();
      }
      fresh.push(m);
    }
  }
  return fresh;
}

async function status(db, accountId, now) {
  const mentorRow = await db.prepare('SELECT mentor_id FROM mentorships WHERE disciple_id=?1').bind(accountId).first();
  const disciples = (await db.prepare(`SELECT m.disciple_id,a.name,c.lvl FROM mentorships m
    JOIN accounts a ON a.id=m.disciple_id LEFT JOIN chars c ON c.account_id=m.disciple_id
    WHERE m.mentor_id=?1 ORDER BY m.created_at`).bind(accountId).all()).results;
  // quét milestone cho từng đồ đệ
  for (const d of disciples) await scanMilestones(db, accountId, d.disciple_id, now);
  if (mentorRow) await scanMilestones(db, mentorRow.mentor_id, accountId, now);
  const rewards = (await db.prepare('SELECT milestone,disciple_id,gold,claimed_at FROM mentor_rewards WHERE account_id=?1 ORDER BY milestone')
    .bind(accountId).all()).results;
  const code = await db.prepare('SELECT code FROM mentor_codes WHERE account_id=?1').bind(accountId).first();
  return {
    mentor: mentorRow ? mentorRow.mentor_id : null,
    disciples: disciples.map(d => ({id: d.disciple_id, name: d.name, lvl: d.lvl})),
    rewards,
    inviteCode: code ? code.code : null,
    rules: {milestones: MENTOR_RULES.milestones, rewards: MENTOR_RULES.rewards,
      maxDiscipleLvl: MENTOR_RULES.maxDiscipleLvl, minMentorLvl: MENTOR_RULES.minMentorLvl},
  };
}

export async function mentor(req, env, body = {}) {
  const db = env.DB, now = Date.now();
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw new HttpError(401, 'auth_required');
  const {sha256Hex} = await import('./http.js');
  const acc = await db.prepare('SELECT id FROM accounts WHERE token_hash=?1').bind(await sha256Hex(m[1])).first();
  if (!acc) throw new HttpError(401, 'bad_token');
  const accountId = acc.id;
  const action = body.action;

  if (req.method === 'GET') return status(db, accountId, now);

  if (action === 'invite_code') {
    await me(db, accountId); // phải verified
    const c = await db.prepare('SELECT lvl FROM chars WHERE account_id=?1').bind(accountId).first();
    if (!c || c.lvl < MENTOR_RULES.minMentorLvl) throw new HttpError(403, 'mentor_level');
    let code = (await db.prepare('SELECT code FROM mentor_codes WHERE account_id=?1').bind(accountId).first())?.code;
    if (!code) {
      code = newCode();
      await db.prepare('INSERT OR IGNORE INTO mentor_codes(account_id,code,created_at) VALUES(?1,?2,?3)')
        .bind(accountId, code, now).run();
      code = (await db.prepare('SELECT code FROM mentor_codes WHERE account_id=?1').bind(accountId).first()).code;
    }
    return {inviteCode: code};
  }

  if (action === 'bind') {
    const disc = await me(db, accountId);
    if (disc.lvl >= MENTOR_RULES.maxDiscipleLvl) throw new HttpError(403, 'disciple_too_high');
    const has = await db.prepare('SELECT 1 FROM mentorships WHERE disciple_id=?1').bind(accountId).first();
    if (has) throw new HttpError(409, 'already_has_mentor');
    const code = String(body.code || '').toUpperCase().trim();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new HttpError(400, 'bad_code');
    const mentorRow = await db.prepare('SELECT account_id FROM mentor_codes WHERE code=?1').bind(code).first();
    if (!mentorRow || mentorRow.account_id === accountId) throw new HttpError(404, 'code_not_found');
    const mc = await db.prepare('SELECT lvl FROM chars WHERE account_id=?1').bind(mentorRow.account_id).first();
    if (!mc || mc.lvl < MENTOR_RULES.minMentorLvl) throw new HttpError(403, 'mentor_level');
    // Idempotent theo (disciple): UNIQUE(disciple_id) chặn bái 2 sư phụ.
    try {
      await db.prepare('INSERT INTO mentorships(mentor_id,disciple_id,created_at) VALUES(?1,?2,?3)')
        .bind(mentorRow.account_id, accountId, now).run();
    } catch (e) {
      throw new HttpError(409, 'already_has_mentor');
    }
    await scanMilestones(db, mentorRow.account_id, accountId, now);
    return {ok: true, mentor: mentorRow.account_id, ...(await status(db, accountId, now))};
  }

  if (action === 'claim') {
    const milestone = Number(body.milestone), requestId = String(body.request_id || '');
    if (!MENTOR_RULES.milestones.includes(milestone)) throw new HttpError(400, 'bad_milestone');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw new HttpError(400, 'bad_request_id');
    // Quét trước để đảm bảo milestone đã ghi.
    const mr = await db.prepare('SELECT mentor_id FROM mentorships WHERE disciple_id=?1').bind(accountId).first();
    if (mr) await scanMilestones(db, mr.mentor_id, accountId, now);
    const ds = (await db.prepare('SELECT disciple_id FROM mentorships WHERE mentor_id=?1').bind(accountId).all()).results;
    for (const d of ds) await scanMilestones(db, accountId, d.disciple_id, now);
    // Claim idempotent qua khung 0.3 (quota scope riêng, period vô hạn theo milestone).
    const reward = await db.prepare('SELECT gold,claimed_at FROM mentor_rewards WHERE account_id=?1 AND milestone=?2 AND disciple_id=?3')
      .bind(accountId, milestone, body.disciple_id || '').first();
    if (!reward) throw new HttpError(404, 'reward_not_found');
    if (reward.claimed_at) return {ok: true, gold: reward.gold, already: true};
    const q = await quotaClaim(db, {accountId, scope: 'mentor_reward',
      period: `m${milestone}_${body.disciple_id || ''}`, limit: 1, idemKey: requestId});
    if (!q.accepted) throw new HttpError(409, 'already_claimed');
    await db.prepare('UPDATE mentor_rewards SET claimed_at=?1,request_id=?2 WHERE account_id=?3 AND milestone=?4 AND disciple_id=?5 AND claimed_at IS NULL')
      .bind(now, requestId, accountId, milestone, body.disciple_id || '').run();
    return {ok: true, gold: reward.gold};
  }

  if (action === 'leave') {
    // Đồ đệ rời sư phụ (mốc đã đạt giữ nguyên).
    await db.prepare('DELETE FROM mentorships WHERE disciple_id=?1').bind(accountId).run();
    return {ok: true};
  }

  throw new HttpError(400, 'bad_mentor_action');
}
