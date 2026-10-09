import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("võ học tạp: học 1 skill ngoại phái, max cấp 5, không bonus hệ", () => {
  const g = game();
  g.run(`fixture('ctc',100);S.gold=5e6;S.skPts=50;`);
  // tìm 1 skill tấn công ngoại phái
  const sid = g.json(`(()=>{
    for(const f of FACTIONS){
      if(f.key===S.fac)continue;
      for(const id of f.skills){const s=SK[id];if(s&&isAttack(s)&&s.req<=100)return id;}
    }
    return 0;
  })()`);
  assert.ok(sid > 0, "tìm được skill ngoại phái");
  // học
  const r = g.json(`crossSkillLearn(${sid})`);
  assert.ok(r.ok, "học thành công: " + r.msg);
  assert.equal(g.json(`S.sk[${sid}]`), 1);
  // không học skill thứ hai
  const r2 = g.json(`crossSkillLearn(${sid})`);
  assert.equal(r2.ok, false, "chỉ học 1 skill");
  // nâng cấp lên 5
  for (let i = 0; i < 4; i++) g.run(`S.gold=5e6;S.skPts=50;crossSkillUpgrade();`);
  assert.equal(g.json(`crossSkill().level`), 5, "max cấp 5");
  const r3 = g.json(`crossSkillUpgrade()`);
  assert.equal(r3.ok, false, "không vượt cấp 5");
  // kiểm tra không nhận seriesLv: so với skill bổn phái cùng cấp
  const lv = g.json(`crossSkillLv(${sid})`);
  assert.ok(lv >= 5 && lv <= 7, `level thực tế ${lv} (không series)`);
});

test("võ học tạp: cần cấp 100 và đủ vàng", () => {
  const g = game();
  g.run(`fixture('ctc',60);S.gold=5e6;`);
  const sid = g.json(`(()=>{for(const f of FACTIONS){if(f.key===S.fac)continue;for(const id of f.skills){const s=SK[id];if(s&&isAttack(s))return id;}}return 0;})()`);
  const r = g.json(`crossSkillLearn(${sid})`);
  assert.equal(r.ok, false, "cần cấp 100");
});
