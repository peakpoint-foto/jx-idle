"use strict";
// 3.1: Chất cơ chế riêng từng phái — framework.
// Mỗi phái một cơ chế đặc trưng. Hook vào combat qua các hàm dưới.
// Làm từng phái một; 3 phái mẫu: shaolin, tangmen, wudang.
// Phase2-N7: hằng số minh họa — đòn thêm của Đường Môn bằng 50% sát thương của đòn vừa kích hoạt.
// MINH HỌA - CHỜ USER CHỐT (user chuẩn y 16/10: sửa code theo desc, giá trị 50% lấy từ desc).
const TANGMEN_EXTRA_HIT_RATIO = 0.5;
const FAC_MECHANICS = Object.freeze({
  shaolin: Object.freeze({
    id: "lahan", name: "La Hán Kim Cang",
    desc: "HP dưới 30%: +20% giảm sát thương nhận.",
    // trả về damage multiplier khi nhận damage
    onTakeDamage(P, hpFrac) { return hpFrac < 0.3 ? 0.8 : 1; },
  }),
  tangmen: Object.freeze({
    id: "amkhi", name: "Ám Khí Liên Châu",
    desc: "15% cơ hội đánh thêm 1 đòn (50% sát thương).",
    // trả về true nếu kích hoạt đòn thêm
    onAttack(rand) { return rand() < 0.15; },
    extraDmgMul: TANGMEN_EXTRA_HIT_RATIO,
  }),
  wudang: Object.freeze({
    id: "thaicuc", name: "Thái Cực Phản Kích",
    desc: "Phản 10% sát thương nhận về kẻ địch.",
    // trả về % phản
    onTakeDamageReflect() { return 0.1; },
  }),
});
function facMechanic(key) {
  if (typeof featureEnabled === "function" && !featureEnabled("faction_mechanics")) return null;
  return FAC_MECHANICS[key] || null;
}
// HP fraction hiện tại (client)
function heroHpFrac() {
  if (typeof R === "undefined" || !R.P) return 1;
  return R.life / Math.max(1, R.P.life);
}
