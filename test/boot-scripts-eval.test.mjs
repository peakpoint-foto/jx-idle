// Boot smoke: mọi <script src> trong index.html phải eval sạch trong CÙNG một
// global scope, theo đúng thứ tự — bắt lỗi trùng khai báo top-level
// (const/let/function) giữa các file, loại bug từng giết chết toàn bộ
// js/events.js ở production (UPDATE_NOTES trùng với js/ui.js, 16/10/2026).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function makeEl() {
  const styleStub = new Proxy({}, { get: () => (...a) => "", set: () => true });
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === "style") return styleStub;
      if (k === "clientWidth" || k === "offsetWidth") return 1280;
      if (k === "clientHeight" || k === "offsetHeight") return 800;
      if (k === "classList") return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === "dataset") return {};
      if (k === "children" || k === "childNodes") return [];
      if (k === "getContext") return () => makeEl();
      if (k === "getBoundingClientRect") return () => ({ left: 0, top: 0, width: 100, height: 100 });
      if (k === "closest" || k === "querySelector") return () => makeEl();
      if (k === "querySelectorAll") return () => [];
      if (k === "getComputedStyle") return () => ({ getPropertyValue: () => "" });
      if (k === Symbol.toPrimitive) return () => "";
      return makeEl();
    },
    set() { return true; },
    apply() { return makeEl(); },
  });
}

function elList(n = 8) {
  // mảng thật gồm n stub element — nhất quán cho cả index access, forEach,
  // Array.from (game thật có các node này trong DOM)
  return Array.from({ length: n }, () => makeEl());
}

function buildSandbox() {
  const storage = new Map();
  const documentStub = new Proxy({}, {
    get(t, k) {
      if (k === "querySelector" || k === "getElementById") return () => makeEl();
      if (k === "querySelectorAll" || k === "getElementsByTagName" || k === "getElementsByClassName") return () => elList();
      if (k === "createElement" || k === "createElementNS") return () => makeEl();
      if (k === "addEventListener") return () => 0;
      if (k === "documentElement" || k === "body" || k === "head") return makeEl();
      if (k === "readyState") return "loading";
      return makeEl();
    },
    set() { return true; },
  });
  class MO { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }
  const quietConsole = new Proxy({}, { get: () => () => {} });
  const sandbox = {
    document: documentStub,
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    navigator: {}, MutationObserver: MO,
    location: { protocol: "https:", hostname: "x.test", search: "", href: "https://x.test/" },
    performance: { now: () => Date.now() },
    crypto: { randomUUID: () => "test-uuid" },
    Image: function () { return makeEl(); }, Audio: function () { return makeEl(); },
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
    addEventListener: () => 0, removeEventListener: () => 0,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => 0, clearInterval: () => 0,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    fetch: () => Promise.reject(new Error("no fetch in boot smoke")),
    console: quietConsole, URL, JSON, Math, Date, RegExp, Error, Object, Array,
    Map, Set, Promise, Proxy, Reflect, Symbol, BigInt, Number, String, Boolean,
    WeakMap, WeakSet, Intl, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox);
}

test("boot: mọi script trong index.html eval sạch trong cùng global scope", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map(m => m[1]);
  assert.ok(srcs.length > 50, `index.html phải liệt kê đủ script game, got ${srcs.length}`);
  const ctx = buildSandbox();
  const failures = [];
  for (const f of srcs) {
    const code = fs.readFileSync(path.join(ROOT, f), "utf8");
    try {
      vm.runInContext(code, ctx, { filename: f });
    } catch (e) {
      failures.push(`${f}: ${String((e && e.message) || e).split("\n")[0]}`);
    }
  }
  assert.deepEqual(failures, [], `script eval lỗi:\n${failures.join("\n")}`);
});

test("boot: events.js sống sót — các hàm sự kiện tồn tại sau khi nạp", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map(m => m[1]);
  const ctx = buildSandbox();
  for (const f of srcs) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const has = (name) => vm.runInContext(`typeof ${name}`, ctx);
  // events.js — từng chết toàn bộ vì trùng const UPDATE_NOTES (16/10/2026)
  for (const fn of ["nhDrop", "nhOpen", "nhBody", "nhRabbitSpawn", "smDrop", "smUse", "nhMerge", "forgeHub", "updateNotice"]) {
    assert.equal(has(fn), "function", `${fn} phải tồn tại sau boot (events.js)`);
  }
  // ui.js — modal changelog Wave 2 B4 vẫn nguyên
  assert.equal(has("showUpdateNotes"), "function", "showUpdateNotes phải tồn tại (ui.js)");
  assert.equal(vm.runInContext("UPDATE_NOTES_V", ctx), 2);
});
