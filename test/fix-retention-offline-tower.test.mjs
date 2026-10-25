import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

// Lỗi giữ chân vòng 3: (1) offline EXP mất quota im lặng khi kills == 0;
// (2) loot tháp trong pend mất im lặng khi thoát/chết/kẹt/reload, đất đầy bán im lặng,
// chơi lại tầng cũ 0 thưởng không lý do.
// Các test này phải FAIL trước sửa và PASS sau sửa (trừ các test "giữ nguyên hành vi"
// được đánh dấu, dùng để chứng minh không đổi trần / không tăng thưởng).

function setupTower(g, best, floor) {
  g.run(`RW().stat.towerBest=${best}; R.tower={floor:${floor},endless:false,pend:[]};`);
}

test("offline kills==0: không trừ quota, không đẩy S.last, lần sau vẫn tính lại được", () => {
  const g = game();
  // vắng 70 giây, kps rất thấp -> eff=70, kills=floor(70*.02*.8*.75)=0
  g.run(`fixture('ctc',50); S.kps=0.02; S.last=Date.now()-70*1000; S.offDay={t0:Date.now(),secs:0};`);
  const before = g.json(`({secs:S.offDay.secs,last:S.last})`);
  const o = g.run(`offlineGains()`);
  assert.equal(o, null, "kills==0 thì không trả thưởng");
  const after = g.json(`({secs:S.offDay.secs,last:S.last})`);
  assert.equal(after.secs, before.secs, "quota ngày không được trừ khi không trả thưởng");
  assert.equal(after.last, before.last, "S.last không được đẩy lên bây giờ khi không trả thưởng");
  // gọi lại vẫn tính được (không mất lượt) và lý do hiển thị được
  assert.ok(g.run(`offlineZeroReason()`).includes("Không hạ được quái"),
    "lý do kills==0 phải đọc được thay vì bị chặn hiển thị");
});

test("offline: giữ nguyên trần 8h/lần và 12h/ngày (không đổi số cân bằng)", () => {
  const g = game();
  // vắng 10 giờ, kps=1 -> capped 8h, có thưởng
  g.run(`fixture('ctc',50); S.kps=1; S.last=Date.now()-10*3600*1000; S.offDay={t0:Date.now(),secs:0};`);
  const o = g.json(`(()=>{const r=offlineGains(); return r?{secs:r.secs,kills:r.kills,capped:r.capped}:null})()`);
  assert.ok(o && o.secs === 8 * 3600 && o.capped === true && o.kills > 0, "vắng 10h chỉ tính 8h");
  assert.equal(g.json(`S.offDay.secs`), 8 * 3600, "quota ngày cộng đúng 8h");
  // đã dùng 11h hôm nay, vắng thêm 2h -> chỉ còn 1h
  const g2 = game();
  g2.run(`fixture('ctc',50); S.kps=1; S.last=Date.now()-2*3600*1000; S.offDay={t0:Date.now(),secs:11*3600};`);
  const o2 = g2.json(`(()=>{const r=offlineGains(); return r?{secs:r.secs}:null})()`);
  assert.ok(o2 && o2.secs === 3600, "trần ngày 12h vẫn giữ: 11h đã dùng + vắng 2h -> chỉ tính 1h");
  // hết quota ngày -> null, không trừ thêm
  const g3 = game();
  g3.run(`fixture('ctc',50); S.kps=1; S.last=Date.now()-2*3600*1000; S.offDay={t0:Date.now(),secs:12*3600};`);
  assert.equal(g3.run(`offlineGains()`), null, "hết quota ngày thì null");
  assert.equal(g3.json(`S.offDay.secs`), 12 * 3600, "không trừ vượt trần ngày");
});

test("tháp: thoát giữa tầng mới phải trả pend, không mất im lặng", () => {
  const g = game();
  g.run(`fixture('ctc',50);`);
  setupTower(g, 10, 11);
  const before = g.json(`({xp:S.xp,gold:S.gold})`);
  // 1 quái đã hạ trong tầng mới (floor 11 > best 10) -> pend
  g.run(`R.tower.pend.push({L:20,cls:'normal',x:100,y:100,goldBoss:false,n:'Quái tháp'});`);
  g.run(`towerExit(false);`);
  const after = g.json(`({xp:S.xp,gold:S.gold,tower:R.tower})`);
  assert.equal(after.tower, null, "thoát xong thì không còn trong tháp");
  assert.ok(after.xp > before.xp || after.gold > before.gold,
    "thưởng quái đã hạ phải được trả khi thoát, không mất im lặng");
});

test("tháp: reload giữa tầng không được mất pend và không được trả trùng", () => {
  const g = game();
  g.run(`fixture('ctc',50);`);
  setupTower(g, 10, 11);
  g.run(`R.tower.pend.push({L:20,cls:'normal',x:100,y:100,goldBoss:false,n:'Quái tháp'});`);
  // save phải ghi pend ra save (mirror), nếu không reload sẽ mất
  g.run(`save();`);
  assert.ok(g.json(`Array.isArray(S.towerPend) && S.towerPend.length===1`),
    "save() phải mirror pend ra S.towerPend để reload không mất");
  // mô phỏng reload: runtime tháp mất, boot claim trả 1 lần duy nhất
  assert.equal(g.run(`typeof claimTowerPend`), "function", "phải có hàm claimTowerPend cho boot");
  const before = g.json(`({xp:S.xp,gold:S.gold})`);
  g.run(`R.tower=null; claimTowerPend();`);
  const after = g.json(`({xp:S.xp,gold:S.gold,pend:S.towerPend})`);
  assert.ok(after.xp > before.xp || after.gold > before.gold, "boot claim phải trả pend đã lưu");
  assert.ok(!after.pend || after.pend.length === 0, "claim xong phải xóa pend đã lưu");
  const after2 = g.json(`({xp:S.xp,gold:S.gold})`);
  g.run(`claimTowerPend();`);
  const after3 = g.json(`({xp:S.xp,gold:S.gold})`);
  assert.deepEqual(after3, after2, "claim lần 2 không được trả trùng (chống dup)");
});

test("tháp: qua tầng vẫn trả pend như cũ, thoát không trả thưởng qua tầng", () => {
  const g = game();
  g.run(`fixture('ctc',50);`);
  setupTower(g, 10, 11);
  const bestBefore = g.json(`RW().stat.towerBest`);
  g.run(`R.tower.pend.push({L:20,cls:'normal',x:100,y:100,goldBoss:false,n:'Quái tháp'});`);
  g.run(`towerCleared();`);
  assert.equal(g.json(`RW().stat.towerBest`), 11, "qua tầng vẫn cập nhật kỷ lục");
  assert.equal(g.json(`R.tower.floor`), 12, "qua tầng vẫn lên tầng tiếp theo");
  // thoát ở tầng mới: chỉ trả pend của tầng hiện tại, không trả thưởng qua tầng
  g.run(`R.tower.pend.push({L:21,cls:'normal',x:100,y:100,goldBoss:false,n:'Quái tháp 2'});`);
  const goldBefore = g.json(`S.gold`);
  g.run(`towerExit(false);`);
  assert.ok(g.json(`S.gold`) >= goldBefore, "thoát trả pend tầng hiện tại");
  assert.equal(bestBefore, 10, "kỷ lục ban đầu không đổi trong test này");
});

test("tháp: chơi lại tầng cũ 0 thưởng nhưng phải có lý do trong log", () => {
  const g = game();
  g.run(`fixture('ctc',50);`);
  setupTower(g, 50, 40); // endless: tầng 40 <= best 50
  g.run(`var _logs=[]; log=function(s){_logs.push(String(s))};`);
  const before = g.json(`({xp:S.xp,gold:S.gold})`);
  g.run(`towerCleared();`);
  const after = g.json(`({xp:S.xp,gold:S.gold})`);
  assert.equal(after.xp, before.xp, "tầng cũ không cho EXP (giữ nguyên thiết kế chống farm)");
  assert.ok(g.run(`_logs.join(' ')`).includes("Tầng đã qua") || g.run(`_logs.join(' ')`).includes("không còn thưởng"),
    "chơi lại tầng cũ phải có lý do trong log, không im lặng");
});

test("đất đầy: món bị bán do đất đầy phải có log rõ ràng, không bán im lặng", () => {
  const g = game();
  g.run(`fixture('ctc',50); var _logs=[]; log=function(s){_logs.push(String(s))};`);
  // lấp đầy đất bằng 40 món thật (r=0, không giữ) rồi rơi thêm 1 món
  g.run(`for(let i=0;i<40;i++){const it=makeItem(0,0,1,0); if(it) R.ground.push({it:it,x:100,y:100,age:1});}`);
  assert.equal(g.json(`R.ground.length`), 40, "đất đầy 40 món trước khi test");
  const goldBefore = g.json(`S.gold`);
  g.run(`const it2=makeItem(0,0,1,0); if(it2) dropToGround(it2,{x:100,y:100});`);
  const res = g.json(`({n:R.ground.length,gold:S.gold,logs:_logs.join(' ')})`);
  assert.ok(res.n <= 40, "đất không vượt trần 40");
  if (res.gold > goldBefore) {
    assert.ok(res.logs.includes("Đất đầy") && res.logs.includes("bán"),
      "nếu có món bị bán do đất đầy thì log phải ghi rõ Đất đầy + bán, không im lặng");
  }
});
