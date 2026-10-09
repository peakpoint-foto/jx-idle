import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Harness cố định Date.now() = 2026-10-07T12:00:00Z (thứ Tư, tuần W41).

test("bucket tuần ISO, ngày hoạt động, session, vàng đúng biên", () => {
  const g = game();
  assert.equal(g.run(`teleWeekBucket(Date.UTC(2026,9,7,12))`), "2026-W41");
  assert.equal(g.run(`teleWeekBucket(Date.UTC(2026,0,1,12))`), "2026-W01");
  assert.equal(g.run(`teleWeekBucket(Date.UTC(2025,11,31,12))`), "2026-W01"); // 31/12/2025 thuộc W01/2026
  assert.deepEqual(g.json(`[1,2,6,7,13,14,29,30,99].map(teleActiveDaysBucket)`),
    ["1", "2-6", "2-6", "7-13", "7-13", "14-29", "14-29", "30+", "30+"]);
  assert.deepEqual(g.json(`[0,299,300,899,900,3599,3600].map(teleSessionBucket)`),
    ["<5m", "<5m", "5-15m", "5-15m", "15-60m", "15-60m", "60m+"]);
  assert.deepEqual(g.json(`[0,999,1000,9999,10000,99999,100000,999999,1000000].map(teleGoldBucket)`),
    ["<1k", "<1k", "1k-10k", "1k-10k", "10k-100k", "10k-100k", "100k-1M", "100k-1M", "1M+"]);
});

test("mặc định BẬT, tắt thì không ghi nhận sự kiện", () => {
  const g = game();
  assert.equal(g.run(`teleIsEnabled()`), true);
  assert.equal(g.run(`teleTrack("feature_used","trial")`), true);
  g.run(`teleSetEnabled(false)`);
  assert.equal(g.run(`teleIsEnabled()`), false);
  assert.equal(g.run(`teleTrack("feature_used","trial")`), false);
  assert.equal(g.json(`teleReadQueue().length`), 1);
  g.run(`teleSetEnabled(true)`);
  assert.equal(g.run(`teleIsEnabled()`), true);
});

test("teleTrack kiểm tra tên và giá trị, không nhận chuỗi tự do", () => {
  const g = game();
  assert.equal(g.run(`teleTrack("do_something_evil","x")`), false);
  assert.equal(g.run(`teleTrack("feature_used","Tên Có Dấu")`), false);
  assert.equal(g.run(`teleTrack("active_day",{weekend:2})`), false);
  assert.equal(g.run(`teleTrack("gold_sink_spent",{sink:"hack",amount:"1M+"})`), false);
  assert.equal(g.run(`teleTrack("active_day",{weekend:0})`), true);
  assert.equal(g.run(`teleTrack("advisor_suggestion_applied","gear")`), true);
  assert.equal(g.run(`teleTrack("story_read","shaolin")`), true);
  assert.equal(g.run(`teleTrack("trial_started","iron")`), true);
  assert.equal(g.json(`teleReadQueue().length`), 4);
});

test("hàng đợi bị chặn 200, sự kiện mang cohort không định danh bền", () => {
  const g = game();
  g.run(`for(let i=0;i<210;i++)teleTrack("report_detail_opened")`);
  const q = g.json(`teleReadQueue()`);
  assert.equal(q.length, 200);
  assert.ok(q.every(e => typeof e.iw === "string" && typeof e.ad === "string"));
  assert.ok(q.every(e => !("uid" in e) && !("id" in e) && !("device" in e)));
});

test("ngày hoạt động tăng đúng một lần mỗi ngày UTC", () => {
  const g = game();
  g.run(`teleActiveDayTick()`);
  assert.equal(g.json(`teleMeta().days`), 1);
  g.run(`teleActiveDayTick()`);
  assert.equal(g.json(`teleMeta().days`), 1); // cùng ngày không tăng
  assert.deepEqual(g.json(`teleReadQueue().filter(e=>e.e==="active_day").length`), 1);
});

test("thông báo một lần: hiện modal rồi đánh dấu đã hiện", () => {
  const g = game();
  let shown = 0;
  g.run(`modal=(h)=>{globalThis.__teleH=h}; closeModal=()=>{}`);
  g.run(`teleMaybeNotice()`);
  assert.match(g.run(`globalThis.__teleH`), /dữ liệu ẩn danh/);
  assert.match(g.run(`globalThis.__teleH`), /Tắt thu thập/);
  g.run(`teleMaybeNotice()`);
  // lần 2 không hiện lại (flag đã set) — modal không được gọi thêm
  g.run(`globalThis.__teleH="second"`);
  g.run(`teleMaybeNotice()`);
  assert.equal(g.run(`globalThis.__teleH`), "second");
});

test("feedback payload giữ trường feature trong allowlist", () => {
  const g = game();
  const p = g.json(`feedbackPayload({text:"góp ý hay quá đi",cat:"idea",feature:"rift",includeContext:false})`);
  assert.equal(p.feature, "rift");
  const p2 = g.json(`feedbackPayload({text:"góp ý hay quá đi",cat:"idea",feature:"<script>",includeContext:false})`);
  assert.equal(p2.feature, undefined);
});
