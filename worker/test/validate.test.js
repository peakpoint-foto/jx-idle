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

test("dòng cộng cấp kỹ năng hệ cũ chờ xác minh thay vì gắn cờ gian lận", () => {
  const s = makeChar(60);
  const skill = G.J.affix.find((a) => G.attrName(a.a) === "waterskill_v");
  assert.ok(skill);
  s.eq.weapon.mag = [{ a: skill.a, p: [38, -1, 0], pre: 1 }];
  const r = validateChar(s, 1e7);
  assert.deepEqual(codes(r), []);
  assert.equal(r.pending[0][0], "item_policy_pending");
  // validateChar reports the natural bracket; applyValidation is the boundary
  // that converts any pending result into an unranked character.
  assert.equal(r.bracket.k, "so");
});

test("validator soi cả hành trang/đất và dữ liệu số hỏng", () => {
  const s = makeChar(60);
  const old = G.makeItem(0, 0, 2, 3);
  const skill = G.J.affix.find((a) => G.attrName(a.a) === "waterskill_v");
  old.mag = [{ a: skill.a, p: [38, -1, 0], pre: 1 }];
  s.inv = [old];
  const pending = validateChar(s, 1e7);
  assert.deepEqual(codes(pending), []);
  assert.ok(pending.pending.some(([code]) => code === "item_policy_pending"));

  const malformed = makeChar(60);
  malformed.inv[0] = G.makeItem(0, 0, 2, 3);
  malformed.inv[0].base[0][1] = Infinity;
  const invalid = validateChar(malformed, 1e7);
  assert.ok(codes(invalid).includes("item_base"));
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

test("chuyển sinh hợp lệ thiếu lịch sử server thì chờ xác minh, không bị gắn cờ", () => {
  const s = makeChar(1);
  s.rw = { stat: { reborn: 1 } };
  s.skPts = 180;
  const r = validateChar(s, 1e7);
  assert.deepEqual(r.flags, []);
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0][0], "rebirth_skill_history");
  assert.equal(r.bracket, null);
});

test("nhân vật không chuyển sinh vẫn bị gắn cờ khi vượt ngân sách kỹ năng", () => {
  const s = makeChar(1);
  s.skPts = 180;
  const r = validateChar(s, 1e7);
  assert.ok(r.flags.some(([code]) => code === "skill_points"));
  assert.deepEqual(r.pending, []);
});

test("chỉ số máy chủ dùng cùng công thức lực chiến của game", () => {
  const s = makeChar(60);
  const r = validateChar(s, 1e7);
  assert.equal(r.power, Math.round(G.power(r.P)));
});

test("đồ Cực phẩm (6 dòng, mỗi dòng tối đa) từ trùm Hoàng Kim cuối ván không bị gắn cờ", () => {
  for (let i = 0; i < 15; i++) {
    const s = makeChar(60);
    const it = G.makeItem(2, 0, 7, 6);
    for (const m of it.mag) {
      const row = G.J.affix.find((x) => x.a === m.a && x.n === m.n);
      if (row) m.p = row.p.map(([mn, mx]) => (mn === -1 && mx === -1 ? -1 : Math.abs(mx) >= Math.abs(mn) ? mx : mn));
    }
    it.cpx = 1;
    s.eq.armor = it;
    const r = validateChar(s, 1e7);
    assert.deepEqual(codes(r), [], JSON.stringify(r.flags));
  }
});
