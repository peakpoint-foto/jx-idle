// Bước 2 — validator/snapshot cho thưởng mùa (CHƯA NỐI ROUTE, CHƯA MỞ THƯỞNG).
// Nguyên tắc từ Phụ lục F v2.3: thưởng chung/mùa chỉ mở qua snapshot KIỂM ĐỊNH do máy chủ
// tự tổng hợp từ bản ghi server có sẵn; KHÔNG BAO GIỜ tin tổng số do client báo cáo.
// Module này chỉ là hàm thuần kiểm tra hình dạng + tính nhất quán của một snapshot;
// việc tổng hợp snapshot từ D1, định nghĩa mốc (ngưỡng số) và route claim thuộc Bước 3.
// Trạng thái mở hiện tại: xem CTC_SEASON_RESOURCE_GATES / COMMUNITY_MILESTONE_GATES —
// cả hai đều KHÔNG MỞ, vì cổng CTC (shared calc + validator mở rộng + D1 + claim runId
// do server cấp) chưa đủ, và snapshot cộng đồng chưa có code tổng hợp phía server.
import { HttpError } from "./http.js";

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

// Cổng mở thưởng mùa bằng tài nguyên cho CTC — trạng thái kiểm chứng ở Bước 2.
// sharedCalc: worker/build-game.mjs -> worker/gen/game.js có tính lại thưởng mùa hay chưa (CHƯA).
// validatorExtended: worker/src/validate.js có kiểm tra ngân sách thưởng mùa hay chưa (CHƯA).
// d1ClaimTable: có bảng claim thưởng mùa (một lần, runId server cấp) hay chưa (CHƯA —
//   season_final chỉ ghi danh hiệu, cố ý KHÔNG ghi resource_ledger, xem worker/src/seasons.js).
// serverRunIdClaim: claim dùng runId do server cấp + nguyên tử đúng một lần hay chưa (CHƯA).
export const CTC_SEASON_RESOURCE_GATES = Object.freeze({
  sharedCalc: false, validatorExtended: false, d1ClaimTable: false, serverRunIdClaim: false,
});

// Cổng mở thưởng chung thử thách cộng đồng (g2, nghĩa Phụ lục F).
// snapshotAggregation: server tự tổng hợp đóng góp từ bản ghi server (CHƯA — G04 hiện tại
//   chỉ có challenge_results là điểm tốt nhất từng tài khoản, không có tổng đóng góp chung).
// milestoneTable: bảng mốc + claim (bản nháp migrations/0014, CHƯA nối ensureSchema/route).
// claimRoute: route nhận mốc qua snapshot kiểm định (CHƯA).
export const COMMUNITY_MILESTONE_GATES = Object.freeze({
  snapshotAggregation: false, milestoneTable: false, claimRoute: false,
});

export function seasonResourceClaimGate(gates) {
  const missing = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);
  return { open: missing.length === 0, missing };
}
export function ctcSeasonResourceGate() { return seasonResourceClaimGate(CTC_SEASON_RESOURCE_GATES); }
export function communityMilestoneGate() { return seasonResourceClaimGate(COMMUNITY_MILESTONE_GATES); }

// Kiểm tra một snapshot mốc cộng đồng do server tạo.
// snapshot: {version:'community-snapshot-v1', snapshot_id, milestone_id, total,
//   source:'server', verified_at, contributors?}
// milestones: [{id, required_total}] — ngưỡng do Bước 3 chốt (không hard-code số ở đây);
//   test dùng fixture minh họa, không phải canon game.
// Trả về {ok, unlocked, milestone_id, total}; sai hình dạng -> HttpError 400 snapshot_*.
// Hàm này KHÔNG tự kết luận "đã mở thưởng": unlocked chỉ nghĩa là tổng snapshot đạt mốc;
// việc claim vẫn phải qua bảng claim một lần + runId server cấp ở Bước 3.
export function validateCommunityMilestoneSnapshot(snapshot, milestones, now = Date.now()) {
  const fail = (code) => { throw new HttpError(400, code); };
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) fail("snapshot_bad_shape");
  if (snapshot.version !== "community-snapshot-v1") fail("snapshot_bad_version");
  if (typeof snapshot.snapshot_id !== "string" || !ID_RE.test(snapshot.snapshot_id)) fail("snapshot_bad_id");
  if (typeof snapshot.milestone_id !== "string" || !ID_RE.test(snapshot.milestone_id)) fail("snapshot_bad_milestone");
  // Nguồn bắt buộc là server: snapshot do client gửi (kể cả tổng đúng) đều bị từ chối.
  if (snapshot.source !== "server") fail("snapshot_untrusted_source");
  if (!Number.isSafeInteger(snapshot.total) || snapshot.total < 0) fail("snapshot_bad_total");
  if (!Number.isSafeInteger(snapshot.verified_at) || snapshot.verified_at > now) fail("snapshot_bad_time");
  const milestone = (milestones || []).find((m) => m.id === snapshot.milestone_id);
  if (!milestone) fail("snapshot_unknown_milestone");
  if (!Number.isSafeInteger(milestone.required_total) || milestone.required_total < 0) fail("snapshot_bad_milestone_def");
  if (snapshot.contributors !== undefined) {
    if (!Array.isArray(snapshot.contributors)) fail("snapshot_bad_contributors");
    let sum = 0;
    for (const c of snapshot.contributors) {
      if (!c || typeof c.account_id !== "string" || !ID_RE.test(c.account_id)) fail("snapshot_bad_contributors");
      if (!Number.isSafeInteger(c.amount) || c.amount < 0) fail("snapshot_bad_contributors");
      sum += c.amount;
    }
    if (sum !== snapshot.total) fail("snapshot_total_mismatch");
  }
  return { ok: true, unlocked: snapshot.total >= milestone.required_total, milestone_id: snapshot.milestone_id, total: snapshot.total };
}
