// Mục 0.2/0.3 DEPTH_ROADMAP: khung contribution/quota/idempotency nguyên tử dùng chung
// cho mọi tính năng online (trial, challenge, rift party...), viết một lần ở worker.
//
// Tính nguyên tử: một lượt được trừ bằng MỘT câu INSERT...SELECT duy nhất — kiểm tra
// idempotency key và đếm quota trong cùng statement. SQLite/D1 thực thi một statement
// nguyên tử nên hai request đồng thời không thể cùng vượt quota (không có kẽ hở
// check-then-act giữa hai round-trip).
//
// period: chuỗi định danh kỳ quota do caller chọn, ví dụ 'd:48213' (ngày UTC),
// 'w:2900' (tuần). Không parse ở đây để mỗi tính năng tự định nghĩa kỳ của mình.
import {HttpError} from './http.js';

export const quotaPeriodDay = now => 'd:' + Math.floor(now / 864e5);
export const quotaPeriodWeek = (now, weekStart = utcWeekStartOf(now)) => 'w:' + weekStart;
const utcWeekStartOf = now => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); };

function checkQuotaArgs({accountId, scope, period, limit, idemKey}) {
  if (typeof accountId !== 'string' || !accountId) throw new HttpError(400, 'bad_quota_account');
  if (typeof scope !== 'string' || !/^[a-z0-9_]{1,24}$/.test(scope)) throw new HttpError(400, 'bad_quota_scope');
  if (typeof period !== 'string' || !period) throw new HttpError(400, 'bad_quota_period');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1e6) throw new HttpError(400, 'bad_quota_limit');
  if (typeof idemKey !== 'string' || !idemKey) throw new HttpError(400, 'bad_quota_idem');
}

// Mệnh đề INSERT nguyên tử. ph ánh xạ tên trường -> placeholder để caller có thể
// nhét vào batch với bộ tham số đánh số (?N) của mình; mặc định dùng '?'.
export function quotaClaimSQL(ph = null) {
  const dflt = {accountId: '?1', scope: '?2', period: '?3', idemKey: '?4', now: '?5', limit: '?6'};
  const get = f => (ph ? ph(f) : dflt[f]);
  const a = get('accountId'), s = get('scope'), p = get('period'), k = get('idemKey'), n = get('now'), l = get('limit');
  return `INSERT INTO quota_claims(account_id,scope,period,idem_key,created_at)
    SELECT ${a},${s},${p},${k},${n}
    WHERE NOT EXISTS(SELECT 1 FROM quota_claims WHERE account_id=${a} AND scope=${s} AND period=${p} AND idem_key=${k})
      AND (SELECT COUNT(*) FROM quota_claims WHERE account_id=${a} AND scope=${s} AND period=${p}) < ${l}`;
}

export function quotaClaimStmt(db, q) {
  checkQuotaArgs(q);
  return db.prepare(quotaClaimSQL()).bind(q.accountId, q.scope, q.period, q.idemKey, q.now ?? Date.now(), q.limit);
}

export async function quotaStatus(db, accountId, scope, period) {
  const row = await db.prepare('SELECT COUNT(*) n FROM quota_claims WHERE account_id=?1 AND scope=?2 AND period=?3')
    .bind(accountId, scope, period).first();
  return {used: row ? row.n : 0};
}

// Trừ một lượt độc lập (không nằm trong batch của caller).
// Trả {accepted, duplicate, used, left}; ném HttpError(409, errorCode) khi hết quota.
export async function quotaClaim(db, q) {
  const r = await quotaClaimStmt(db, q).run();
  if (r.meta.changes) {
    const used = (await quotaStatus(db, q.accountId, q.scope, q.period)).used;
    return {accepted: true, duplicate: false, used, left: Math.max(0, q.limit - used)};
  }
  // Không trừ được: hoặc trùng idem_key (retry sau khi đã trừ) hoặc hết quota.
  const st = await db.prepare(`SELECT
      EXISTS(SELECT 1 FROM quota_claims WHERE account_id=?1 AND scope=?2 AND period=?3 AND idem_key=?4) AS dup,
      (SELECT COUNT(*) FROM quota_claims WHERE account_id=?1 AND scope=?2 AND period=?3) AS used`)
    .bind(q.accountId, q.scope, q.period, q.idemKey).first();
  if (st && st.dup) return {accepted: true, duplicate: true, used: st.used, left: Math.max(0, q.limit - st.used)};
  throw new HttpError(409, q.errorCode || 'quota_used');
}

// Hoàn một lượt đã trừ (dùng khi write đi kèm trong cùng batch thất bại vì lý do khác).
// Chỉ xóa đúng idem_key của request này nên không ảnh hưởng lượt của request khác.
export async function quotaRefund(db, {accountId, scope, period, idemKey}) {
  await db.prepare('DELETE FROM quota_claims WHERE account_id=?1 AND scope=?2 AND period=?3 AND idem_key=?4')
    .bind(accountId, scope, period, idemKey).run();
}
