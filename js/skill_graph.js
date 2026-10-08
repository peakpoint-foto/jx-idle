"use strict";

// Read-only interpretation of the same addskilldamage rows consumed by calc().
// Child destinations are informational: never fold them into the parent's bonus,
// because many source rows already list both parent and child explicitly.
function skillSupportLinks(id, level = 1, state) {
  const s = SK[id];
  if (!s) return [];
  state = state || (typeof S !== "undefined" ? S : null);
  const faction = s.fac || FAC[s.f];
  const own = new Set(faction ? faction.skills.map(Number) : []);
  const learned = state && state.sk || {};
  return Object.keys(s.attr || {}).filter(name => name.startsWith("addskilldamage")).map(attribute => {
    const row = skVal(s, attribute, Math.max(1, Math.floor(level) || 1));
    if (!row || !row[0] || !Number.isFinite(row[2])) return null;
    const target = +row[0];
    const status = !SK[target] ? "unsupported" : own.has(target) ? "learnable" : "child";
    const sameFaction = !!(state && faction && state.fac === faction.key);
    const active = status === "learnable" && sameFaction && +learned[id] > 0 && +learned[target] > 0;
    const reason = status === "unsupported" ? "Thiếu dữ liệu kỹ năng đích; chưa được hỗ trợ"
      : status === "child" ? "Kỹ năng con; không cộng thêm vào chiêu gốc"
      : !sameFaction ? "Khác môn phái" : !learned[id] ? "Chưa học kỹ năng bổ trợ"
      : !learned[target] ? "Chưa học kỹ năng đích" : "Đang bổ trợ";
    return { source: +id, target, sourceName: s.n, targetName: SK[target]?.n || "Kỹ năng chưa có dữ liệu",
      attribute, percent: row[2], status, active, reason };
  }).filter(Boolean);
}

function factionSkillGraph(key, state) {
  const faction = FAC[key];
  if (!faction) return [];
  state = state || (typeof S !== "undefined" ? S : null);
  return faction.skills.flatMap(id => {
    const level = state && state.sk && state.sk[id] && state === S ? skillLv(id) : state?.sk?.[id] || 1;
    return skillSupportLinks(id, level, state);
  });
}
