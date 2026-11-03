"use strict";
// Bước 5 jx-idle — thử sửa ở mức an toàn, KHÔNG đổi số cân bằng, KHÔNG đổi
// logic game. Tất cả các flag mới vẫn OFF mặc định; mọi hàm đều fail-closed.
//  (a) PHLT lag: culling nằm trực tiếp trong js/render.js draw() (xem diff
//      render.js) — file này KHÔNG chứa tối ưu vòng vẽ, chỉ chứa các mục
//      còn lại để khỏi đụng vào file minified nhiều hơn mức cần thiết.
//  (b) iOS đơ: renderSkill() được bọc bằng fingerprint — nếu mọi đầu vào
//      hiển thị đều không đổi thì bỏ qua việc gán lại innerHTML + gắn lại
//      handler (đó mới là phần tốn kém trên Safari: parse HTML, layout lại,
//      reset scroll của tab). Handler cũ được giữ nguyên, không gắn lại.
//      Fingerprint bao gồm: phái, điểm kỹ năng, cấp, chiêu chính, khóa chiêu,
//      xoay chiêu, ô chiêu, bảng kỹ năng, sát thương từng chiêu tấn công
//      (qua activeInfo, phụ thuộc R.P), id chiêu chính của R.P, và chuỗi
//      buildsHTML() (phần mẫu build ở cuối tab). Nếu tính fingerprint lỗi
//      thì vẽ lại như cũ (fail-open về hành vi cũ, không kẹt cache).
//      LƯU Ý TRUNG THỰC: nguyên nhân iOS đơ vẫn là SUY LUẬN từ code
//      (renderSkill vẽ lại toàn bộ + UI tick 0,1s) — chưa có Safari thật
//      để xác nhận, nên đây là giảm vẽ lại, KHÔNG phải "đã sửa dứt điểm
//      trên iOS thật".
//  (c) Nút chuyển map trên màn hình chiến đấu: 2 nút tĩnh trong index.html
//      (#jxStagePrev/#jxStageNext) gọi đúng gotoStage() hiện có — không viết
//      cơ chế chuyển map mới. Nút bị chặn (disabled) khi đang leo tháp,
//      Tống Kim, công thành, ở thị trấn hoặc chế độ sinh tồn, vì gotoStage()
//      hiện KHÔNG chặn khi đang hoạt động (phát hiện Giai đoạn 0) và chuyển
//      ải giữa hoạt động có thể làm lệch vòng hoạt động đó. Tab Giang hồ
//      vẫn giữ hành vi cũ (không chặn) — Bước 5 không đổi gotoStage() để
//      khỏi ảnh hưởng đường cũ; sự không nhất quán này được ghi rõ.
//  (d) Auto-potion: ngưỡng mana + cờ tay đặt nằm trong js/potion_policy.js
//      và js/combat_policy.js (xem diff 2 file đó), không nằm ở đây.
//  (e) Cast Cơ Quan Phổ: CHƯA NỐI LIVE. Chỉ có cổng kiểm tra
//      step5TriggerCastCheck() (thuần, không chạm tick/pickAttack/S.main)
//      để đợt sau dùng khi đã tách được hàm cast dùng chung. Lý do chưa
//      nối xem STEP5-REPORT.md §(e).
let STEP5_SKILL_FP = null;
let STEP5_SKILL_RENDERS = 0;
let STEP5_SKILL_SKIPS = 0;

function step5SkillFingerprint() {
  try {
    if (typeof S === "undefined" || !S || !S.fac) return null;
    const parts = [S.fac, S.skPts, S.lvl, S.main, S.mainLock, S.rot,
      JSON.stringify(S.sk || {}), JSON.stringify(S.slots || [])];
    if (typeof R !== "undefined" && R && R.P && R.P.main) parts.push(R.P.main.id);
    const f = (typeof FAC !== "undefined" ? FAC[S.fac] : null);
    if (f && Array.isArray(f.skills)) {
      for (const id of f.skills) {
        let inf = null;
        try { if (typeof skillLvInfo === "function") inf = skillLvInfo(+id); } catch (e) { /* noop */ }
        parts.push([id, inf ? inf.eff : null, inf ? inf.granted : null, inf ? inf.excess : null]);
        try {
          const s = (typeof SK !== "undefined" ? SK[id] : null);
          if (s && typeof isAttack === "function" && isAttack(s) && (S.sk[id] || 0) > 0
            && typeof R !== "undefined" && R && R.P && typeof activeInfo === "function") {
            const a = activeInfo(R.P, s, inf ? inf.eff : 0);
            parts.push(a ? a.tot : null);
          }
        } catch (e) { /* noop */ }
      }
    }
    if (typeof buildsHTML === "function") {
      try { parts.push(buildsHTML()); } catch (e) { /* noop */ }
    }
    // (bổ sung 2026-11-03, fix CI 25/10): cờ tính năng, chế độ chơi và trạng
    // thái tắt gợi ý CŨNG là đầu vào hiển thị của tab kỹ năng — các panel
    // gợi ý/policy/library/codex chỉ hiện khi flag tương ứng bật, panel gợi
    // ý đổi dạng khi bị tắt. Thiếu chúng, renderSkill() bị bỏ qua khi người
    // chơi (hoặc smoke test) chỉ bật/tắt một panel mà không đổi kỹ năng:
    // panel không hiện/không ẩn, và smoke chết ở adviceCheck vì
    // querySelector('[data-advice-goal]') trả null. Cả ba đều ổn định giữa
    // các lần render (chỉ đổi khi người dùng/flag đổi) nên không giết
    // optimization bỏ render thừa.
    try { if (typeof FEATURE_FLAGS !== "undefined") parts.push(JSON.stringify(FEATURE_FLAGS)); } catch (e) { /* noop */ }
    try { if (typeof modeId === "function") parts.push(modeId()); } catch (e) { /* noop */ }
    try { if (typeof adviceDismissed === "function") parts.push(adviceDismissed()); } catch (e) { /* noop */ }
    return JSON.stringify(parts);
  } catch (e) { return null; }
}

if (typeof renderSkill === "function") {
  const step5OrigRenderSkill = renderSkill;
  renderSkill = function (...args) {
    const fp = step5SkillFingerprint();
    if (fp !== null && fp === STEP5_SKILL_FP) {
      STEP5_SKILL_SKIPS++;
      try { if (typeof R !== "undefined" && R) R.skillViewP = R.P; } catch (e) { /* noop */ }
      return;
    }
    const out = step5OrigRenderSkill.apply(this, args);
    STEP5_SKILL_RENDERS++;
    if (fp !== null) STEP5_SKILL_FP = fp;
    return out;
  };
}

// --- (c) Nút chuyển map trên màn hình chiến đấu ---
function step5BattleNavDisabled() {
  try {
    if (typeof S === "undefined" || !S || !S.fac) return { prev: true, next: true };
    const busy = (typeof R !== "undefined" && R && (R.town || R.tk || R.tower))
      || !!S.siege
      || (typeof SV !== "undefined" && SV && SV.on);
    if (busy) return { prev: true, next: true };
    return { prev: S.stage <= 1, next: S.stage >= S.maxStage };
  } catch (e) { return { prev: true, next: true }; }
}
function step5BattleNavGo(dir) {
  try {
    const d = step5BattleNavDisabled();
    if (dir < 0 && d.prev) return false;
    if (dir > 0 && d.next) return false;
    if (typeof gotoStage !== "function") return false;
    gotoStage(S.stage + dir);
    return true;
  } catch (e) { return false; }
}
function step5SyncBattleNav() {
  try {
    const d = step5BattleNavDisabled();
    const prev = document.getElementById("jxStagePrev");
    const next = document.getElementById("jxStageNext");
    if (prev) prev.disabled = d.prev;
    if (next) next.disabled = d.next;
  } catch (e) { /* nút battle không được vỡ updateTop */ }
}
if (typeof updateTop === "function") {
  const step5OrigUpdateTop = updateTop;
  updateTop = function (...args) {
    const out = step5OrigUpdateTop.apply(this, args);
    step5SyncBattleNav();
    return out;
  };
}
try {
  const step5PrevBtn = document.getElementById("jxStagePrev");
  if (step5PrevBtn) step5PrevBtn.onclick = () => step5BattleNavGo(-1);
  const step5NextBtn = document.getElementById("jxStageNext");
  if (step5NextBtn) step5NextBtn.onclick = () => step5BattleNavGo(1);
  step5SyncBattleNav();
} catch (e) { /* chạy trong harness DOM giả: bind thất bại cũng không sao */ }

// --- (e) Cổng kiểm tra cast Cơ Quan Phổ — CHƯA NỐI LIVE ---
// Chỉ trả lời "chiêu này có cast được ngay bây giờ không, vì sao không".
// Không được gọi từ tick(), pickAttack() hay heroAttack(); không đổi state
// (không trừ mana, không đổi S.main, không ghi lastFired).
function step5TriggerCastCheck(skillId) {
  try {
    if (typeof S === "undefined" || !S || !S.fac) return { ok: false, reason: "chưa có nhân vật" };
    let flagOn = false;
    try { flagOn = typeof step4Flag === "function" ? step4Flag("trigger_deck") : (typeof featureEnabled === "function" ? !!featureEnabled("trigger_deck") : false); } catch (e) { flagOn = false; }
    if (!flagOn) return { ok: false, reason: "Cơ Quan Phổ chưa mở (flag OFF)" };
    const s = (typeof SK !== "undefined" ? SK[skillId] : null);
    if (!s) return { ok: false, reason: "kỹ năng không tồn tại" };
    if (typeof isCurse === "function" && isCurse(s)) return { ok: false, reason: "bị cấm trong idle (bùa chú)" };
    if (typeof isAttack !== "function" || !isAttack(s)) return { ok: false, reason: "không phải kỹ năng tấn công" };
    if (!(S.sk && S.sk[skillId] > 0)) return { ok: false, reason: "chưa học kỹ năng" };
    if (typeof R === "undefined" || !R || !R.P) return { ok: false, reason: "chưa có chỉ số chiến đấu" };
    const act = (R.P.actives || []).find(a => a.id === skillId);
    if (!act) return { ok: false, reason: "kỹ năng không có trong bảng tấn công hiện tại" };
    if (act.cost > 0 && R.mana < act.cost) return { ok: false, reason: "không đủ nội lực" };
    if (typeof manual === "function" && manual()) return { ok: false, reason: "đang ở chế độ tay" };
    if (R.town) return { ok: false, reason: "đang ở thị trấn" };
    try {
      if (typeof combatPolicy === "function" && combatPolicy()) return { ok: false, reason: "profile combat_policy đang nắm quyền chọn chiêu" };
    } catch (e) { /* combatPolicy lỗi thì fail-closed ở dưới không áp dụng; coi như không có policy */ }
    // Điều kiện cơ quan (nếu tìm được slot) phải còn đúng tại thời điểm cast,
    // không chỉ đúng lúc đánh giá ở tick trước.
    try {
      const deck = S.step3 && S.step3.trigger_deck;
      const slot = deck && Array.isArray(deck.slots) ? deck.slots.find(x => x && x.skill === skillId) : null;
      if (slot && typeof step4TriggerReady === "function" && !step4TriggerReady(slot)) {
        return { ok: false, reason: "điều kiện cơ quan không còn đúng" };
      }
    } catch (e) { /* không tìm được slot thì không chặn vì lý do này */ }
    return { ok: true };
  } catch (e) { return { ok: false, reason: "lỗi kiểm tra cast" }; }
}
