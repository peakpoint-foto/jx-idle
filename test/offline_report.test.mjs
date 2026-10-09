import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("báo cáo treo máy: món hiếm nhất, tiến độ cấp, hiệu quả, lịch sử", () => {
  const g = game();
  // vắng 2 giờ
  g.run(`fixture('ctc',50);S.last=Date.now()-2*3600*1000;S.kps=1;`);
  const o = g.json(`(()=>{const r=offlineGains();return r?{secs:Math.round(r.secs),kills:r.kills,got:r.got,rarest:r.rarest,lv0:r.lv0,lv1:r.lv1}:null})()`);
  assert.ok(o && o.kills > 0, "có báo cáo");
  assert.ok(o.rarest && typeof o.rarest.n === "string", "có món hiếm nhất");
  assert.ok(o.got >= 0);
  // enrich + history
  g.run(`S.last=Date.now()-2*3600*1000;var rep=offlineEnrich(offlineGains());offlineHistoryPush(rep);`);
  const rep = g.json(`({up:rep.nearLevel.up,pct:rep.nearLevel.pct,eff:Math.round(rep.eff),hist:S.rw.offlineHist.length})`);
  assert.ok(rep.pct >= 0 && rep.pct <= 100, "tiến độ % hợp lệ");
  assert.ok(rep.eff <= 2 * 3600, "hiệu quả không vượt thời gian vắng");
  assert.equal(rep.hist, 1, "lưu lịch sử");
  const html = g.run("offlineDetailHTML(rep)");
  assert.ok(html.includes("Món hiếm nhất") || o.got === 0 || html.includes("Quái bị hạ"), "có chi tiết");
  assert.ok(html.includes("Lịch sử treo máy"), "có lịch sử trong báo cáo");
  // đẩy 8 lần -> chỉ giữ 7
  g.run(`for(let i=0;i<8;i++)offlineHistoryPush(rep);`);
  assert.equal(g.json("S.rw.offlineHist.length"), 7, "giữ 7 lần gần nhất");
});

test("lý do delta = 0: dưới 60s / cấp tối đa / hết quota", () => {
  const g = game();
  g.run("fixture('ctc',50);S.last=Date.now()-30*1000;");
  assert.ok(g.run("offlineZeroReason()").includes("60 giây"), "dưới ngưỡng 60s");
  g.run(`S.lvl=MAX_LEVEL;S.last=Date.now()-3600*1000;`);
  assert.ok(g.run("offlineZeroReason()").includes("cấp tối đa"), "đạt cấp tối đa");
  g.run(`S.lvl=50;S.offDay={t0:Date.now(),secs:OFFLINE_DAY_MAX};S.last=Date.now()-3600*1000;`);
  assert.ok(g.run("offlineZeroReason()").includes("quota"), "hết quota ngày");
});
