import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("season themes: JSON hợp lệ, xoay theo mùa 8 tuần", () => {
  const g = game();
  const d = g.json("JX_CONTENT.seasonThemes");
  assert.equal(d.version, "season-themes-v1");
  assert.equal(d.seasonWeeks, 8);
  assert.ok(d.themes.length >= 2);
  // cùng tuần -> cùng theme; 8 tuần sau -> theme khác (nếu có nhiều theme)
  const t0 = g.json("seasonTheme(100).id"), t1 = g.json("seasonTheme(108).id");
  assert.equal(g.json("seasonTheme(100).id"), t0, "deterministic");
  if (d.themes.length > 1) assert.notEqual(t0, t1, "xoay theme mỗi mùa");
  // modifier trong khoảng cho phép
  for (const t of d.themes)
    for (const k of ["exp", "gold", "drop"])
      assert.ok(t.modifiers[k] >= 1 && t.modifiers[k] <= 1.25, `${t.id}.${k} hợp lệ`);
});

test("season themes: modifier áp vào EXP/vàng", () => {
  const g = game();
  // tìm tuần có theme exp > 1
  const w = g.json(`(()=>{for(let w=0;w<64;w++)if(seasonThemeMul("exp",w)>1)return w;return -1})()`);
  assert.ok(w >= 0, "có tuần theme +exp");
  const mul = g.json(`seasonThemeMul("exp",${w})`);
  const w0 = g.json(`(()=>{for(let w=0;w<64;w++)if(seasonThemeMul("exp",w)===1)return w;return -1})()`);
  g.run(`fixture('ctc',50);`);
  const probe = (wk) => g.json(`(()=>{S.xp=0;var _now=Date.now;Date.now=()=>(${wk}*7*864e5);gainXp(1000);Date.now=_now;return S.xp})()`);
  const withTheme = probe(w), without = probe(w0);
  assert.ok(Math.abs(withTheme / without - mul) < 0.01, `tỷ số EXP = ${mul}x (được ${withTheme}/${without})`);
});

