import test from "node:test";
import assert from "node:assert/strict";
import { cleanFeedback, FB_MAX } from "../src/feedback.js";

test("cleanFeedback chuẩn hoá nội dung, loại mục lạ", () => {
  const r = cleanFeedback({ text: "  Nút tháp\r\nbị lỗi \u0007 ", cat: "bug", contact: " zalo 0123 ", ctx: { mode: "g2", lvl: 50, x: "bỏ", ua: "a".repeat(500) } });
  assert.equal(r.text, "Nút tháp\nbị lỗi");
  assert.equal(r.cat, "bug");
  assert.equal(r.contact, "zalo 0123");
  assert.deepEqual(Object.keys(r.ctx).sort(), ["lvl", "mode", "ua"]);
  assert.equal(r.ctx.ua.length, 200);
});

test("cleanFeedback từ chối nội dung quá ngắn hoặc quá dài, cat lạ thành other", () => {
  assert.throws(() => cleanFeedback({ text: "abc" }), { code: "too_short" });
  assert.throws(() => cleanFeedback({ text: "x".repeat(FB_MAX + 1) }), { code: "too_long" });
  assert.equal(cleanFeedback({ text: "góp ý dài đủ", cat: "__proto__" }).cat, "other");
});
