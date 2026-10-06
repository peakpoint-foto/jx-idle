import test from "node:test";
import assert from "node:assert/strict";
import { GAME as G } from "../gen/game.js";
import { validateChar, levelCapForTime, minSecForLevel, bracketOf } from "../src/validate.js";

const fac = Object.keys(G.FAC)[0];
function makeChar(lvl) {
  const s = G.newSave();
  Object.assign(s, { fac, mode: "ctc", lvl, attrPts: (lvl - 1) * G.PTS_PER_LEVEL, skPts: lvl });
  G.setS(s);
  const tier = Math.max(1, Math.min(10, Math.round(lvl / 12)));
  for (const [d, k, slot] of [[0, 0, "weapon"], [2, 0, "armor"], [7, 0, "helm"]]) {
    const it = G.makeItem(d, k, tier, 2);
    if (it) s.eq[slot] = it;
  }
  return s;
}
const codes = (r) => r.flags.map((f) => f[0]);

test("nhân vật hợp lệ không bị gắn cờ và có lực chiến", () => {
  for (let i = 0; i < 20; i++) {
    const r = validateChar(makeChar(60), 1e7);
    assert.deepEqual(codes(r), [], JSON.stringify(r.flags));
    assert.ok(r.power > 0);
    assert.equal(r.bracket.k, "so");
  }
});

test("sửa chỉ số trang bị bị gắn cờ", () => {
  const s = makeChar(60);
  const it = Object.values(s.eq)[0];
  it.base = it.base.map(([id, mn, mx]) => [id, mn * 50, mx * 50]);
  assert.ok(codes(validateChar(s, 1e7)).includes("item_base"));
  const s2 = makeChar(60);
  const it2 = Object.values(s2.eq).find((x) => x.mag.length) || Object.values(s2.eq)[0];
  it2.mag = [{ a: 126, p: [9999], pre: 1 }];
  assert.ok(codes(validateChar(s2, 1e7)).includes("item_affix"));
  const s3 = makeChar(60);
  Object.values(s3.eq)[0].enh = 99;
  assert.ok(codes(validateChar(s3, 1e7)).includes("item_enh"));
});

test("điểm tiềm năng và kỹ năng vượt mức bị gắn cờ", () => {
  const s = makeChar(50);
  s.attr.str = 5000;
  assert.ok(codes(validateChar(s, 1e7)).includes("attr_points"));
  const s2 = makeChar(50);
  s2.skPts = 999;
  assert.ok(codes(validateChar(s2, 1e7)).includes("skill_points"));
});

test("cấp vượt ngưỡng giờ chơi bị gắn cờ, đủ giờ thì không", () => {
  const s = makeChar(120);
  assert.ok(codes(validateChar(s, 600)).includes("level_time"));
  assert.ok(!codes(validateChar(s, minSecForLevel(120) + 1)).includes("level_time"));
  assert.ok(levelCapForTime(0) >= 1);
});

test("bậc PvP", () => {
  assert.equal(bracketOf(39), null);
  assert.equal(bracketOf(40).k, "so");
  assert.equal(bracketOf(79).k, "so");
  assert.equal(bracketOf(80).k, "trung");
  assert.equal(bracketOf(100).k, "cao");
  assert.equal(bracketOf(119).k, "cao");
  assert.equal(bracketOf(150).k, "thuong");
});

test("điểm tiềm năng thưởng hợp lệ (mốc cấp, thành tựu, điểm danh, cửa hàng) không bị gắn cờ", () => {
  const s = makeChar(99);
  // 6 tuần chơi 3 giờ/ngày: 30 ngày điểm danh, mốc cấp tới 99, thưởng tuần công thành + Tống Kim
  s.attrPts += 60 + 20 + 30 + 12 + 18;
  assert.ok(!codes(validateChar(s, 126 * 3600)).includes("attr_points"));
});

test("điểm tiềm năng vượt xa mọi nguồn thưởng vẫn bị gắn cờ", () => {
  const s = makeChar(50);
  s.attrPts += 5000;
  assert.ok(codes(validateChar(s, 10 * 3600)).includes("attr_points"));
});
