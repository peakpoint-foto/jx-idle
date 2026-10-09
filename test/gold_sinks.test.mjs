import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

function ready() {
  const g = game();
  g.run(`fixture('ctc',60);setFeatureFlags({gold_sinks:true,build_profiles:true});S.gold=100000000;
    S.inv.push(makeItem(2,0,5,4));S.inv[S.inv.length-1].req=[];S.inv[S.inv.length-1].rerolls=0;recalc();`);
  return g;
}

test("tẩy luyện dùng seed cam kết: cùng input -> cùng output (chống save-scum)", () => {
  const g = ready();
  const a = g.json(`(()=>{const it=S.inv[S.inv.length-1];const before=JSON.stringify(it.mag);rerollCommitted(it);return {before,after:JSON.stringify(it.mag),n:it.rerolls};})()`);
  assert.notEqual(a.before, a.after, "tẩy làm đổi dòng");
  assert.equal(a.n, 1);
  // giả lập save-scum: khôi phục save cũ (rerolls=0) rồi tẩy lại -> cùng kết quả
  const b = g.json(`(()=>{const it=S.inv[S.inv.length-1];it.mag=JSON.parse('${a.before}');it.rerolls=0;rerollCommitted(it);return JSON.stringify(it.mag);})()`);
  assert.equal(b, a.after, "save-scum cho ra đúng kết quả cũ");
  // lần tẩy tiếp theo (rerolls=1) cho kết quả khác
  const c = g.json(`(()=>{const it=S.inv[S.inv.length-1];it.mag=JSON.parse('${a.before}');it.rerolls=0;rerollCommitted(it);rerollCommitted(it);return JSON.stringify(it.mag);})()`);
  assert.notEqual(c, a.after, "mỗi lần tẩy là một seed mới");
});

test("tẩy 1 dòng chỉ đổi đúng dòng đó, trừ vàng và ghi sổ", () => {
  const g = ready();
  const r = g.json(`(()=>{const it=S.inv[S.inv.length-1];const g0=S.gold;const lines=it.mag.map(m=>m.a+":"+m.p[0]);
    rerollLine(it,1);return {lines,after:it.mag.map(m=>m.a+":"+m.p[0]),spent:g0-S.gold,n:it.rerolls,ledger:S.rw.goldSinks};})()`);
  assert.equal(r.after.length, r.lines.length, "số dòng giữ nguyên");
  assert.equal(r.after[0], r.lines[0], "dòng 1 giữ nguyên");
  if (r.after.length > 2) assert.equal(r.after[2], r.lines[2], "dòng 3 giữ nguyên");
  assert.ok(r.spent > 0, "có trừ vàng");
  assert.equal(r.ledger.reroll_affix, r.spent, "ghi sổ cái");
  assert.equal(r.n, 1);
});

test("mở rộng kho theo nấc giá tăng dần", () => {
  const g = ready();
  const cap0 = g.run("stashCap()");
  assert.equal(cap0, g.run("stashMax()"), "chưa mua = đúng giới hạn gốc");
  const c0 = g.run("stashBuyCost(0)"), c1 = g.run("stashBuyCost(1)");
  assert.ok(c1 > c0, "giá nấc sau cao hơn");
  const r = g.json("stashExpandBuy()");
  assert.equal(r.ok, true);
  assert.equal(g.run("stashBuyTier()"), 1);
  assert.equal(g.run("stashCap()"), cap0 + 10, "+10 ô mỗi nấc");
  assert.ok(g.json("S.rw.goldSinks").stash_expand > 0, "ghi sổ cái");
});

test("phí đổi loadout: thu khi flag bật, miễn khi tắt", () => {
  const g = ready();
  const fee = g.run("loadoutSwitchFee()");
  assert.ok(fee > 0, "có phí khi flag bật");
  g.run("S.lvl=60;buildSave(0)");
  const r = g.json(`(()=>{const g0=S.gold;const res=buildLoad(0);return {ok:res.ok,spent:g0-S.gold,ledger:S.rw.goldSinks.loadout_fee};})()`);
  assert.equal(r.ok, true);
  assert.equal(r.spent, fee, "trừ đúng phí");
  assert.equal(r.ledger, fee);
  g.run("setFeatureFlags({build_profiles:true})"); // tắt gold_sinks
  assert.equal(g.run("loadoutSwitchFee()"), 0, "flag tắt thì miễn phí");
});
