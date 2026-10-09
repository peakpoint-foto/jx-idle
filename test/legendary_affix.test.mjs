import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("legendary affix: pity đảm bảo ra sau 500 món, chỉ 1 dòng/món", () => {
  const g = game();
  g.run(`fixture('ctc',60);setFeatureFlags({legendary_affix:true});S.rw.legPity=499;`);
  // món vàng 4 dòng, pity=499 -> món tiếp theo chắc chắn có legendary
  const it = g.json(`(()=>{const it=makeItem(2,0,5,4);return it?{mag:it.mag.map(m=>({leg:m.leg||null})),legAffix:it.legAffix||null,pity:S.rw.legPity}:null})()`);
  assert.ok(it, "tạo được đồ");
  assert.equal(it.pity, 0, "pity reset sau khi ra legendary");
  assert.ok(it.legAffix, "có legendary affix");
  assert.equal(it.mag.filter(m => m.leg).length, 1, "chỉ 1 dòng legendary");
  assert.equal(it.mag.length, 4, "không tăng số dòng");
});

test("legendary affix: effect áp vào stats", () => {
  const g = game();
  g.run(`fixture('ctc',60);setFeatureFlags({legendary_affix:true});`);
  // gắn đồ có legendary dr
  g.run(`(()=>{const it=makeItem(2,0,5,4);it.req=[];it.mag[0]={a:900,p:[1,-1,0],n:"La Hán Kim Thân",pre:1,leg:"lahan_kimthan"};S.eq.armor=it;recalc();})()`);
  assert.equal(g.json("R.P.legDR"), 12, "legDR = 12");
  // lifePct
  g.run(`(()=>{const it=makeItem(2,0,5,4);it.req=[];it.mag[0]={a:901,p:[1,-1,0],n:"Phượng Hoàng",pre:1,leg:"phuonghoang"};S.eq.helm=it;recalc();})()`);
  assert.equal(g.json("R.P.legLifePct"), 25, "legLifePct = 25");
});

test("legendary affix: flag tắt thì không ra", () => {
  const g = game();
  g.run(`fixture('ctc',60);S.rw.legPity=9999;`); // pity vượt ngưỡng nhưng flag tắt
  let found = false;
  for (let i = 0; i < 20; i++) {
    const it = g.json(`(()=>{const it=makeItem(2,0,5,4);return it&&it.legAffix?1:0})()`);
    if (it) { found = true; break; }
  }
  assert.equal(found, false, "flag tắt thì không ra legendary");
});
