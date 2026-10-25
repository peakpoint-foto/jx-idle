"use strict";

const POT_LIFE_DEFAULT = 50;
const potionLifeThreshold = () => {
  if (!S || !Number.isFinite(+S.potLifePct)) return POT_LIFE_DEFAULT;
  return Math.max(5, Math.min(95, Math.floor(+S.potLifePct)));
};
/* Bước 5: ngưỡng % cho mana, tương tự slider HP. Mặc định 50% — KHÁC với
 * luật cũ (mana < 2x cost chiêu chính): luật cũ không phải %, không thể
 * giữ nguyên khi chuyển sang %; 50% được chọn để khớp mặc định HP và là
 * điểm giữa dải slider 5–95%. Thay đổi hành vi này được ghi rõ, không
 * giấu trong "giữ nguyên". Cờ potLifeManual/potManaManual chỉ được đặt
 * khi người chơi KÉO slider (xem handler dưới) — gán trực tiếp S.potLifePct
 * trong code/test không đặt cờ, nên profile vẫn thắng trong trường hợp đó. */
const POT_MANA_DEFAULT = 50;
const potionManaThreshold = () => {
  if (!S || !Number.isFinite(+S.potManaPct)) return POT_MANA_DEFAULT;
  return Math.max(5, Math.min(95, Math.floor(+S.potManaPct)));
};

/* Keep the existing shared potion/cooldown/CTC-cap path, but make the HP
 * trigger an explicit saved percentage instead of a hidden constant. */
if (typeof autoPotion === "function") {
  autoPotion = function (dt) {
    R.hot = R.hot || { life: 0, mana: 0, lifeT: 0, manaT: 0 };
    const h = R.hot, p = R.P;
    for (const k of ["life", "mana"]) {
      if (h[k + "T"] > 0) {
        const d = Math.min(dt, h[k + "T"]);
        h[k + "T"] -= dt;
        if (k === "life") R.life = Math.min(p.life, R.life + h.life * d);
        else R.mana = Math.min(p.mana, R.mana + h.mana * d);
      }
    }
    if (S.potOff || S.chal === "nopot") return;
    const needLife = R.life < p.life * potionLifeThreshold() / 100;
    const needMana = R.mana < p.mana * potionManaThreshold() / 100;
    h.cd = Math.max(0, (h.cd || 0) - dt);
    for (const [kind, need] of [["life", needLife], ["mana", needMana]]) {
      const urgent = kind === "life" && R.life < p.life * .3 && h.cd <= 0;
      if (!need || h[kind + "T"] > 0 && !urgent) continue;
      if (kind === "life" && S.siege && typeof siegePotLeft === "function" && siegePotLeft() <= 0) continue;
      const own = takeStock(kind), potion = own || bestPotion(kind);
      if (!potion) continue;
      usePotion(kind, potion, !!own);
      if (kind === "life") h.cd = 1;
    }
  };
}

/* Add the control to the existing settings view without changing the save
 * schema: the default is applied lazily and old saves retain 50%. */
if (typeof renderMore === "function") {
  const legacyRenderMoreForPotion = renderMore;
  renderMore = function (...args) {
    const out = legacyRenderMoreForPotion.apply(this, args);
    const checkbox = document.getElementById("cPot");
    if (!checkbox) return out;
    const label = checkbox.parentNode, host = label.parentNode || label;
    const addRow = (rowId, inputId, title, value, onSet, afterEl) => {
      if (document.getElementById(inputId)) return;
      const row = document.createElement("label");
      row.id = rowId;
      row.innerHTML = `${title}: <input id="${inputId}" type="range" min="5" max="95" step="5" value="${value}"> <output>${value}%</output>`;
      host.insertBefore(row, (afterEl || label).nextSibling);
      const slider = row.querySelector(`#${inputId}`), output = row.querySelector("output");
      slider.oninput = () => {
        const v = Math.max(5, Math.min(95, Math.floor(+slider.value || 50)));
        onSet(v);
        output.value = output.textContent = `${v}%`;
        save();
      };
    };
    // Kéo slider = người chơi đặt tay: đặt cờ tay đặt để combat_policy biết
    // slider này thắng profile (xem js/combat_policy.js). Chọn lại profile
    // sẽ xóa cờ (về ngưỡng profile) — xem combatPolicySave.
    addRow("potLifePctRow", "potLifePct", "Ngưỡng tự bơm HP", potionLifeThreshold(), v => {
      S.potLifePct = v; S.potLifeManual = true;
    });
    addRow("potManaPctRow", "potManaPct", "Ngưỡng tự bơm mana", potionManaThreshold(), v => {
      S.potManaPct = v; S.potManaManual = true;
    }, document.getElementById("potLifePctRow"));
    return out;
  };
}
