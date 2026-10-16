import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("truyện phái: mở dần theo cấp, đủ 10 phái", () => {
  const g = game();
  const n = g.json(`Object.keys(factionStories()).length`);
  assert.equal(n, 10, "10 phái có truyện");
  // cấp 30 mở được 1, cấp 180 mở hết 6
  g.run(`fixture('ctc',30);`);
  const s30 = g.json(`factionStoriesFor(S.fac, 30).length`);
  assert.equal(s30, 1, "cấp 30 mở 1 mẩu");
  g.run(`S.lvl=180;`);
  const s180 = g.json(`factionStoriesFor(S.fac, 180).length`);
  assert.equal(s180, 6, "cấp 180 mở 6 mẩu");
});

test("truyện phái: validator chấp nhận JSON", () => {
  const g = game();
  const ok = g.json(`(()=>{try{validateFactionStories(JX_CONTENT.factionStories);return true;}catch(e){return e.message;}})()`);
  assert.equal(ok, true, "JSON hợp lệ");
});

test("truyện phái: storyHTML không throw cho mọi phái (regression B1)", () => {
  // B1: storyHTML() gọi .sort() trực tiếp trên mảng frozen (deep-freeze ở build-content.mjs)
  // → throw TypeError trong strict mode khi mở Truyện phái. Fix: .slice().sort().
  const g = game();
  g.run(`fixture('ctc',30);`);
  const facKeys = g.json(`Object.keys(factionStories())`);
  assert.ok(facKeys.length >= 10, "đủ phái có truyện");
  for (const fac of facKeys) {
    const before = g.json(`factionStories()['${fac}'].map(s=>s.level)`);
    g.run(`S.fac='${fac}'; S.lvl=180;`);
    const html1 = g.run(`storyHTML()`);
    assert.equal(typeof html1, "string", `storyHTML trả chuỗi (${fac})`);
    assert.ok(html1.includes("Truyện phái"), `có tiêu đề Truyện phái (${fac})`);
    // gọi lần 2 phải ra cùng kết quả → mảng gốc không bị sort tại chỗ
    const html2 = g.run(`storyHTML()`);
    assert.equal(html2, html1, `gọi lần 2 cùng kết quả (${fac})`);
    const after = g.json(`factionStories()['${fac}'].map(s=>s.level)`);
    assert.deepEqual(after, before, `mảng frozen của phái ${fac} không bị mutate`);
  }
});
