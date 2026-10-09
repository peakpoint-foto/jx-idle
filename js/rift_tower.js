"use strict";
// Tháp vô hạn 2.2: mỗi tầng seed theo ngày, modifier xoay từ JSON (schema 2.0),
// checkpoint mỗi 10 tầng, bảng độ sâu riêng (local). Dùng training session nên
// deterministic và không ảnh hưởng build thật. Mặc định tắt (flag rift_tower).
// Bảng worker (rank) chưa cần — xem FEATURE_ROLLOUT.md.
const TOWER = Object.freeze({baseHp: 60000, hpGrowth: 1.16, duration: 90, defPerFloor: 8});
const towerDayIdx = (now = Date.now()) => Math.floor(now / 864e5);
function towerSeed(day) { return (Math.imul((day | 0) ^ 0x9E3779B9, 2654435761) >>> 0); }
function towerFloorSeed(day, floor) { return (Math.imul(towerSeed(day), 31) + Math.imul(floor | 0, 0x85EBCA6B)) >>> 0; }
function towerModCount(floor) { return floor >= 25 ? 3 : floor >= 10 ? 2 : 1; }
function towerFloorModifiers(day, floor) {
  const ids = JX_CONTENT.riftModifiers.modifiers.map(m => m.id);
  const seed = towerFloorSeed(day, floor), n = towerModCount(floor), picks = [];
  for (let i = 0; i < n; i++) {
    const id = ids[(seed + i * 7) % ids.length];
    if (!picks.includes(id)) picks.push(id); else picks.push(ids[(seed + i * 7 + 3) % ids.length]);
  }
  return picks;
}
const towerFloorHp = floor => Math.round(TOWER.baseHp * Math.pow(TOWER.hpGrowth, Math.max(0, floor - 1)));
const towerCheckpoint = cleared => Math.floor(Math.max(0, cleared) / 10) * 10;
function towerAllowed() {
  return typeof S !== "undefined" && S && modeId() === "g2" && featureEnabled("training_lab") && featureEnabled("rift_tower") && !ADMV.sandbox && !SAVE_LOCK;
}
function towerState() {
  if (!S.extensions || typeof S.extensions !== "object") S.extensions = {v: 1};
  const t = S.extensions.riftTower;
  if (t && typeof t === "object") {
    if (!Number.isInteger(t.cleared) || t.cleared < 0) t.cleared = 0;
    if (!Number.isInteger(t.best) || t.best < 0) t.best = 0;
    if (!Array.isArray(t.history)) t.history = [];
    return t;
  }
  return (S.extensions.riftTower = {day: towerDayIdx(), cleared: 0, best: 0, history: []});
}
// Leo 1 tầng. Trả {floor, won, modifiers, dps, secs, checkpoint, best}.
function towerClimb() {
  if (!towerAllowed()) throw new Error("Tháp vô hạn chưa mở");
  const st = towerState(), day = towerDayIdx();
  st.day = day;
  const floor = st.cleared + 1;
  const mods = towerFloorModifiers(day, floor);
  const session = trainingCreate({seed: towerFloorSeed(day, floor), duration: TOWER.duration,
    hp: towerFloorHp(floor), def: 200 + floor * TOWER.defPerFloor, targets: 1}, S, {riftModifiers: mods});
  let report = null;
  for (let t = 0; t < TOWER.duration; t += 5) {
    report = trainingAdvance(session, 5);
    if (!session.runtime.enemies.some(e => e.hp > 0) || session.status === "defeated") break;
  }
  const won = session.status !== "defeated" && !session.runtime.enemies.some(e => e.hp > 0);
  if (won) {
    st.cleared = floor;
    st.best = Math.max(st.best, floor);
  } else {
    st.cleared = towerCheckpoint(floor - 1);
  }
  st.history.push({day, floor, won, at: Date.now()});
  st.history = st.history.slice(-7);
  R.dirty = true;
  return {floor, won, modifiers: mods, dps: report ? report.dps : 0,
    secs: report ? report.elapsed : 0, checkpoint: towerCheckpoint(st.cleared), best: st.best};
}
function towerModNames(mods) {
  return mods.map(id => (RIFT_MODIFIERS[id] && RIFT_MODIFIERS[id].name) || id);
}
function towerPanelHTML() {
  if (!towerAllowed()) return "";
  const st = towerState(), floor = st.cleared + 1, mods = towerFloorModifiers(towerDayIdx(), floor);
  const hist = st.history.slice().reverse().map(h =>
    `<div class="qrow"><span>Tầng ${h.floor} · ${h.won ? "✔ qua" : "✖ dừng"}</span><span class="dim">${new Date(h.at).toLocaleDateString("vi-VN")}</span></div>`).join("");
  return `<details class="card" id="towerPanel"><summary>Tháp vô hạn · đang ở tầng ${floor}</summary>
    <p class="desc">Mỗi tầng seed theo ngày, modifier xoay từ JSON. Qua 10 tầng giữ checkpoint — thua thì leo lại từ checkpoint. Không thưởng, không ảnh hưởng build thật.</p>
    <div class="card stats"><span>Tầng tiếp theo</span><span>${floor}</span><span>Modifier tầng này</span><span>${esc(towerModNames(mods).join(", "))}</span><span>Sâu nhất</span><span>${st.best}</span><span>Checkpoint</span><span>tầng ${towerCheckpoint(st.cleared) + 1}</span></div>
    <div class="btnrow"><button class="btn" id="towerClimb">Leo tầng ${floor}</button></div>
    <div id="towerResult"></div>
    ${hist ? `<b>Lịch sử leo</b>${hist}` : `<p class="dim small">Chưa leo lần nào.</p>`}
  </details>`;
}
function towerBindPanel() {
  const btn = document.getElementById("towerClimb");
  if (!btn) return;
  btn.onclick = () => {
    try {
      const r = towerClimb(); save();
      document.getElementById("towerResult").innerHTML =
        `<div class="card ${r.won ? "" : "lock"}"><b>${r.won ? "Đã qua tầng " + r.floor + "!" : "Dừng ở tầng " + r.floor + " — quay về checkpoint tầng " + (r.checkpoint + 1)}</b><br>` +
        `<small class="dim">Modifier: ${esc(towerModNames(r.modifiers).join(", "))} · DPS ${fmt(r.dps)} · ${r.secs.toFixed(0)}s · sâu nhất ${r.best}</small></div>`;
      // vẽ lại panel để cập nhật tầng tiếp theo
      const panel = document.getElementById("towerPanel");
      if (panel) { panel.outerHTML = towerPanelHTML(); towerBindPanel(); }
    } catch (e) { toast(e.message); }
  };
}
