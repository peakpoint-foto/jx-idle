import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

/* UI Thiết bị & bảo mật (W1-5): logic thuần + flow revoke/rotate với onlApi mock.
   Không DOM, không lộ token/hash. */
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
const apiData = () => ({
  primary: { created_at: NOW - 10 * 864e5, via: "primary", grace_until: null },
  devices: [
    { id: "d_cur", device_label: "Máy tính này", created_at: NOW - 864e5, last_used_at: NOW - 5 * 60e3, revoked_at: null, current: true, token_hash: "HASH_LEAK_IF_SHOWN" },
    { id: "d_old", device_label: "", created_at: NOW - 9 * 864e5, last_used_at: NOW - 2 * 864e5, revoked_at: NOW - 864e5, current: false, token_hash: "HASH_LEAK_IF_SHOWN" },
    { id: "d_xss", device_label: "<script>alert(1)</script>", created_at: NOW - 864e5, last_used_at: null, revoked_at: null, current: false },
  ],
});

test("devViewModel: map label/current/revoked/via, không giữ token_hash", () => {
  const g = game();
  const vm = g.json(`devViewModel(${JSON.stringify(apiData())}, ${NOW})`);
  assert.equal(vm.via, "primary");
  assert.equal(vm.canRotate, true);
  assert.equal(vm.devices.length, 3);
  const [cur, old, xss] = vm.devices;
  assert.equal(cur.label, "Máy tính này");
  assert.equal(cur.current, true);
  assert.equal(cur.revoked, false);
  assert.equal(cur.canRevoke, true);
  assert.equal(cur.statusTxt, "Thiết bị này");
  assert.equal(cur.lastUsedTxt, "5 phút trước");
  assert.equal(old.label, "Thiết bị không tên"); // label rỗng -> fallback
  assert.equal(old.revoked, true);
  assert.equal(old.canRevoke, false); // đã thu hồi -> không revoke lại
  assert.equal(old.statusTxt, "Đã thu hồi");
  assert.equal(xss.label, "<script>alert(1)</script>"); // esc ở tầng HTML, không ở view model
  for (const d of vm.devices) assert.ok(!("token_hash" in d), "view model không giữ token_hash");
  assert.ok(!JSON.stringify(vm).includes("HASH_LEAK_IF_SHOWN"));
});

test("devViewModel: phiên device -> canRotate=false", () => {
  const g = game();
  const data = apiData();
  data.primary.via = "device";
  const vm = g.json(`devViewModel(${JSON.stringify(data)}, ${NOW})`);
  assert.equal(vm.via, "device");
  assert.equal(vm.canRotate, false);
});

test("devViewModel: dữ liệu rỗng/malformed không crash", () => {
  const g = game();
  const vm = g.json(`devViewModel(null, ${NOW})`);
  assert.equal(vm.via, "primary");
  assert.equal(vm.devices.length, 0);
  const vm2 = g.json(`devViewModel({devices:"nope"}, ${NOW})`);
  assert.equal(vm2.devices.length, 0);
});

test("devFmtDate/devAgo", () => {
  const g = game();
  assert.equal(g.run("devFmtDate(null)"), "—");
  assert.equal(g.run("devFmtDate(0)"), "—");
  assert.match(g.run(`devFmtDate(${NOW})`), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.equal(g.run(`devAgo(${NOW - 30e3}, ${NOW})`), "vừa xong");
  assert.equal(g.run(`devAgo(${NOW - 90e3}, ${NOW})`), "1 phút trước");
  assert.equal(g.run(`devAgo(${NOW - 3 * 36e5}, ${NOW})`), "3 giờ trước");
  assert.equal(g.run(`devAgo(${NOW - 10 * 864e5}, ${NOW})`), g.run(`devFmtDate(${NOW - 10 * 864e5})`));
});

test("devRevokeReq/devRotateReq: đúng endpoint và body", () => {
  const g = game();
  assert.deepEqual(g.json('devRevokeReq("d_abc")'), { path: "/api/devices/revoke", body: { device_id: "d_abc" } });
  assert.deepEqual(g.json("devRotateReq()"), { path: "/api/token/rotate", body: {} });
});

test("devErrMsg: map 403/404/429/offline sang tiếng Việt", () => {
  const g = game();
  const run = (code, action) => g.run(`devErrMsg(${JSON.stringify({ code })}, ${JSON.stringify(action || "")})`);
  assert.equal(run("forbidden", "revoke"), "Phiên này chỉ được thu hồi chính thiết bị đang dùng");
  assert.equal(run("forbidden", "rotate"), "Phiên này không có quyền làm việc đó");
  assert.equal(run("device_not_found", "revoke"), "Thiết bị đã được thu hồi trước đó");
  assert.equal(run("rate_limited", "revoke"), "Thao tác quá nhiều, thử lại sau ít phút");
  assert.equal(run("offline", "load"), "Không kết nối được máy chủ online");
  assert.equal(g.run('devErrMsg({code:"weird_9",msg:"srv says no"},"load")'), "srv says no");
  assert.equal(g.run('devErrMsg({code:"weird_9"},"load")'), "Không tải được danh sách thiết bị");
  assert.equal(g.run('devErrMsg(null,"")'), "Lỗi máy chủ, thử lại sau");
});

test("devFetchDevices: ok -> view model; lỗi -> msg thân thiện", async () => {
  const g = game();
  g.run(`var nowMs=${NOW};var apiOk=async()=>(${JSON.stringify(apiData())});`);
  const ok = await g.run("devFetchDevices({api:apiOk,now:()=>nowMs})");
  assert.equal(await ok.ok, true);
  assert.equal((await ok.vm).devices.length, 3);
  g.run("var apiBad=async()=>{throw {code:'offline'}};");
  const bad = await g.run("devFetchDevices({api:apiBad})");
  assert.equal(await bad.ok, false);
  assert.equal(await bad.msg, "Không kết nối được máy chủ online");
});

test("devDoRevoke: gọi đúng endpoint/body; 403/404/429 -> msg thân thiện", async () => {
  const g = game();
  g.run(`var calls=[];var apiOk=async(path,opt)=>{calls.push({path,body:opt.body});return {ok:true,device_id:opt.body.device_id}};`);
  const r = await g.run("devDoRevoke({api:apiOk},'d_x',null)");
  assert.equal(await r.ok, true);
  assert.equal(await r.device_id, "d_x");
  assert.equal(await r.wasCurrent, false);
  const c = g.json("calls[0]");
  assert.equal(c.path, "/api/devices/revoke");
  assert.deepEqual(c.body, { device_id: "d_x" });
  const r2 = await g.run("devDoRevoke({api:apiOk},'d_cur',{current:true})");
  assert.equal(await r2.wasCurrent, true); // thu hồi thiết bị hiện tại -> UI phải kết thúc session
  for (const [code, msg] of [
    ["forbidden", "Phiên này chỉ được thu hồi chính thiết bị đang dùng"],
    ["device_not_found", "Thiết bị đã được thu hồi trước đó"],
    ["rate_limited", "Thao tác quá nhiều, thử lại sau ít phút"],
  ]) {
    g.run(`var apiE=async()=>{throw {code:${JSON.stringify(code)}}};`);
    const e = await g.run("devDoRevoke({api:apiE},'d_x',null)");
    assert.equal(await e.ok, false);
    assert.equal(await e.msg, msg);
  }
});

test("devDoRotate: primary -> lưu token mới vào session; device -> không đụng session, không trả token", async () => {
  const g = game();
  g.run(`var saved=null;var acc={id:"a1",name:"N",token:"OLD"};`
    + `var deps={getAcc:()=>acc,setAcc:v=>{saved=v.token}};`
    + `var apiP=async()=>({token:"NEWTOKEN",rotated:"primary",grace_hours:24});`
    + `var apiD=async()=>({token:"SHOULD_NOT_LEAK",rotated:"device",device_label:"X"});`
    + `var apiFail=async()=>{throw {code:"forbidden"}};`);
  const p = await g.run("devDoRotate({api:apiP,getAcc:deps.getAcc,setAcc:deps.setAcc})");
  assert.equal(await p.ok, true);
  assert.equal(await p.rotated, "primary");
  assert.equal(await p.token, "NEWTOKEN");
  assert.equal(g.run("saved"), "NEWTOKEN"); // localStorage session cập nhật
  assert.equal(g.run("acc.token"), "NEWTOKEN");
  const p2 = await g.run("devDoRotate({api:apiP,getAcc:()=>null,setAcc:v=>{saved=v.token}})");
  assert.equal(await p2.ok, true); // không có session local vẫn ok (token đã hiện cho user copy)
  g.run("saved=null;acc.token='OLDTOKEN';");
  const d = await g.run("devDoRotate({api:apiD,getAcc:deps.getAcc,setAcc:deps.setAcc})");
  assert.equal(await d.ok, true);
  assert.equal(await d.rotated, "device");
  assert.equal(await d.token, null); // KHÔNG trả token phiên thiết bị
  assert.equal(g.run("saved"), null); // session hiện tại giữ nguyên
  assert.equal(g.run("acc.token"), "OLDTOKEN");
  const f = await g.run("devDoRotate({api:apiFail,getAcc:deps.getAcc,setAcc:deps.setAcc})");
  assert.equal(await f.ok, false);
  assert.equal(await f.msg, "Phiên này không có quyền làm việc đó");
});

test("devListHTML: không lộ token/hash, esc label, revoked mờ + không nút", () => {
  const g = game();
  const html = g.run(`devListHTML(devViewModel(${JSON.stringify(apiData())}, ${NOW}))`);
  assert.ok(!html.includes("HASH_LEAK_IF_SHOWN"), "không lộ hash");
  assert.ok(!html.includes("token_hash"), "không lộ tên trường hash");
  assert.ok(html.includes("&lt;script&gt;"), "label được esc");
  assert.ok(!html.includes("<script>alert"), "không có script thô");
  assert.ok(html.includes("thiết bị này"), "đánh dấu current");
  assert.ok(html.includes("đã thu hồi"), "đánh dấu revoked");
  assert.ok(html.includes('data-devrev="d_cur"'), "thiết bị hiện tại có nút thu hồi");
  assert.ok(!html.includes('data-devrev="d_old"'), "đã thu hồi thì không có nút");
  assert.ok(html.includes("opacity:.5"), "revoked mờ đi");
  const empty = g.run("devListHTML(devViewModel(null,1))");
  assert.ok(empty.includes("Chưa có thiết bị nào"));
});
