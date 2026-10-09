import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("truyện phái: mở dần theo cấp, đủ 11 phái", () => {
  const g = game();
  const n = g.json(`Object.keys(factionStories()).length`);
  assert.equal(n, 11, "11 phái có truyện");
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
