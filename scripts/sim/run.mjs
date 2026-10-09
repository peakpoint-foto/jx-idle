// Chạy ma trận sim cân bằng, xuất báo cáo markdown + cảnh báo lệch phái.
// Dùng: node scripts/sim/run.mjs [--update-baseline]
// Chạy trước: node worker/build-game.mjs (để có worker/gen/game.js).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runMatrix, SIM_LEVELS, SIM_TIERS } from "./lib.mjs";
import budget from "./budget.json" with { type: "json" };

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);

console.log("sim: chạy ma trận 10 phái × 3 cấp × 3 tier (seed cố định)...");
const t0 = Date.now();
const cells = runMatrix(c => process.stdout.write(`\r  ${c.fac} lv${c.lvl} ${c.tier} dps=${c.dps}   `));
console.log(`\n  xong ${(Date.now() - t0) / 1000}s, ${cells.length} ô`);

// Bảng theo (lvl, tier): dps từng phái + độ lệch so với trung bình.
let md = `# Báo cáo mô phỏng cân bằng\n\nTạo lúc: ${new Date().toISOString()}\n` +
  `Engine: sessionCombatStep (party 2 actor giống nhau, boss scale theo party).\n` +
  `Mỗi ô = trung bình 3 seed cố định. Đơn vị DPS: damage/giây.\n\n`;
const warnings = [];
for (const lvl of SIM_LEVELS) {
  for (const tier of SIM_TIERS) {
    const rows = cells.filter(c => c.lvl === lvl && c.tier === tier);
    const mean = rows.reduce((t, c) => t + c.dps, 0) / rows.length;
    md += `## Cấp ${lvl} — build ${tier} (trung bình ${Math.round(mean)})\n\n| Phái | DPS | Lệch TB | Tick |\n|---|---|---|---|\n`;
    for (const c of rows) {
      const dev = (c.dps - mean) / mean;
      const flag = Math.abs(dev) > budget.dps.warn_deviation ? " ⚠️" : "";
      if (flag) warnings.push(`${c.fac} lv${lvl} ${tier}: lệch ${(dev * 100).toFixed(0)}%`);
      md += `| ${c.fac} | ${c.dps} | ${(dev * 100).toFixed(1)}%${flag} | ${c.ticks} |\n`;
    }
    md += "\n";
  }
}
if (warnings.length) {
  md += `## Cảnh báo (lệch > ${budget.dps.warn_deviation * 100}% so với trung bình tier)\n\n` +
    warnings.map(w => `- ${w}`).join("\n") + "\n";
} else {
  md += `## Cảnh báo\n\nKhông có phái nào lệch quá ${budget.dps.warn_deviation * 100}% so với trung bình tier.\n`;
}
fs.writeFileSync(root + "scripts/sim/report.md", md);
console.log(`  báo cáo: scripts/sim/report.md`);
if (warnings.length) console.log(`  ⚠️ ${warnings.length} cảnh báo lệch phái`);

if (args.includes("--update-baseline")) {
  const baseline = {
    version: 1,
    generated_at: new Date().toISOString(),
    cells: Object.fromEntries(cells.map(c => [`${c.fac}/${c.lvl}/${c.tier}`, { dps: c.dps, ticks: c.ticks, status: c.status }])),
  };
  fs.writeFileSync(root + "scripts/sim/baseline.json", JSON.stringify(baseline, null, 1) + "\n");
  console.log(`  baseline: scripts/sim/baseline.json (${cells.length} ô)`);
}
