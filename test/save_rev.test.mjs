import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// W1-4: save_id + rev đơn điệu — chống rollback-dupe, bind cid.

test("W1-4: rev tăng đơn điệu qua 100 chu kỳ save/load, save_id ổn định", () => {
  const g = game();
  g.run("fixture('ctc');save()");
  const id0 = g.run("S.save_id");
  assert.ok(typeof id0 === "string" && id0.length > 0, "save_id được cấp");
  let prev = g.run("S.rev");
  assert.ok(prev >= 1, "rev >= 1 sau lần save đầu");
  for (let i = 0; i < 100; i++) {
    g.run("save();load()");
    const r = g.run("S.rev");
    assert.ok(r > prev, `rev đơn điệu ở vòng ${i}: ${r} > ${prev}`);
    prev = r;
    assert.equal(g.run("S.save_id"), id0, "save_id không đổi qua các chu kỳ");
  }
});

test("W1-4: export -> chơi -> import bản cũ bị chặn (MẤT tiến trình mới)", () => {
  const g = game();
  g.run("fixture('ctc');save()");
  const code = g.run("exportSave()");
  const revExport = g.run("S.rev");
  g.run("S.gold=99999;save();save();save()");
  assert.ok(g.run("S.rev") > revExport, "rev tăng sau khi chơi");
  assert.throws(() => g.run(`importSave(${JSON.stringify(code)})`), /MẤT tiến trình mới/);
  assert.equal(g.run("S.gold"), 99999, "bản hiện tại không bị ảnh hưởng khi import bị chặn");
  // force: cho phép khi có chủ ý rõ ràng
  g.run(`importSave(${JSON.stringify(code)}, {force:true})`);
  assert.ok(g.run("S.rev") > revExport, "rev tiếp tục tăng sau import force");
});

test("W1-4: khác dòng save (save_id khác) được phép — đổi nhân vật, không phải rollback", () => {
  const g = game();
  g.run("fixture('ctc');save();save();save()");
  const revA = g.run("S.rev");
  // nhân vật B: save_id mới, rev thấp hơn
  g.run("var keepS=S;S=Object.assign(newSave(),{fac:'shaolin',mode:'ctc',lvl:60});save();var codeB=exportSave();var revB=S.rev;S=keepS;save()");
  const revB = g.run("revB");
  assert.ok(revB < revA, `setup: revB(${revB}) < revA(${revA})`);
  g.run("importSave(codeB)");
  assert.equal(g.run("S.rev") > revB, true, "import nhân vật khác thành công, rev tiếp tục tăng");
});

test("W1-4: slot đã link thì cid phải khớp", () => {
  const g = game();
  g.run("fixture('ctc');S.cid='c_test_char_aaaa0001';save();save()");
  g.run("localStorage.setItem(onlKey(), JSON.stringify({token:'tok123'}))");
  // mã của nhân vật B (cid khác), rev cao để không vướng check rev
  g.run("var keepS=S;S=Object.assign(newSave(),{fac:'shaolin',mode:'ctc',lvl:60,cid:'c_test_char_bbbb0002'});for(var i=0;i<10;i++)save();var codeB=exportSave();S=keepS;save()");
  assert.throws(() => g.run("importSave(codeB)"), /cid không khớp/);
  assert.equal(g.run("S.cid"), "c_test_char_aaaa0001", "S không bị thay khi import bị chặn");
  // gỡ link -> nhập được
  g.run("localStorage.removeItem(onlKey())");
  g.run("importSave(codeB)");
  assert.equal(g.run("S.cid"), "c_test_char_bbbb0002");
});

test("W1-4: save cũ không có rev/save_id được migration an toàn", () => {
  const g = game();
  g.run("fixture('ctc');delete S.rev;delete S.save_id;S=migrate(S);save()");
  assert.ok(g.run("typeof S.save_id==='string' && S.save_id.length>0"), "save_id được cấp khi migration");
  assert.ok(g.run("S.rev") >= 1, "rev >= 1 sau save đầu");
  const id0 = g.run("S.save_id");
  g.run("load()");
  assert.equal(g.run("S.save_id"), id0, "save_id giữ nguyên sau load");
  assert.ok(g.run("S.rev") >= 1);
});

test("W1-4: writeSlot chặn ghi đè bản cũ (trừ force)", () => {
  const g = game();
  g.run("fixture('ctc');save();save();save()");
  const curRev = g.run("S.rev");
  g.run("var oldSt=JSON.parse(JSON.stringify(S));oldSt.rev=1;");
  assert.throws(() => g.run("writeSlot(SLOT, oldSt)"), /MẤT tiến trình mới/);
  assert.equal(g.run("S.rev"), curRev, "storage/S không đổi khi bị chặn");
  g.run("writeSlot(SLOT, oldSt, {force:true})");
  g.run("load()");
  assert.ok(g.run("S.rev") >= 1, "force ghi đè thành công");
});
