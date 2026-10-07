"use strict";

// Shared preconditions. UI visibility is not an authorization boundary.
function activityBusy() {
  return !!(S && S.siege || R.tower || R.tk || typeof SV !== "undefined" && SV.on);
}

function requireIdle() {
  if (!activityBusy()) return true;
  toast("Rời hoạt động hiện tại trước khi bắt đầu hoặc thay đổi nhân vật");
  return false;
}

// Sandbox is deliberately ephemeral; regular entry must persist its quota first.
function persistActivityEntry(rollback) {
  if (ADMV.sandbox || save()) return true;
  rollback();
  return false;
}

function unlinkSlotOnline(i) {
  localStorage.removeItem(slotKey(i) + "_online");
  localStorage.removeItem(slotKey(i) + "_kps");
  if (i === SLOT && typeof ONL !== "undefined") {
    ONL.me = null;
    ONL.lastSync = 0;
  }
}

// A guaranteed reward must not use drop-weight rejection to decide line count.
// Search only legal rows, preserve alternating prefix/suffix and unique IDs.
function maximumMagicLines(it, count = 6) {
  const level = clamp(it.lvl + 1, 1, 10);
  const candidates = J.affix.filter(a => (a.s < 0 || a.s === it.s) && a.lvl <= level &&
    (a.w[it.d] || 0) > 0 && !DEAD_AFFIX.has(canonAttr(attrName(a.a))));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const used = new Set(), lines = [];
  let visits = 0;
  function search(index) {
    if (index === count) return true;
    if (++visits > 10000) return false;
    const pre = index % 2 === 0 ? 1 : 0;
    for (const row of candidates) {
      if (row.pre !== pre || used.has(row.a)) continue;
      used.add(row.a);
      lines.push({ a: row.a, n: row.n, pre, p: row.p.map(([mn, mx]) =>
        mn === -1 && mx === -1 ? -1 : Math.abs(mx) >= Math.abs(mn) ? mx : mn) });
      if (search(index + 1)) return true;
      lines.pop(); used.delete(row.a);
    }
    return false;
  }
  return search(0) ? lines : null;
}
