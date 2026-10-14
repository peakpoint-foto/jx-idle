#!/usr/bin/env node
/** Benchmark register, login, and set-password against local wrangler dev (workerd). */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { GAME } from "../worker/gen/game.js";

const base = process.env.JX_API || "http://127.0.0.1:8787";
const hdr = (ip) => ({
  "content-type": "application/json",
  "cf-connecting-ip": ip,
  "x-measure-auth-cpu": "1",
});

const st = { ...GAME.newSave(), mode: "ctc", fac: "shaolin", cid: "c_bench_" + Date.now(), lvl: 20, xp: 1 };
const save = JSON.stringify({ d: JSON.stringify(st), h: "x" });
const name = "Bench" + Date.now().toString(36).slice(-8);

async function post(path, body, headers) {
  const r = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(path + " " + r.status + " " + JSON.stringify(j));
  return j;
}

const reg = await post("/api/register", { name, password: "benchpass99", save, turnstile: "" }, hdr("203.0.113.55"));
const login = await post(
  "/api/login",
  { username: name, password: "benchpass99", turnstile: "" },
  hdr("203.0.113.56")
);

const legacyToken = "legacy-bench-" + Date.now().toString(36);
const legacyHash = createHash("sha256").update(legacyToken).digest("hex");
const legacyId = "leg" + Date.now().toString(36).slice(-10);
const legacyName = "Leg" + Date.now().toString(36).slice(-6);
execSync(
  `npx wrangler d1 execute DB --local --command "INSERT INTO accounts(id,token_hash,name,created_at) VALUES('${legacyId}','${legacyHash}','${legacyName}',${Date.now()});"`,
  { stdio: "pipe", cwd: "/workspace" }
);

const setPwd = await post(
  "/api/set-password",
  { password: "newbenchpass1", turnstile: "" },
  {
    "content-type": "application/json",
    authorization: "Bearer " + legacyToken,
    "x-measure-auth-cpu": "1",
  }
);

console.log(
  JSON.stringify(
    {
      register_pbkdf2_ms: reg._benchmark?.pbkdf2_ms,
      login_pbkdf2_ms: login._benchmark?.pbkdf2_ms,
      login_handler_ms: login._benchmark?.handler_ms,
      set_password_pbkdf2_ms: setPwd._benchmark?.pbkdf2_ms,
      set_password_handler_ms: setPwd._benchmark?.handler_ms,
      workers_free_10ms_cpu: "PBKDF2 alone exceeds 10ms if values above ~10",
    },
    null,
    2
  )
);
