import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

const DAY = 864e5, MONDAY = Date.UTC(2026, 9, 5); // thứ Hai, mốc tuần UTC
const ev = weeks => ({version: "events-v2", slots: [{id: "e1", kind: "trial", mode: "phlt", name: "E1", enabled: true, schedule: {weeks}, limits: {perDay: 5}}]});

test("events v2 hợp lệ, v1 vẫn hợp lệ (không sửa file đã phát hành)", () => {
  const g = game();
  assert.equal(g.json("JX_CONTENT.events.version"), "events-v2");
  // v1 giữ nguyên shape cũ và vẫn pass validator
  g.run(`validateEventFlags({version:"events-v1",slots:[{id:"a",kind:"trial",cadence:"weekly",mode:"phlt",enabled:true,name:"A"}]})`);
  assert.throws(() => g.run(`validateEventFlags(${JSON.stringify({version: "events-v2", slots: [{id: "a", kind: "trial", mode: "phlt", name: "A", enabled: true, schedule: {weeks: "sometimes"}}]})})`), /weeks/);
});

test("eventScheduled: all/even/odd/slot lạ/bị tắt", () => {
  const g = game();
  assert.equal(g.run(`eventScheduled(${JSON.stringify(ev("all"))},"e1",101)`), true);
  assert.equal(g.run(`eventScheduled(${JSON.stringify(ev("even"))},"e1",100)`), true);
  assert.equal(g.run(`eventScheduled(${JSON.stringify(ev("even"))},"e1",101)`), false);
  assert.equal(g.run(`eventScheduled(${JSON.stringify(ev("odd"))},"e1",101)`), true);
  assert.equal(g.run(`eventScheduled(${JSON.stringify(ev("all"))},"khongco",100)`), false);
  const disabled = ev("all"); disabled.slots[0].enabled = false;
  assert.equal(g.run(`eventScheduled(${JSON.stringify(disabled)},"e1",100)`), false);
});

test("mốc tuần UTC trùng với trial (thứ Hai 00:00 UTC)", () => {
  const g = game();
  assert.equal(g.run(`eventWeekStart(eventWeekIndex(${MONDAY}))`), MONDAY);
  assert.equal(g.run(`eventWeekIndex(${MONDAY + 6 * DAY + 86399999})`), g.run(`eventWeekIndex(${MONDAY})`), "Chủ nhật vẫn cùng tuần");
  assert.equal(g.run(`eventWeekIndex(${MONDAY + 7 * DAY})`), g.run(`eventWeekIndex(${MONDAY})`) + 1, "thứ Hai sau sang tuần mới");
});

test("lịch hiển thị đúng tuần và đúng sự kiện trong lịch", () => {
  const g = game();
  assert.equal(g.run("eventCalendarHTML()"), "", "flag tắt thì không hiện");
  g.run("setFeatureFlags({event_calendar:true})");
  const html = g.run(`eventCalendarHTML(${MONDAY + 12 * 3600e3})`);
  assert.ok(html.includes("05/10") && html.includes("12/10"), "hiện đúng khoảng tuần (giờ VN): " + html.slice(0, 120));
  assert.ok(html.includes("Thử thách tuần") && html.includes("Thử thách cộng đồng"), "hiện sự kiện trong lịch");
  // tuần lẻ với lịch even: không hiện sự kiện đó
  const custom = JSON.stringify({version: "events-v2", slots: [{id: "x", kind: "trial", mode: "phlt", name: "Chỉ tuần chẵn", enabled: true, schedule: {weeks: "even"}}]});
  const weekIdx = g.run(`eventWeekIndex(${MONDAY})`);
  g.run(`JX_CONTENT = Object.assign({}, JX_CONTENT, {events: ${custom}})`);
  const html2 = g.run(`eventCalendarHTML(${MONDAY})`);
  if (weekIdx % 2 === 1) assert.ok(!html2.includes("Chỉ tuần chẵn"), "ngoài lịch thì không hiện");
  else assert.ok(html2.includes("Chỉ tuần chẵn"), "trong lịch thì hiện");
});
