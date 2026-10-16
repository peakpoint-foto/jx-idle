import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

test("wave2: tin cap nhat hien mot lan cho save cu", () => {
  const g = game();
  g.run(`fixture("ctc",60);`);
  assert.equal(g.json(`showUpdateNotes(true)`), true, "lan dau -> hien");
  assert.equal(g.json(`RW().seenUpd`), 2, "danh dau da xem");
  assert.equal(g.json(`showUpdateNotes(true)`), false, "lan hai -> khong hien lai");
});

test("wave2: chua co nhan vat thi khong hien", () => {
  const g = game();
  assert.equal(g.json(`showUpdateNotes(true)`), false, "S.fac null -> false");
});

test("wave2: noi dung ghi ro 3 co che phai + donate tam khoa", () => {
  const g = game();
  const txt = g.json(`UPDATE_NOTES.join("\\n")`);
  assert.ok(txt.includes("Đường Môn"), "co Duong Mon");
  assert.ok(txt.includes("50%"), "ghi ro don them 50%");
  assert.ok(txt.includes("Thiếu Lâm"), "co Thieu Lam");
  assert.ok(txt.includes("Võ Đang"), "co Vo Dang");
  assert.ok(txt.includes("tạm khóa"), "ghi ro donate tam khoa");
  assert.ok(!/sắp ra mắt|hứa hẹn/i.test(txt), "khong hua hen qua");
});
