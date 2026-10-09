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
// Mutator trial: biến thể chủ tướng theo tuần. Modifier dùng chung từ vựng với rule
// (hp/def/interval/taken) nhưng bị chặn trong ngưỡng khả thi để không tạo boss
// bất khả thi (test tính khả thi ở test/trial_mutators.test.mjs).
const TRIAL_MUTATOR_BOUNDS = {hp: [0.5, 2], taken: [0.5, 1.5], def: [0.5, 2], interval: [0.5, 2]};
function validateTrialMutators(data) {
  const what = "trial-mutators";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "trial-mutators", what);
  if (!Array.isArray(data.mutators) || data.mutators.length === 0) throw contentError(what, "mutators phải là mảng không rỗng");
  const ids = new Set();
  data.mutators.forEach((m, i) => {
    const at = `mutators[${i}]`;
    if (!isPlainObj(m)) throw contentError(what, `${at} phải là object`);
    if (typeof m.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(m.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(m.id)) throw contentError(what, `${at}.id trùng: ${m.id}`);
    ids.add(m.id);
    if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
    if (typeof m.desc !== "string" || !m.desc.trim() || m.desc.length > 120) throw contentError(what, `${at}.desc không hợp lệ`);
    let hasMod = false;
    for (const k of Object.keys(m)) {
      if (["id", "name", "desc"].includes(k)) continue;
      const b = TRIAL_MUTATOR_BOUNDS[k];
      if (!b) throw contentError(what, `${at}: modifier lạ "${k}"`);
      hasMod = true;
      checkNum(m, k, `${what}/${at}`, b[0], b[1]);
    }
    if (!hasMod) throw contentError(what, `${at} thiếu modifier`);
  });
  return data;
}
// Rift modifiers (2.0): metadata hiển thị đọc từ JSON; behavior trong riftStats key theo id.
function validateRiftModifiers(data) {
  const what = "rift-modifiers";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "rift-modifiers", what);
  if (!Array.isArray(data.modifiers) || data.modifiers.length === 0) throw contentError(what, "modifiers phải là mảng không rỗng");
  const ids = new Set();
  data.modifiers.forEach((m, i) => {
    const at = `modifiers[${i}]`;
    if (!isPlainObj(m)) throw contentError(what, `${at} phải là object`);
    if (typeof m.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(m.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(m.id)) throw contentError(what, `${at}.id trùng: ${m.id}`);
    ids.add(m.id);
    if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
    if (typeof m.desc !== "string" || !m.desc.trim() || m.desc.length > 140) throw contentError(what, `${at}.desc không hợp lệ`);
    if (typeof m.axis !== "string" || !m.axis.trim() || m.axis.length > 24) throw contentError(what, `${at}.axis không hợp lệ`);
  });
  return data;
}
// Season themes (2.8): chủ đề mùa + modifier toàn cục nhẹ.
function validateSeasonThemes(data) {
  const what = "season-themes";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "season-themes", what);
  if (!Number.isInteger(data.seasonWeeks) || data.seasonWeeks < 4 || data.seasonWeeks > 12)
    throw contentError(what, "seasonWeeks phải là 4-12");
  if (!Array.isArray(data.themes) || data.themes.length === 0)
    throw contentError(what, "themes phải là mảng không rỗng");
  const ids = new Set();
  data.themes.forEach((t, i) => {
    const at = `themes[${i}]`;
    if (!isPlainObj(t)) throw contentError(what, `${at} phải là object`);
    if (typeof t.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(t.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(t.id)) throw contentError(what, `${at}.id trùng: ${t.id}`);
    ids.add(t.id);
    if (typeof t.name !== "string" || !t.name.trim() || t.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
    if (typeof t.desc !== "string" || t.desc.length > 140) throw contentError(what, `${at}.desc không hợp lệ`);
    if (!isPlainObj(t.modifiers)) throw contentError(what, `${at}.modifiers phải là object`);
    for (const k of ["exp", "gold", "drop"]) {
      const v = t.modifiers[k];
      if (typeof v !== "number" || !(v >= 1 && v <= 1.25)) throw contentError(what, `${at}.modifiers.${k} phải là 1-1.25`);
    }
  });
  return data;
}
// Legendary affixes (2.10): affix cực hiếm đổi lối chơi.
function validateLegendaryAffixes(data) {
  const what = "legendary-affixes";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "legendary-affixes", what);
  if (typeof data.rate !== "number" || !(data.rate > 0 && data.rate <= 0.01))
    throw contentError(what, "rate phải là 0-0.01");
  if (!Number.isInteger(data.pity) || data.pity < 100 || data.pity > 10000)
    throw contentError(what, "pity phải là 100-10000");
  if (!Array.isArray(data.affixes) || data.affixes.length === 0)
    throw contentError(what, "affixes phải là mảng không rỗng");
  const ids = new Set(), allowed = new Set(["dr", "lifePct", "leech"]);
  data.affixes.forEach((a, i) => {
    const at = `affixes[${i}]`;
    if (!isPlainObj(a)) throw contentError(what, `${at} phải là object`);
    if (typeof a.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(a.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(a.id)) throw contentError(what, `${at}.id trùng: ${a.id}`);
    ids.add(a.id);
    if (typeof a.name !== "string" || !a.name.trim() || a.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
    if (typeof a.desc !== "string" || a.desc.length > 140) throw contentError(what, `${at}.desc không hợp lệ`);
    if (!isPlainObj(a.effect) || !Object.keys(a.effect).every(k => allowed.has(k)))
      throw contentError(what, `${at}.effect chỉ dùng: dr, revive, skillLeech`);
    for (const [k, v] of Object.entries(a.effect))
      if (typeof v !== "number" || !(v > 0 && v <= 100)) throw contentError(what, `${at}.effect.${k} phải là 0-100`);
  });
  return data;
}
// Faction stories (2.16): truyện ngắn theo phái, mở theo cấp.
function validateFactionStories(data) {
  const what = "faction-stories";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  checkVersion(data.version, "faction-stories", what);
  if (!Array.isArray(data.levels) || !data.levels.length) throw contentError(what, "levels phải là mảng");
  if (!isPlainObj(data.stories)) throw contentError(what, "stories phải là object");
  for (const [fac, arr] of Object.entries(data.stories)) {
    if (!Array.isArray(arr) || arr.length < 5 || arr.length > 7)
      throw contentError(what, `${fac}: 5-7 mẩu`);
    arr.forEach((s, i) => {
      if (!isPlainObj(s) || typeof s.title !== "string" || !s.title.trim() || s.title.length > 30)
        throw contentError(what, `${fac}[${i}].title không hợp lệ`);
      if (!Number.isInteger(s.level) || s.level < 1 || s.level > 180)
        throw contentError(what, `${fac}[${i}].level không hợp lệ`);
      if (typeof s.text !== "string" || s.text.length < 10 || s.text.length > 500)
        throw contentError(what, `${fac}[${i}].text 10-500 ký tự`);
    });
  }
  return data;
}
// Event flags: danh mục slot sự kiện định kỳ hiện có.
const EVENT_KINDS = ["trial", "challenge", "boss", "bonus"];
const EVENT_CADENCE = ["weekly", "monthly"];
function validateEventFlags(data) {
  const what = "events";
  if (!isPlainObj(data)) throw contentError(what, "phải là object");
  if (!/^events-v[12]$/.test(data.version || "")) throw contentError(what, `version phải dạng "events-vN", nhận: ${JSON.stringify(data.version)}`);
  const v2 = data.version === "events-v2";
  if (!Array.isArray(data.slots)) throw contentError(what, "slots phải là mảng");
  const ids = new Set();
  data.slots.forEach((s, i) => {
    const at = `slots[${i}]`;
    if (!isPlainObj(s)) throw contentError(what, `${at} phải là object`);
    if (typeof s.id !== "string" || !/^[a-z0-9_]{1,32}$/.test(s.id)) throw contentError(what, `${at}.id không hợp lệ`);
    if (ids.has(s.id)) throw contentError(what, `${at}.id trùng: ${s.id}`);
    ids.add(s.id);
    if (!EVENT_KINDS.includes(s.kind)) throw contentError(what, `${at}.kind phải một trong ${EVENT_KINDS.join("/")}`);
    // v2: schedule thay cadence (lịch theo tuần thay vì nhịp cố định).
    if (!v2 && !EVENT_CADENCE.includes(s.cadence)) throw contentError(what, `${at}.cadence phải một trong ${EVENT_CADENCE.join("/")}`);
    if (typeof s.mode !== "string" || s.mode.length > 8) throw contentError(what, `${at}.mode không hợp lệ`);
    if (typeof s.enabled !== "boolean") throw contentError(what, `${at}.enabled phải là boolean`);
    if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 40) throw contentError(what, `${at}.name không hợp lệ`);
    if (v2) {
      // Lịch sự kiện (1.3): tuần nào sự kiện chạy. "all" | "even" | "odd" theo chỉ số tuần UTC.
      if (!isPlainObj(s.schedule) || !["all", "even", "odd"].includes(s.schedule.weeks))
        throw contentError(what, `${at}.schedule.weeks phải là all/even/odd`);
      if (s.limits !== undefined) {
        if (!isPlainObj(s.limits)) throw contentError(what, `${at}.limits phải là object`);
        for (const k of Object.keys(s.limits)) {
          if (!["perDay", "perWeek"].includes(k)) throw contentError(what, `${at}.limits: khóa lạ "${k}"`);
          checkNum(s.limits, k, `${what}/${at}.limits`, 1, 1000);
        }
      }
    }
  });
  return data;
}
// Lịch sự kiện (1.3): sự kiện có chạy trong tuần `week` (chỉ số tuần UTC) không.
// Sự kiện ngoài lịch -> false -> worker từ chối chạy (event_not_scheduled).
function eventScheduled(events, slotId, week) {
  const s = events && Array.isArray(events.slots) ? events.slots.find(x => x.id === slotId) : null;
  if (!s || s.enabled === false) return false;
  const w = (s.schedule && s.schedule.weeks) || "all";
  if (w === "all") return true;
  return w === "even" ? week % 2 === 0 : week % 2 === 1;
}
function eventsForWeek(events, week) {
  if (!events || !Array.isArray(events.slots)) return [];
  return events.slots.filter(s => eventScheduled(events, s.id, week));
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
