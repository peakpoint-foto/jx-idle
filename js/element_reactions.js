"use strict";
// 2.13: Phản ứng ngũ hành — mục tiêu mang trạng thái nguyên tố;
// combo nguyên tố cho hiệu ứng phụ. Dùng chung luật cho client và session.
// Băng rồi Lôi: choáng +0.5s. Độc rồi Hỏa: nổ lan (50% sát thương gốc).
const ELEM_REACTIONS = Object.freeze([
  Object.freeze({first: "cold", second: "light", effect: "stun", power: 0.5,
    desc: "Băng dẫn Lôi: choáng"}),
  Object.freeze({first: "poison", second: "fire", effect: "explode", power: 0.5,
    desc: "Độc gặp Hỏa: nổ lan"}),
]);
const ELEM_STATE_TTL = 4; // trạng thái nguyên tố tồn tại 4s (16 tick session)
// Kiểm tra phản ứng khi đánh nguyên tố `el` vào mục tiêu có elemState.
// `now` cùng đơn vị với elemState.until. Trả về {reaction, consumed} hoặc null.
function elemReactionCheck(target, el, now) {
  if (!target || !el || el === "phys") return null;
  const st = target.elemState;
  if (st && st.until > now && st.type !== el) {
    const r = ELEM_REACTIONS.find(x => x.first === st.type && x.second === el);
    if (r) return {reaction: r, consumed: true};
  }
  // không phản ứng: đặt/ghi đè trạng thái
  target.elemState = {type: el, until: now + ELEM_STATE_TTL};
  return null;
}
function elemReactionClear(target) {
  if (target) target.elemState = null;
}
