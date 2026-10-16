import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Nạp js/doll.js trong vm với window/document giả lập tối thiểu.
function loadDoll() {
  const appended = [];
  const elements = [];
  const context = {
    console, WeakMap, Set, Map, Math, JSON, Promise,
    setInterval: () => 0, setTimeout: () => 0,
    clearInterval: () => {}, clearTimeout: () => {},
    document: {
      head: { appendChild: el => { appended.push(el); } },
      createElement: tag => {
        const el = { tag, async: false, _src: "", onload: null, onerror: null,
          set src(v) { this._src = v; }, get src() { return this._src; } };
        elements.push(el);
        return el;
      },
    },
  };
  context.window = context; // window.X <-> global X, như game harness
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(root + "js/doll.js", "utf8"), context, { filename: "js/doll.js" });
  return { context, appended,
    run: code => vm.runInContext(code, context),
  };
}

test("W0-4: doll-data.js nạp lười — boot không có JDOLL, drawDoll kích hoạt 1 lần", async () => {
  const { context, appended, run } = loadDoll();
  assert.equal(run("typeof dollOn"), "function");
  assert.equal(run("typeof dollEnsureData"), "function");
  assert.equal(run("dollOn()"), false, "boot: chưa có JDOLL -> doll tắt");
  // render cần doll -> kích hoạt nạp, khung hình này vẫn fallback
  assert.equal(run("drawDoll(null,0,0,'st',0,0,1,1,null)"), 0);
  assert.equal(appended.length, 1, "chỉ chèn đúng 1 script tag");
  assert.equal(appended[0].src, "js/doll-data.js");
  // gọi thêm nhiều lần -> không chèn trùng
  run("drawDoll(null,0,0,'st',0,0,1,1,null);drawDoll(null,0,0,'st',0,0,1,1,null);");
  assert.equal(appended.length, 1, "không chèn trùng khi đang tải");
  // giả lập tải xong: JDOLL xuất hiện -> dollOn true
  context.JDOLL = { sheets: {}, res: {} };
  appended[0].onload();
  assert.equal(await run("dollEnsureData()"), true);
  assert.equal(run("dollOn()"), true, "sau khi data về, doll bật");
});

test("W0-4: DOLL_OFF=true thì không nạp data", () => {
  const { appended, run } = loadDoll();
  run("window.DOLL_OFF=true;");
  assert.equal(run("drawDoll(null,0,0,'st',0,0,1,1,null)"), 0);
  assert.equal(appended.length, 0, "tôn trọng DOLL_OFF, không tải");
  assert.equal(run("dollOn()"), false);
});

test("W0-4: tải lỗi -> resolve false, không kẹt promise", async () => {
  const { appended, run } = loadDoll();
  run("drawDoll(null,0,0,'st',0,0,1,1,null);");
  assert.equal(appended.length, 1);
  appended[0].onerror();
  assert.equal(await run("dollEnsureData()"), false);
  // drawDoll sau lỗi vẫn fallback bình thường, không ném
  assert.equal(run("drawDoll(null,0,0,'st',0,0,1,1,null)"), 0);
  assert.equal(appended.length, 1, "lỗi rồi không thử lại vô hạn");
});
