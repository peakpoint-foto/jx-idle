import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Bước 1 jx-idle, đường migration duy nhất đã chốt: bump SAVE_V 2 -> 3
// (xem BRAINSTORM-v2.3 + STEP1-REPORT). Không thêm extension wave nào cho
// bước này vì bước 1 chưa thêm field save nào; waves vẫn chỉ phục vụ dữ
// liệu mở rộng (extensions.v vẫn 1). Hai đường không được cùng tồn tại cho
// cùng một lần đổi version.

test("save v2 cũ migrate lên v3: giữ UID/tên/đồ khóa/số tiền, backup _pre_v3", () => {
  const g = game();
  g.run(`fixture('ctc');S.v=2;S.name='Kiếm Khách';S.gold=12345;S.eq={weapon:{r:2,mo:'ctc',uid:99,locked:true,base:[],mag:[]}};var oldRaw=pack(S);localStorage.setItem(saveKey(),oldRaw);load()`);
  assert.equal(g.run("S.v"), 3, "save v2 phải lên v3 sau migrate");
  assert.equal(g.run("S.name"), "Kiếm Khách", "tên nhân vật không được mất");
  assert.equal(g.run("S.gold"), 12345, "số tiền không được mất");
  assert.equal(g.run("S.eq.weapon.uid"), 99, "UID đồ không được mất");
  assert.equal(g.run("S.eq.weapon.locked"), true, "trạng thái khóa của đồ không được mất");
  assert.equal(g.run("localStorage.getItem(saveKey()+'_pre_v3')===oldRaw"), true,
    "bản v2 gốc phải được backup một lần ở _pre_v3 trước khi migrate");
});

test("save mới tạo ra đã là v3 và migrate lại idempotent", () => {
  const g = game();
  g.run(`fixture('phlt');`);
  assert.equal(g.run("S.v"), 3, "save mới phải mang v3");
  g.run("var m1=migrate(S);var m2=migrate(m1)");
  assert.deepEqual(g.json("m1"), g.json("m2"), "migrate lần 2 không được đổi gì");
  assert.equal(g.run("m2.v"), 3);
});

test("save v4 (tương lai) vẫn bị chặn trước khi sanitize hay ghi đè", () => {
  const g = game();
  g.run(`fixture();S.v=4;var original=pack(S);localStorage.setItem(saveKey(),original);load()`);
  assert.equal(g.run("SAVE_LOCK"), true, "save tương lai phải khóa ghi");
  assert.ok(g.run("window.__saveBlocked.includes('mới hơn')"), "phải báo save mới hơn");
  assert.equal(g.run("localStorage.getItem(saveKey())===original"), true,
    "save tương lai không được ghi đè");
});
