// Sinh js/content.gen.js từ data/content/*.v1.json (có validate schema).
// Dùng: node scripts/build-content.mjs [--check]
// --check: chỉ validate, không ghi file (cho CI).
// Quy ước: version mới = file JSON mới, không sửa file đã phát hành.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checkOnly = process.argv.includes("--check");

// Nạp validator từ js/content.js (không cần DOM).
const src = fs.readFileSync(root + "js/content.js", "utf8");
const ctx = {};
vm.runInNewContext(src, ctx, { filename: "js/content.js" });

function load(kind, file, validate) {
  const raw = fs.readFileSync(root + file, "utf8");
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error(`${file}: JSON không hợp lệ: ${e.message}`); }
  validate(data); // ném Error với thông điệp rõ nếu sai schema
  console.log(`  ✓ ${file} (${data.version})`);
  return data;
}

const trial = load("trial", "data/content/trial.v1.json", ctx.validateTrialRules);
const events = load("events", "data/content/events.v1.json", ctx.validateEventFlags);

if (!checkOnly) {
  const out = `// TỰ SINH bởi scripts/build-content.mjs — không sửa tay. Nguồn: data/content/*.v1.json\n` +
    `window.JX_CONTENT=${JSON.stringify({ trial, events })};\n` +
    `(function(){const f=o=>{if(o&&typeof o==="object"){for(const v of Object.values(o))f(v);Object.freeze(o)}};f(window.JX_CONTENT);})();\n`;
  fs.writeFileSync(root + "js/content.gen.js", out);
  console.log(`  -> js/content.gen.js`);
}
console.log("content: OK");
