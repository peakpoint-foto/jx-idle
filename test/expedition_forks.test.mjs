import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("expedition forks: seed theo ngày, mọi người cùng bản đồ", () => {
  const g = game();
  const a = g.json(`expeditionDailyForks("2026-10-09")`);
  const b = g.json(`expeditionDailyForks("2026-10-09")`);
  assert.deepEqual(a, b, "cùng ngày -> cùng bản đồ");
  const c = g.json(`expeditionDailyForks("2026-10-10")`);
  assert.notDeepEqual(a, c, "khác ngày -> khác bản đồ");
  assert.equal(a.length, 3, "3 ngã rẽ");
  for (const f of a) {
    assert.equal(f.branches.length, 2);
    assert.ok(f.branches[0].safe && !f.branches[1].safe, "nhánh 1 an toàn, nhánh 2 hiểm");
    assert.ok(f.branches[1].desc.includes("+"), "hiển thị tradeoff trước");
  }
});

test("expedition forks: modifier cộng dồn đúng", () => {
  const g = game();
  const m = g.json(`expeditionForkMods([{mod:{hp:0.9,damage:0.9,gold:1,loot:0}},{mod:{hp:1.2,damage:1.2,gold:1.3,loot:1}}])`);
  assert.ok(Math.abs(m.hp - 1.08) < 1e-9, "hp nhân dồn");
  assert.ok(Math.abs(m.gold - 1.3) < 1e-9);
  assert.equal(m.loot, 1);
});
