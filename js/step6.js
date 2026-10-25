"use strict";
// Bước 6 jx-idle — CAST THẬT Cơ Quan Phổ + sát thương tự thân Đồng hành.
// Tài liệu quyết định: BRAINSTORM-v2.4.md + DECISIONS-LOG-3.md (trong ~/workspace/jx-idle-full/).
// Mọi hàm fail-closed khi flag OFF, thiếu save, thiếu địch, hoặc đang ở chế độ tay/thị trấn.
//
// 3 QUYẾT ĐÃ CHỐT (cơ sở đầy đủ trong DECISIONS-LOG-3.md):
//  (D1) Edge-vs-level: LEVEL, nhưng bị chặn bởi nhịp đánh toàn cục (R.atkT) +
//      nội lực + tối đa 1 cast/nhịp. Không phát minh cooldown riêng từng cơ quan
//      (game không có cooldown riêng từng kỹ năng: skill_mintimepercast_v có trong
//      schema nhưng không code cast nào dùng). Điều kiện còn đúng thì cơ quan vẫn
//      phát ở nhịp sau — đúng thiết kế Bước 3 ("chờ tick sau"), không phải edge
//      một lần rồi im lặng trong khi điều kiện còn đúng.
//  (D2) Ưu tiên: số priority nhỏ nhất trước, 1 cast/nhịp, các cơ quan đủ điều
//      kiện còn lại chờ nhịp sau. combat_policy đang nắm quyền chọn chiêu thì
//      cơ quan nhường (không override policy); chế độ tay / thị trấn / offline
//      catch-up thì không cast (offline không có điểm nối nào, như Bước 4).
//  (D3) Vũ khí: KHÔNG có cổng vũ khí riêng cho cơ quan. Một kỹ năng cast được
//      khi và chỉ khi nó nằm trong R.P.actives — đúng tập cast được của chính
//      heroAttack, vì calc() xây actives mà không kiểm tra vũ khí. Phát minh cổng
//      riêng chỉ cho cơ quan sẽ làm cơ quan khắt khe hơn đòn thường một cách tùy
//      tiện; nếu luật vũ khí sau này được codified trong calc(), cơ quan tự thừa
//      hưởng qua actives.
//
// Sát thương tự thân Đồng hành (quyết sim, xem DECISIONS-LOG-3.md):
//  Trước Bước 6, sát thương Đồng hành KHÔNG hề được áp trong combat —
//  step3CompanionDamage chỉ là helper hệ số (boss ×0,5) không có caller.
//  Công thức chốt: mỗi nhịp đánh của nhân vật, nếu Đồng hành còn sống và flag
//  companion ON, Đồng hành đánh thêm 1 đòn phẳng = round(0,20 × P.basic.tot),
//  boss ×0,5 qua step3CompanionDamage. Đòn phẳng: không crit, không qua kháng —
//  cố ý để dễ kiểm chứng và không nhân đôi pipeline heroHit. Ngân sách sim:
//  +20% (thường) / +10% (boss) trên DPS cơ sở, tổng mới tối đa vẫn dưới ngưỡng
//  cảnh báo POWER_BUDGET (+112,5%) — xem scripts/sim/step6-latT.mjs.

function step6Flag(flag) {
  try { if (typeof featureEnabled === "function") return !!featureEnabled(flag); } catch (e) { /* fail-closed */ }
  return false;
}

// Chọn 1 cơ quan cast được ở nhịp này, hoặc null. Không đổi state (trừ log? không
// log ở đây — log chỉ khi cast thật ở step6TriggerCast).
function step6PickTrigger() {
  try {
    if (typeof S === "undefined" || !S || !S.fac) return null;
    if (!step6Flag("trigger_deck")) return null;
    if (typeof manual === "function" && manual()) return null;
    if (typeof R === "undefined" || !R || !R.P || R.town) return null;
    if (!alive().length) return null;
    const deck = S.step3 && S.step3.trigger_deck;
    if (!deck || !Array.isArray(deck.slots) || !deck.slots.length) return null;
    const ordered = deck.slots.slice().sort((a, b) => a.priority - b.priority);
    for (const slot of ordered) {
      if (!slot || typeof step4TriggerReady !== "function" || !step4TriggerReady(slot)) continue;
      // step5TriggerCastCheck đã bao gồm: flag, bùa chú, tấn công, đã học,
      // có trong actives, đủ mana, không chế độ tay/thị trấn, không policy nắm
      // quyền, điều kiện slot còn đúng. D3: actives chính là cổng vũ khí.
      const chk = typeof step5TriggerCastCheck === "function" ? step5TriggerCastCheck(slot.skill) : { ok: false };
      if (!chk.ok) continue;
      const act = (R.P.actives || []).find(a => a.id === slot.skill);
      if (!act) continue;
      return { slot, act };
    }
    return null;
  } catch (e) { return null; }
}

// Cast thật 1 cơ quan ở nhịp đánh. Trả số (1/rate hoặc 0,05 di chuyển) khi đã cast
// hoặc đã di chuyển về phía mục tiêu; trả null khi không có cơ quan cast được —
// khi đó tick gọi heroAttack() thường như cũ (không bao giờ chặn đòn thường).
function step6TriggerCast() {
  try {
    if (typeof R !== "undefined" && R && R.triggerCasting) return null; // chống đệ quy
    const picked = step6PickTrigger();
    if (!picked) return null;
    const t = typeof heroAttackTarget === "function" ? heroAttackTarget() : null;
    if (!t) return null;
    const deck = S.step3.trigger_deck;
    let out;
    R.triggerCasting = true;
    try { out = castAttack(R.P, picked.act, t); } finally { R.triggerCasting = false; }
    if (out === 0.05) return null; // ngoài tầm: chưa cast, chưa trừ mana — để đòn thường lo di chuyển
    deck.lastFired = picked.slot.skill;
    deck.castCount = (deck.castCount || 0) + 1;
    if (deck.lastCastSkill !== picked.slot.skill) {
      deck.lastCastSkill = picked.slot.skill;
      if (typeof log === "function") {
        let nm = picked.slot.skill;
        try { if (typeof SK !== "undefined" && SK[nm]) nm = SK[nm].n; } catch (e) { /* noop */ }
        log(`Cơ Quan Phổ phát động: ${nm}.`);
      }
    }
    return out;
  } catch (e) { return null; }
}

// Sát thương tự thân Đồng hành: 1 đòn phẳng mỗi nhịp đánh của nhân vật.
// Chỉ gọi sau khi đòn của nhân vật đã đánh trúng (không gọi khi di chuyển 0,05
// hay không có địch 0,3). Trả sát thương đã gây, 0 nếu không đánh.
function step6CompanionStrike() {
  try {
    if (!step6Flag("companion")) return 0;
    const c = S && S.step3 && S.step3.companion;
    if (!c || !c.alive || c.pendingRevive) return 0;
    if (typeof R === "undefined" || !R || !R.P) return 0;
    const list = alive();
    if (!list.length) return 0;
    const t = typeof heroAttackTarget === "function" ? heroAttackTarget() : list[0];
    if (!t) return 0;
    const base = (R.P.basic && R.P.basic.tot) || 0;
    if (!(base > 0)) return 0;
    let dmg = Math.round(base * 0.20);
    if (typeof step3CompanionDamage === "function") dmg = step3CompanionDamage(dmg, t.cls === "boss" ? "boss" : "normal");
    dmg = Math.max(1, Math.round(dmg));
    t.hp -= dmg;
    return dmg;
  } catch (e) { return 0; }
}

// Điểm nối duy nhất ở nhịp đánh trong tick(): cơ quan trước, đòn thường sau,
// Đồng hành đánh ké sau đòn trúng của nhân vật. tick() gọi hàm này thay cho
// heroAttack() khi file đã nạp; chưa nạp thì tick dùng heroAttack() như cũ.
function step6PacingAttack() {
  try {
    const out = step6TriggerCast();
    if (out !== null) {
      if (out !== 0.05 && out !== 0.3) step6CompanionStrike();
      return out;
    }
    const normal = heroAttack();
    if (normal !== 0.05 && normal !== 0.3) step6CompanionStrike();
    return normal;
  } catch (e) {
    try { return heroAttack(); } catch (e2) { return 0.3; }
  }
}
