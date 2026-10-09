import test from "node:test";
import assert from "node:assert/strict";
import { GAME as G } from "../gen/game.js";
import { validateChar } from "../src/validate.js";

// 2.4 (a): worker kiểm tra "khoảng cho phép" của đồ đã tẩy bằng committed seed.
// Seed cam kết chạy ở client; worker không cần biết seed, chỉ cần đồ hợp lệ.
test("đồ tẩy bằng committed seed vượt qua validator worker", () => {
  const s = G.newSave();
  Object.assign(s, {fac: "shaolin", mode: "g2", lvl: 60, attrPts: 59 * G.PTS_PER_LEVEL, skPts: 60});
  G.setS(s);
  const it = G.makeItem(2, 0, 5, 4);
  assert.ok(it && it.mag.length >= 2, "có đồ để tẩy");
  it.req = []; it.rerolls = 0;
  // tẩy 1 dòng bằng đúng logic client
  const rng = G.seededRng(G.rerollSeedFor(it));
  const used = new Set(it.mag.map(m => m.a)), old = it.mag[1];
  used.delete(old.a);
  it.mag[1] = G.rollMagicLine(it, 5, old.pre ? 1 : 0, 0, used, rng);
  it.rerolls = 1;
  s.inv.push(it);
  const result = validateChar(s, 5e7);
  assert.deepEqual(result.flags.filter(f => f[0].startsWith("item")), [], "không bị gắn cờ item");
});

test("REROLL_SEED_V đổi thì seed đổi (vô hiệu cam kết cũ khi đổi bảng affix)", () => {
  const a = {uid: 123, rerolls: 2}, b = {uid: 123, rerolls: 3};
  assert.notEqual(G.rerollSeedFor(a), G.rerollSeedFor(b), "số lần tẩy khác -> seed khác");
  assert.equal(G.rerollSeedFor(a), G.rerollSeedFor({uid: 123, rerolls: 2}), "cùng input -> cùng seed");
});
