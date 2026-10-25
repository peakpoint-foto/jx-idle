"use strict";
// Bước 4 jx-idle — NỐI logic Bước 3 (js/step3.js, logic thuần) vào vòng game thật.
// Phạm vi nối, trung thực theo từng điểm (xem STEP4-REPORT.md):
//  (1) tick Cơ Quan Phổ: ĐÁNH GIÁ qua step3TriggerTryNow (log khi đủ điều kiện
//      THAY ĐỔI) + CAST THẬT ở nhịp đánh qua step6PacingAttack (Bước 6, xem
//      js/step6.js: tách castAttack dùng chung từ heroAttack). Đánh giá tôn trọng:
//      ưu tiên, chờ nhịp sau, cấm đệ quy, không chạy trong offline catch-up
//      (không có điểm nối nào trong offline_report).
//      Flag trigger_deck vẫn OFF mặc định; khi OFF, tick không làm gì.
//  (2) tick Đồng hành: thời điểm hồi sinh (giữa trận → chờ hết trận mới có tác
//      dụng) + Khí Tràng làm chậm qua hệ số đòn quái. Đồng hành Bước 3 KHÔNG
//      phải pet cũ (S.rw.pet/petTick): sát thương tự thân của Đồng hành chưa
//      nối vào combat (không có entity riêng an toàn) — hằng số ×0,5 vẫn nằm
//      ở step3CompanionDamage để code sau dùng, không tuyên bố đã phát huy.
//  (3) ghi Đồ Chí tại điểm rơi thật: hook trong dropToGround (loot.js), ghi
//      cả khi túi đầy (rơi xuống đất không qua túi), chỉ ghi tên trong catalog
//      990, flag OFF thì không ghi, lỗi ghi không bao giờ làm hỏng lần rơi.
//  (4) áp bonus vào calc(): chỉ nhân P.dmgMul/P.life/P.regen theo đúng số sim
//      Bước 3 (Khí Tràng +10%, Linh Phù +5%/+5%/+10%, DPS mới tối đa +15%,
//      kẹp trần 0,15); KHÔNG chạm skAdd/plus/skillLevels (không cộng cấp nào).
//  (5) UI tối thiểu: builder HTML thuần (test được, không asset mới, icon 0),
//      mở bằng modal sẵn có, chèn 1 card vào tab Khác qua renderMore.
// Mọi hàm đều fail-closed khi flag OFF, khi thiếu save, hoặc khi step3 chưa nạp.
const STEP4_CRAFT_CAPS = Object.freeze({ add_line: 30, change_line: 30, reroll_numbers: 50, remove_line: 30, seal: 20 });
const STEP4_CRAFT_NAMES = Object.freeze({ add_line: "Tăng Văn", change_line: "Dịch Văn", reroll_numbers: "Luyện Số", remove_line: "Tẩy Văn", seal: "Phong Ấn" });
const STEP4_CHARM_EFFECT_VI = Object.freeze({ damage: "sát thương +5%", life: "sinh lực +5%", regen: "hồi phục +10%" });

function step4Flag(flag) {
  try { if (typeof featureEnabled === "function") return !!featureEnabled(flag); } catch (e) { /* fail-closed */ }
  return false;
}
function step4Esc(s) {
  try { if (typeof esc === "function") return esc(s); } catch (e) { /* noop */ }
  return String(s == null ? "" : s);
}
function step4AuraId(save) {
  try {
    const c = save && save.step3 && save.step3.companion;
    if (!c || !c.alive || c.pendingRevive || !c.aura) return null;
    return c.aura;
  } catch (e) { return null; }
}
function step4CharmEffects(save) {
  try { if (typeof step3TrophyCharmEffects === "function") return step3TrophyCharmEffects(save); } catch (e) { /* noop */ }
  return [];
}

// --- (a) Trần sở hữu Luyện Tài: đặc tả validator (hệ Luyện Tài vẫn chưa code,
//     vẫn khóa tài khoản tới Giai đoạn 4; đây là số KHỞI ĐIỂM, chưa phải sim) ---
function step4CraftCheck(counts) {
  const over = [];
  const c = counts && typeof counts === "object" ? counts : {};
  for (const type of Object.keys(STEP4_CRAFT_CAPS)) {
    const v = c[type];
    if (!Number.isInteger(v) || v < 0 || v > STEP4_CRAFT_CAPS[type]) over.push(type);
  }
  return { ok: over.length === 0, over };
}
function step4CraftGrant(counts, type, n) {
  if (!Object.prototype.hasOwnProperty.call(STEP4_CRAFT_CAPS, type))
    throw new Error("Loại Luyện Tài không có trong 5 loại");
  if (!Number.isInteger(n)) return false;
  const cur = (counts && counts[type]) || 0;
  const next = cur + n;
  if (!Number.isInteger(next) || next < 0 || next > STEP4_CRAFT_CAPS[type]) return false;
  return Object.assign({}, counts, { [type]: next });
}

// --- (3) Ghi Đồ Chí tại điểm rơi ---
let STEP4_ITEM_NAMES = null;
function step4ItemNames() {
  if (STEP4_ITEM_NAMES) return STEP4_ITEM_NAMES;
  try {
    if (typeof J === "undefined" || !J.items) return null;
    STEP4_ITEM_NAMES = new Set(J.items.flatMap(d => (d.list || []).map(it => it.n)));
  } catch (e) { return null; }
  return STEP4_ITEM_NAMES;
}
function step4RecordDrop(it) {
  try {
    if (typeof S === "undefined" || !S || !it || typeof it.n !== "string") return false;
    if (!step4Flag("loot_records")) return false;
    const names = step4ItemNames();
    if (!names) return false; // không có catalog thì fail-closed, không ghi bừa
    const name = it.n.replace(/^Cực phẩm · /, "");
    if (!names.has(name)) return false;
    if (typeof step3CodexRecord !== "function") return false;
    return step3CodexRecord(S, name, undefined, { enabled: true });
  } catch (e) { return false; }
}

// --- (4) Áp bonus vào calc() ---
function step4ApplyCalc(P) {
  if (!P) return P;
  try {
    if (typeof S === "undefined" || !S || !S.step3) return P;
    const auraOn = step4Flag("companion");
    const charmOn = step4Flag("trophy_charm");
    if (!auraOn && !charmOn) return P;
    const aura = auraOn ? step4AuraId(S) : null;
    const charms = charmOn ? step4CharmEffects(S) : [];
    const byEffect = (effect) => charms.filter(c => c.effect === effect)
      .map(c => ({ type: effect, bonus: c.bonus }));
    // step3ResolveEffectBonus: aura vs bùa cùng hiệu ứng lấy max, Linh Phù cộng
    // thêm, tối đa 1 Linh Phù/loại. Ở đây buff hiện có đã nằm trong P nên chỉ
    // truyền buff=0 để không cộng đúp; KHÔNG chạm cấp kỹ năng.
    const dmg = typeof step3ResolveEffectBonus === "function"
      ? step3ResolveEffectBonus({ buff: 0, aura: aura === "damage" ? 0.10 : 0, charms: byEffect("damage") }).total : 0;
    const dmgTotal = Math.min(0.15, Math.max(0, dmg));
    if (dmgTotal) P.dmgMul = (P.dmgMul || 1) * (1 + dmgTotal);
    const life = byEffect("life").length
      ? (typeof step3ResolveEffectBonus === "function"
        ? step3ResolveEffectBonus({ buff: 0, aura: 0, charms: byEffect("life") }).total : 0) : 0;
    if (life) P.life = P.life * (1 + life);
    const regen = typeof step3ResolveEffectBonus === "function"
      ? step3ResolveEffectBonus({ buff: 0, aura: aura === "heal" ? 0.10 : 0, charms: byEffect("regen") }).total : 0;
    if (regen) P.regen = P.regen * (1 + regen);
    P.step4SlowMul = aura === "slow" ? 1.10 : 1;
    P.step4Bonus = { damage: dmgTotal, life: life, regen: regen, aura: aura };
  } catch (e) { /* calc thật không bao giờ được vỡ vì bonus */ }
  return P;
}
function step4MonsterIntervalMul() {
  try {
    if (!step4Flag("companion")) return 1;
    return step4AuraId(typeof S !== "undefined" ? S : null) === "slow" ? 1.10 : 1;
  } catch (e) { return 1; }
}

// --- (1) Tick Cơ Quan Phổ (đánh giá) + Đồng hành ---
function step4TriggerReady(slot) {
  try {
    if (!slot || typeof slot.condition !== "string") return false;
    const m = slot.condition.trim().match(/^(hp|mana)\s*(<=|<)\s*(\d+(?:\.\d+)?)\s*(%)?$/i);
    if (!m) return false; // điều kiện không hiểu được: fail-closed, không đủ điều kiện
    const cur = m[1].toLowerCase() === "hp"
      ? (typeof R !== "undefined" && R && R.P ? R.life / R.P.life : 1)
      : (typeof R !== "undefined" && R && R.P ? R.mana / R.P.mana : 1);
    const n = parseFloat(m[3]);
    const val = m[4] ? cur * 100 : (n <= 1 ? cur : (m[1].toLowerCase() === "hp" ? R.life : R.mana));
    return m[2] === "<=" ? val <= n : val < n;
  } catch (e) { return false; }
}
function step4CompanionTick(save, inBattle) {
  try {
    const c = save && save.step3 && save.step3.companion;
    if (!c) return { revived: false, aura: null };
    if (c.pendingRevive && !inBattle) {
      // Hồi sinh giữa trận chỉ có tác dụng từ trận sau: hết trận mới áp dụng.
      c.pendingRevive = false; c.alive = true;
      return { revived: true, aura: c.aura || null };
    }
    if (!c.alive || c.pendingRevive) return { revived: false, aura: null };
    return { revived: false, aura: c.aura || null };
  } catch (e) { return { revived: false, aura: null }; }
}
function step4GameTick(dt) {
  void dt;
  const out = { trigger: { wouldFire: null, reasons: [] }, companion: { revived: false, aura: null } };
  try {
    if (typeof S === "undefined" || !S || !S.fac) return out;
    // Cơ Quan Phổ: chỉ đánh giá trong tick trực tuyến. Không có điểm nối nào
    // trong offline catch-up, nên hàm này không bao giờ chạy offline.
    if (step4Flag("trigger_deck") && typeof step3TriggerTryNow === "function") {
      const deck = S.step3 && S.step3.trigger_deck;
      if (deck && Array.isArray(deck.slots) && deck.slots.length) {
        const res = step3TriggerTryNow(S, step4TriggerReady, {}, { enabled: true });
        out.trigger = { wouldFire: res.wouldFire ? res.wouldFire.skill : null, reasons: res.reasons || [] };
        deck.step4EvalCount = (deck.step4EvalCount || 0) + 1;
        // Chỉ log khi cơ quan đủ điều kiện THAY ĐỔI (tránh spam log mỗi tick);
        // và ghi rõ đây là "đủ điều kiện", chưa phải "đã cast" (xem đầu file).
        if (out.trigger.wouldFire !== (deck.step4LastWould ?? null)) {
          deck.step4LastWould = out.trigger.wouldFire;
          if (out.trigger.wouldFire && typeof log === "function") {
            let nm = out.trigger.wouldFire;
            try { if (typeof SK !== "undefined" && SK[nm]) nm = SK[nm].n; } catch (e) { /* noop */ }
            log(`Cơ Quan Phổ: ${step4Esc(nm)} đủ điều kiện (sẽ cast ở nhịp đánh tiếp theo nếu còn đủ điều kiện).`);
          }
        }
      }
    }
    if (step4Flag("companion")) {
      const inBattle = typeof R !== "undefined" && R && Array.isArray(R.enemies)
        && R.enemies.some(e => e && !e.dead);
      out.companion = step4CompanionTick(S, !!inBattle);
    }
  } catch (e) { /* tick thật không bao giờ được vỡ vì Bước 4 */ }
  return out;
}

// --- (5) UI tối thiểu (builder thuần, tái dùng modal + khung tab Khác, icon 0) ---
function step4CharmTrayHTML(save) {
  const inv = (save && Array.isArray(save.inv)) ? save.inv : [];
  const max = (typeof INV_MAX === "number" ? INV_MAX : 60);
  const charms = inv.filter(it => it && it.charmId);
  const rows = charms.map(it => {
    const def = (typeof STEP3_TROPHY_CHARMS !== "undefined"
      ? STEP3_TROPHY_CHARMS.find(c => c.id === it.charmId) : null) || {};
    const eff = STEP4_CHARM_EFFECT_VI[def.effect] || def.effect || "";
    return `<div class="qrow"><span>${step4Esc(it.charmId)} · ${step4Esc(eff)} · cấp ${it.level || 1}</span><span class="dim">${it.locked ? "đã khóa (bảo vệ khỏi tự dọn)" : "chưa khóa"}</span></div>`;
  }).join("");
  return `<h3>Linh Phù đang mang</h3><p>Linh Phù: ${charms.length} · đồ: ${inv.length - charms.length} · còn trống: ${Math.max(0, max - inv.length)} / ${max} ô</p>${rows || `<p class="dim small">Chưa mang Linh Phù nào — khay trống.</p>`}`;
}
function step4TriggerCardHTML(save) {
  const deck = save && save.step3 && save.step3.trigger_deck;
  const slots = deck && Array.isArray(deck.slots) ? deck.slots : [];
  if (!slots.length) return `<h3>Cơ Quan Phổ</h3><p class="dim small">Chưa cấu hình Cơ Quan Phổ (tối đa 3 ô).</p>`;
  const rows = slots.map((s, i) => {
    let nm = s.skill;
    try { if (typeof SK !== "undefined" && SK[s.skill]) nm = SK[s.skill].n; } catch (e) { /* noop */ }
    return `<div class="qrow"><span>Cơ quan ${i + 1}: Khi ${step4Esc(s.condition)} → ${step4Esc(nm)} · ưu tiên ${s.priority}</span><span class="dim">${deck.lastFired === s.skill ? "phát động gần nhất" : "chưa phát động trong phiên"}</span></div>`;
  }).join("");
  return `<h3>Cơ Quan Phổ</h3>${rows}<div class="btnrow"><button class="btn" id="s4TryNow">Thử ngay</button></div><div id="s4TryResult"></div><p class="dim small">Thử ngay chạy thử với chỉ số hiện tại: không tốn lượt, không tiêu cooldown, không rơi thưởng.</p>`;
}
function step4FarmStatusHTML(save) {
  let st = "Chưa đặt lịch farm";
  try { if (typeof step3FarmStatus === "function") st = step3FarmStatus(save); } catch (e) { /* noop */ }
  return `<h3>Lịch farm</h3><p>${step4Esc(st)}</p>`;
}
function step4PresetPickerHTML() {
  const list = (typeof STEP3_PRESETS !== "undefined" ? STEP3_PRESETS : []);
  const rows = list.map(p => `<button class="btn" data-s4-preset="${step4Esc(p.fac)}"><b>${step4Esc(p.facName)}</b><small> · ${step4Esc(p.skillName)}</small></button>`).join("");
  return `<h3>Chọn Võ Công Mẫu</h3><p class="dim small">10 mẫu, 1/phái. Chọn mẫu rồi tùy chỉnh; mẫu khác phái bị từ chối.</p><div class="btnrow">${rows}</div>`;
}
function step4MoreSectionHTML() {
  return `<h3>Tính năng Bước 4</h3><div class="card"><p class="dim small">Các tính năng Bước 3 đã nối vào vòng game (flag vẫn OFF mặc định cho tới khi nối + test xong từng cái).</p><div class="btnrow"><button class="btn" id="s4Charm">Linh Phù đang mang</button><button class="btn" id="s4Trigger">Cơ Quan Phổ</button><button class="btn" id="s4Farm">Lịch farm</button><button class="btn" id="s4Preset">Võ Công Mẫu</button></div></div>`;
}
function step4ModalHTML(save, section) {
  if (section === "charm") return step4CharmTrayHTML(save);
  if (section === "trigger") return step4TriggerCardHTML(save);
  if (section === "farm") return step4FarmStatusHTML(save);
  if (section === "preset") return step4PresetPickerHTML();
  return step4CharmTrayHTML(save) + step4TriggerCardHTML(save) + step4FarmStatusHTML(save) + step4PresetPickerHTML();
}
function step4BindModal() {
  try {
    const btn = document.querySelector("#s4TryNow");
    if (btn) btn.onclick = () => {
      try {
        const res = step3TriggerTryNow(S, step4TriggerReady, {}, { enabled: true });
        const el = document.querySelector("#s4TryResult");
        if (el) el.innerHTML = res.reasons.map(r => `<div class="qrow"><span>Kỹ năng ${r.skill}</span><span>${step4Esc(r.reason)}</span></div>`).join("")
          || `<p class="dim small">Chưa có cơ quan nào.</p>`;
      } catch (e) { if (typeof toast === "function") toast(e.message); }
    };
    document.querySelectorAll("[data-s4-preset]").forEach(b => {
      b.onclick = () => {
        try {
          step3PresetApply(S, b.dataset.s4Preset, { enabled: step4Flag("build_presets") });
          if (typeof toast === "function") toast("Đã chọn Võ Công Mẫu.");
          if (typeof refresh === "function") refresh();
        } catch (e) { if (typeof toast === "function") toast(e.message); }
      };
    });
  } catch (e) { /* UI bind không được vỡ game */ }
}
function step4OpenModal(section) {
  try {
    if (typeof modal !== "function") return false;
    modal(step4ModalHTML(typeof S !== "undefined" ? S : null, section), step4BindModal);
    return true;
  } catch (e) { return false; }
}
function step4BindMore() {
  try {
    const bind = (id, section) => {
      const el = document.querySelector(id);
      if (el) el.onclick = () => step4OpenModal(section);
    };
    bind("#s4Charm", "charm"); bind("#s4Trigger", "trigger");
    bind("#s4Farm", "farm"); bind("#s4Preset", "preset");
  } catch (e) { /* noop */ }
}
function step4TrophyBosses() {
  try {
    return STEP3_TROPHY_CHARMS.map(c => ({ id: c.id, bossId: c.bossId, bossName: c.bossName, bossRef: c.bossRef }));
  } catch (e) { return []; }
}
