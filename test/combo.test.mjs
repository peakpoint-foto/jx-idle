import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("combo: dùng skill bổ trợ trong 2s được +25% damage", () => {
  const g = game();
  g.run(`fixture('ctc',60);`);
  // tìm một cặp skill có link bổ trợ active
  const pair = g.json(`(()=>{
    for(const id in S.sk){
      if(!S.sk[id])continue;
      const links=skillSupportLinks(+id,1,S).filter(l=>l.active);
      if(links.length)return {from:+id,to:links[0].target};
    }
    return null;
  })()`);
  if (!pair) {
    console.log("  (bỏ qua: không có cặp skill bổ trợ active)");
    return;
  }
  // mở combo bằng skill from
  g.run(`R.tFight=10;comboOnSkill(${pair.from});`);
  const active = g.json(`comboActive()?comboActive().targets:[]`);
  assert.ok(active.includes(pair.to), "cửa sổ combo mở cho skill đích");
  // dùng skill to trong cửa sổ -> có bonus
  const r = g.json(`R.tFight=11;comboOnSkill(${pair.to}).bonus`);
  assert.equal(r, 0.25, "combo bonus +25%");
  // quá 2s -> hết
  const r2 = g.json(`R.tFight=20;comboOnSkill(${pair.to}).bonus`);
  assert.equal(r2, 0, "quá 2s không còn bonus");
});

test("combo: skill không liên quan không kích hoạt", () => {
  const g = game();
  g.run(`fixture('ctc',60);R.tFight=10;comboOnSkill(99999);`);
  const c = g.json(`comboActive()`);
  assert.equal(c, null, "skill lạ không mở cửa sổ");
});
