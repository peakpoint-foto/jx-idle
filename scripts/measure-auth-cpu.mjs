#!/usr/bin/env node
/** Benchmark register+login against local wrangler dev (workerd). */
import { GAME } from "../worker/gen/game.js";

const base = process.env.JX_API || "http://127.0.0.1:8787";
const hdr = {
  "content-type": "application/json",
  "cf-connecting-ip": "203.0.113.55",
  "x-measure-auth-cpu": "1",
};

const st = { ...GAME.newSave(), mode: "ctc", fac: "shaolin", cid: "c_bench_" + Date.now(), lvl: 20, xp: 1 };
const save = JSON.stringify({ d: JSON.stringify(st), h: "x" });
const name = "Bench" + Date.now().toString(36).slice(-8);

const reg = await fetch(base + "/api/register", {
  method: "POST",
  headers: hdr,
  body: JSON.stringify({ name, password: "benchpass99", save, turnstile: "" }),
}).then((r) => r.json());

const login = await fetch(base + "/api/login", {
  method: "POST",
  headers: hdr,
  body: JSON.stringify({ username: name, password: "benchpass99", turnstile: "" }),
}).then((r) => r.json());

console.log(JSON.stringify({ register: reg._benchmark, login: login._benchmark, name }, null, 2));
