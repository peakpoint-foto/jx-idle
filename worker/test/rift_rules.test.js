import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';
import {game} from '../../test/helpers/game.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
test('rift modifier stats and damage parts have Worker/browser parity for ten factions and bounded combinations',()=>{
  // Parity cần cùng một "hôm nay" ở cả hai phía: harness đóng băng Date ở
  // 2026-10-07 (test/helpers/game.mjs), còn worker dùng Date thật. Ngày nào
  // đột biến ngày của hai mốc lệch nhau ở trường lucky (vd ngày thật 03/11
  // là Gió Lộc +25, ngày đóng băng 07/10 là calm +0) thì test lệch dù game
  // không sai. Đóng băng Date phía worker đúng bằng mốc của harness trong
  // test này, xong trả lại — chỉ sửa test, không đụng code game/worker.
  const RealDate=globalThis.Date, frozenNow=Date.UTC(2026, 9, 7, 12);
  class FrozenDate extends RealDate {
    constructor(...args){ super(...(args.length?args:[frozenNow])); }
    static now(){ return frozenNow; }
  }
  globalThis.Date=FrozenDate;
  try {
  const g=game();for(const fac of Object.values(GAME.FAC)){
    g.run(`fixture('g2',60);S.fac='${fac.key}';recalc()`);GAME.setS(g.json('S'));const p=GAME.calc();
    for(const mods of [[],['venom','venom','tempo','control','reserve'],['sustain','sustain','echo','echo','reserve']]){
      const before=JSON.stringify(p),server=GAME.riftStats(p,mods);assert.equal(JSON.stringify(p),before);
      assert.deepEqual(plain(server),g.json(`riftStats(calc(),${JSON.stringify(mods)})`),fac.key);
      for(const [el,amount] of Object.entries(server.main.parts))assert.equal(GAME.applyPart(amount,el,server.main.series,0,{[el]:30},75,server.main.series5),g.run(`applyPart(${amount},'${el}',${server.main.series},0,{${el}:30},75,${server.main.series5})`));
    }
  }
  assert.throws(()=>GAME.riftStats(GAME.calc(),['unknown']));assert.equal(GAME.riftModifiersValid(['echo','echo','echo']),false);
  } finally { globalThis.Date=RealDate; }
});
