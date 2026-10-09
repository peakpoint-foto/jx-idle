import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

const DAY = 864e5, T0 = Date.UTC(2026, 9, 5); // thứ Hai, mốc ngày UTC

test("fixture v1 qua migration không mất dữ liệu, waves được áp dụng", () => {
  const g = game();
  g.run("fixture('ctc',45);S.gold=123456;S.inv.push(makeItem(2,0,10,2));recalc()");
  const snapJS = "o=>({fac:o.fac,lvl:o.lvl,gold:o.gold,inv:o.inv.length,eq:Object.keys(o.eq).length,sk:Object.keys(o.sk).length,stage:o.stage})";
  const before = g.json(`(()=>{const snap=${snapJS};const o=JSON.parse(JSON.stringify(S));o.v=1;delete o.extensions;return snap(o);})()`);
  const after = g.json(`(()=>{const snap=${snapJS};const o=JSON.parse(JSON.stringify(S));o.v=1;delete o.extensions;const m=migrate(o);return Object.assign(snap(m),{v:m.v,wv:m.extensions.wv,codex:m.extensions.codex.unlocked,goals7:!!m.extensions.goals7});})()`);
  assert.deepEqual((({v, wv, codex, goals7, ...rest}) => rest)(after), before, "dữ liệu gameplay giữ nguyên");
  assert.equal(after.v, 2);
  assert.equal(after.wv, 3, "đã chạy hết waves");
  assert.deepEqual(after.codex, [1]);
  assert.equal(after.goals7, true);
});

test("migration idempotent: chạy lại không đổi gì", () => {
  const g = game();
  const r = g.run(`(()=>{
    const o=Object.assign(newSave(),{v:1});delete o.extensions;
    const once=migrate(o),twice=migrate(JSON.parse(JSON.stringify(once)));
    return {wv1:once.extensions.wv,wv2:twice.extensions.wv,same:JSON.stringify(once)===JSON.stringify(twice)};
  })()`);
  assert.equal(r.wv1, 3); assert.equal(r.wv2, 3); assert.equal(r.same, true);
});

test("wave đăng ký lộn xộn vẫn chạy theo thứ tự version", () => {
  const g = game();
  const r = g.run(`(()=>{
    const n=SAVE_WAVES.length;
    try{
      registerSaveWave(902,'test_b',s=>{s.extensions.order=(s.extensions.order||'')+'b';});
      registerSaveWave(901,'test_a',s=>{s.extensions.order=(s.extensions.order||'')+'a';});
      const ext=runSaveWaves({extensions:{v:1}}).extensions;
      const again=runSaveWaves({extensions:ext}).extensions;
      return ext.order+'/'+ext.wv+'/'+again.order;
    }finally{SAVE_WAVES.length=n;}
  })()`);
  assert.equal(r, "ab/902/ab", "901 trước 902, chạy lại không lặp");
  assert.throws(() => g.run("registerSaveWave(1,'test_x',()=>{})"), /Trùng wave version/);
  assert.throws(() => g.run("registerSaveWave(903,'codex_waves',()=>{})"), /Trùng wave id/);
});

test("mục tiêu 7 ngày chạy đúng trên save mới", () => {
  const g = game();
  g.run(`fixture('ctc',1);setFeatureFlags({onboarding_goals:true});S.extensions.goals7.start=${Math.floor(T0 / DAY)}`);
  let list = g.json(`goals7List(${T0})`);
  assert.equal(list.length, 7);
  assert.equal(list[0].available, true, "ngày 1 mở ngay");
  assert.equal(list[1].available, false, "ngày 2 chưa mở");
  assert.equal(list[0].done, false);
  g.run("S.lvl=10;recalc()");
  list = g.json(`goals7List(${T0})`);
  assert.equal(list.find(x => x.id === "lv10").done, true, "đạt cấp 10 -> xong ngày 1");
  assert.ok(g.json(`S.extensions.goals7.done.lv10`) !== undefined, "ghi nhận hoàn thành");
  list = g.json(`goals7List(${T0 + DAY})`);
  assert.equal(list.find(x => x.id === "gear4").available, true, "sang ngày 2 mở tiếp");
  assert.equal(list.find(x => x.id === "lv30").available, false, "ngày 7 vẫn khóa");
  const html = g.run(`goals7HTML(${T0})`);
  assert.ok(html.includes("Ngày 1") && html.includes("1/7"), "hiện tiến độ");
  g.run("setFeatureFlags({})");
  assert.equal(g.run(`goals7HTML(${T0})`), "", "flag tắt thì không hiện");
});

test("codex theo đợt: đợt 1 luôn mở, đợt 2 theo cấp", () => {
  const g = game();
  g.run("fixture('ctc',20);setFeatureFlags({codex_waves:true})");
  assert.equal(g.run("codexWaveUnlocked(1)"), true);
  assert.equal(g.run("codexWaveUnlocked(2)"), false, "cấp 20 chưa mở đợt 2");
  g.run("S.lvl=30");
  assert.equal(g.run("codexWaveUnlocked(2)"), true);
  const html = g.run("codexWavesHTML()");
  assert.ok(html.includes("Đợt 1") && html.includes("Đợt 2") && html.includes("Mở bách khoa"));
  g.run("setFeatureFlags({})");
  assert.equal(g.run("codexWavesHTML()"), "", "flag tắt thì không hiện");
});
