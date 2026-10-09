"use strict";
// 2.16: Truyện ngắn theo phái — đọc trong codex, mở dần theo cấp.
// Telemetry: story_read (kèm phái).
function factionStories() {
  const F = typeof JX_CONTENT !== "undefined" && JX_CONTENT.factionStories;
  return F ? F.stories : {};
}
function factionStoriesFor(facKey, lvl) {
  const all = factionStories()[facKey] || [];
  return all.filter(s => lvl >= s.level).sort((a, b) => a.level - b.level);
}
function storyRead(facKey, idx) {
  const r = RW();
  r.stories = r.stories || {};
  r.stories[`${facKey}:${idx}`] = 1;
  save();
  if (typeof telemetry === "function")
    telemetry("story_read", {fac: facKey, idx});
}
function storyHTML() {
  const facKey = S.fac, lvl = S.lvl;
  const all = (factionStories()[facKey] || []).slice().sort((a, b) => a.level - b.level);
  const read = (RW().stories || {});
  if (!all.length) return `<p class="dim">Chưa có truyện cho phái này.</p>`;
  return `<h4>Truyện phái ${esc((FAC[facKey] || {}).n || facKey)}</h4>` +
    all.map((s, i) => {
      const unlocked = lvl >= s.level, wasRead = read[`${facKey}:${i}`];
      if (!unlocked)
        return `<div class="card"><b>???</b> <small class="dim">Mở ở cấp ${s.level}</small></div>`;
      return `<div class="card"><b>${esc(s.title)}</b> <small class="dim">Cấp ${s.level}${wasRead ? " · đã đọc" : ""}</small>` +
        `<p>${esc(s.text)}</p>` +
        (wasRead ? "" : `<div class="btnrow"><button class="btn sm" data-story="${i}">Đánh dấu đã đọc</button></div>`) +
        `</div>`;
    }).join("");
}
