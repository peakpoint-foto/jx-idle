import test from "node:test";
import assert from "node:assert/strict";
import { creditTime, parseSave, cleanName, OFFLINE_MAX, OFFLINE_DAY_MAX } from "../src/account.js";

const T0 = Date.UTC(2026, 9, 6, 12);
const acc = (o = {}) => ({ play_sec: 0, last_hb: T0, off_t0: null, off_sec: 0, ...o });

test("heartbeat đều đặn cộng đúng thời gian thực", () => {
  let a = acc();
  for (let i = 1; i <= 10; i++) a = { ...a, ...creditTime(a, T0 + i * 60e3) };
  assert.equal(a.play_sec, 600);
});

test("hai tab cùng gửi không cộng gấp đôi", () => {
  let a = acc();
  for (let i = 1; i <= 20; i++) a = { ...a, ...creditTime(a, T0 + i * 30e3) };
  assert.equal(a.play_sec, 600);
});

test("offline được tính theo giới hạn của game", () => {
  const a = creditTime(acc(), T0 + 20 * 3600e3);
  assert.equal(a.play_sec, OFFLINE_MAX);
  // Lần offline thứ hai trong cùng 24 giờ chỉ còn 12 - 8 = 4 giờ.
  const b = creditTime({ ...acc(), ...a, last_hb: T0 + 20 * 3600e3 + 1 }, T0 + 26 * 3600e3);
  assert.equal(b.play_sec - a.play_sec, OFFLINE_DAY_MAX - OFFLINE_MAX);
});

test("cửa sổ offline 24 giờ được làm mới", () => {
  const a = { ...acc(), ...creditTime(acc(), T0 + 9 * 3600e3) };
  const b = creditTime({ ...a, last_hb: T0 + 30 * 3600e3 }, T0 + 40 * 3600e3);
  assert.equal(b.play_sec - a.play_sec, OFFLINE_MAX);
});

test("parseSave nhận chuỗi pack và từ chối chế độ khác ctc", () => {
  const st = { mode: "ctc", fac: "gaibang", lvl: 12, xp: 5 };
  assert.equal(parseSave(JSON.stringify({ d: JSON.stringify(st), h: "x" })).lvl, 12);
  assert.throws(() => parseSave({ ...st, mode: "g2" }), { code: "not_ctc" });
  assert.throws(() => parseSave({ ...st, lvl: "abc" }), { code: "bad_level" });
  assert.throws(() => parseSave("{not json"), { code: "bad_save" });
});

test("cleanName giữ tiếng Việt, chặn ký tự lạ", () => {
  assert.equal(cleanName("  Kiều   Phong "), "Kiều Phong");
  assert.throws(() => cleanName("<script>"), { code: "bad_name" });
  assert.throws(() => cleanName(""), { code: "bad_name" });
  assert.throws(() => cleanName("x".repeat(17)), { code: "bad_name" });
});
