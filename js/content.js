"use strict";
/* Schema data-driven tối thiểu — mục 0.2 của DEPTH_ROADMAP.
   Hai loại content: trial rules và event flags. Mỗi loại có version riêng;
   version mới = file mới, KHÔNG sửa file đã phát hành.
   Validator dùng chung cho: build script (fail build), client (lỗi rõ lúc nạp),
   worker bundle (cùng định nghĩa qua build-game.mjs). */
function contentError(what, msg) {
  return new Error(`content/${what}: ${msg}`);
}
function isPlainObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function checkNum(obj, key, what, min, max) {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw contentError(what, `trường "${key}" phải là số trong [${min}, ${max}]`);
}
// version dạng "trial-v1" / "events-v1": <kind>-v<số>
function checkVersion(v, kind, what) {
  if (typeof v !== "string" || !new RegExp(`^${kind}-v[1-9][0-9]*$`).test(v))
    throw contentError(what, `version phải dạng "${kind}-vN", nhận: ${JSON.stringify(v)}`);
}
// Quy tắc trial: id duy nhất, modifier trong allowlist, name/desc hiển thị.
const TRIAL_MODIFIERS = ["def", "interval", "hp", "taken"];
function validateTrialRules(data) {
  const what = "trial";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "trial", what);
  checkNum(data, "baseHp", what, 1, 1e9);
  checkNum(data, "growth", what, 1, 10);
  checkNum(data, "damageGrowth", what, 0, 10);
  if (!isPlainObj(data.lengths)) throw contentError(what, 'lengths phải là object');
  for (const k of ["short", "long"]) {
    const v = data.lengths[k];
    if (!Number.isInteger(v) || v < 1 || v > 64) throw contentError(what, `lengths.${k} phải là số nguyên 1..64`);
  }
  if (!Array.isArray(data.rules) || data.rules.length === 0) throw contentError(what, "rules phải là mảng không rỗng");
  const ids = new Set();
  data.rules.forEach((r, i) => {
    const at = `rules[${i}]`;
    if (!isPlainObj(r)) throw contentError(what, `${at} phải là object`);
    if (typeof r.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(r.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(r.id)) throw contentError(what, `${at}.id trùng: ${r.id}`);
    ids.add(r.id);
    if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
    if (typeof r.desc !== "string" || !r.desc.trim() || r.desc.length > 120) throw contentError(what, `${at}.desc không hợp lệ`);
    let hasMod = false;
    for (const k of Object.keys(r)) {
      if (["id", "name", "desc"].includes(k)) continue;
      if (!TRIAL_MODIFIERS.includes(k)) throw contentError(what, `${at}: modifier lạ "${k}"`);
      hasMod = true;
      checkNum(r, k, `${what}/${at}`, 0.01, 100);
    }
    if (!hasMod) throw contentError(what, `${at} thiếu modifier`);
  });
  return data;
}
// Event flags: danh mục slot sự kiện định kỳ hiện có.
const EVENT_KINDS = ["trial", "challenge", "boss", "bonus"];
const EVENT_CADENCE = ["weekly", "monthly"];
function validateEventFlags(data) {
  const what = "events";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "events", what);
  if (!Array.isArray(data.slots)) throw contentError(what, "slots phải là mảng");
  const ids = new Set();
  data.slots.forEach((s, i) => {
    const at = `slots[${i}]`;
    if (!isPlainObj(s)) throw contentError(what, `${at} phải là object`);
    if (typeof s.id !== "string" || !/^[a-z0-9_]{1,32}$/.test(s.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(s.id)) throw contentError(what, `${at}.id trùng: ${s.id}`);
    ids.add(s.id);
    if (!EVENT_KINDS.includes(s.kind)) throw contentError(what, `${at}.kind phải một trong ${EVENT_KINDS.join("/")}`);
    if (!EVENT_CADENCE.includes(s.cadence)) throw contentError(what, `${at}.cadence phải một trong ${EVENT_CADENCE.join("/")}`);
    if (typeof s.mode !== "string" || s.mode.length > 8) throw contentError(what, `${at}.mode không hợp lệ`);
    if (typeof s.enabled !== "boolean") throw contentError(what, `${at}.enabled phải là boolean`);
    if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
  });
  return data;
}
// So sánh version content client vs server (nguyên tắc 10): lệch -> true (cần banner tải lại).
function contentVersionMismatch(localVersion, remoteVersion) {
  return !!localVersion && !!remoteVersion && localVersion !== remoteVersion;
}
// Banner yêu cầu tải lại khi content server mới hơn client (nguyên tắc 10).
function contentReloadBanner(feature) {
  try {
    if (typeof document === "undefined" || typeof document.createElement !== "function") return;
    if (document.querySelector("#jxContentBanner")) return;
    const b = document.createElement("div");
    b.id = "jxContentBanner";
    b.setAttribute("role", "alert");
    b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#7a1f1f;color:#fff;padding:8px 12px;text-align:center;font-size:14px";
    b.textContent = `Đã có nội dung mới cho ${feature}. `;
    const btn = document.createElement("button");
    btn.textContent = "Tải lại game";
    btn.style.cssText = "margin-left:8px;padding:4px 12px";
    btn.onclick = () => location.reload();
    b.appendChild(btn);
    (document.body || document.documentElement).appendChild(b);
  } catch (e) {}
}
