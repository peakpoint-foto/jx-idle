import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

function rebornReady() {
  const g = game();
  g.run(`fixture('ctc',180);S.lvl=180;`);
  return g;
}

test("chuyển sinh 3 đường: bonus đúng, cộng dồn", () => {
  const g = rebornReady();
  // đường Võ Đạo: +5 skPts
  g.run(`var _c=confirm;confirm=()=>true;doReborn("voda");confirm=_c;`);
  assert.equal(g.json("S.rw.stat.reborn"), 1);
  assert.deepEqual(g.json("S.rw.rebirthPaths"), ["voda"]);
  const sk1 = g.json("S.skPts");
  assert.ok(sk1 >= 5, "có +5 skPts Võ Đạo");
  // lên 180 lại, chọn Phong Hành
  g.run(`S.lvl=180;var _c=confirm;confirm=()=>true;doReborn("phonghanh");confirm=_c;`);
  assert.deepEqual(g.json("S.rw.rebirthPaths"), ["voda", "phonghanh"]);
  const bo = g.json("rebornBonus()");
  assert.ok(Math.abs(bo.xp - (0.4 + 0.15)) < 1e-9, `xp = 2 lần gốc + phong hành, được ${bo.xp}`);
});

test("chuyển sinh Thần Binh: đồ đang mặc +1 cường hóa", () => {
  const g = rebornReady();
  g.run(`S.eq.weapon={uid:99,d:0,k:0,lvl:10,s:0,base:[[28,10,20]],mag:[],req:[],price:100,enh:3};`);
  g.run(`var _c=confirm;confirm=()=>true;doReborn("thanbinh");confirm=_c;`);
  assert.equal(g.json("S.eq.weapon.enh"), 4, "+1 cường hóa");
  assert.deepEqual(g.json("S.rw.rebirthPaths"), ["thanbinh"]);
});

test("chuyển sinh: không chọn đường thì từ chối", () => {
  const g = rebornReady();
  g.run(`var _c=confirm;confirm=()=>true;doReborn("khong_ton_tai");confirm=_c;`);
  assert.equal(g.json("S.rw.stat.reborn"), 0, "không chuyển sinh khi đường sai");
});
