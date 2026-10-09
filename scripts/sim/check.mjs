// Balance CI — mục 0.1: kiểm tra từng ô sim VÀ tổng ngân sách cộng dồn.
// Dùng trong CI: node scripts/sim/check.mjs (exit 1 + báo cáo chênh lệch khi vượt).
// Chạy trước: node worker/build-game.mjs
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runMatrix } from "./lib.mjs";
import budget from "./budget.json" with { type: "json" };

const root = fileURLToPath(new URL("../../", import.meta.url));

// So sánh từng ô với baseline: trả về danh sách vi phạm vượt ngưỡng.
export function compareCells(cells, baselineCells, threshold) {
  const bad = [];
  for (const c of cells) {
    const key = `${c.fac}/${c.lvl}/${c.tier}`;
    const base = baselineCells[key];
    if (!base) { bad.push({ key, reason: "missing_baseline" }); continue; }
    const dev = base.dps ? Math.abs(c.dps - base.dps) / base.dps : (c.dps === 0 ? 0 : 1);
    if (dev > threshold) bad.push({ key, dps: c.dps, base: base.dps, dev: +(dev * 100).toFixed(1) });
  }
  return bad;
}

// Kiểm tra tổng cộng dồn: fail khi vượt trần, warn khi chạm vùng dự trữ.
export function checkBudgetTotal(bonuses, cap, reserve) {
  const active = bonuses.filter(b => b.status === "active");
  const total = active.reduce((t, b) => t + b.value, 0);
  return {
    total: +total.toFixed(4),
    cap,
    warnAt: +(cap * (1 - reserve)).toFixed(4),
    fail: total > cap,
    warn: total > cap * (1 - reserve) && total <= cap,
    active: active.map(b => b.id),
  };
}

export function runCheck({ cells, baselineCells, budget: bdg }) {
  const cellBad = compareCells(cells, baselineCells, bdg.dps.fail_deviation);
  const budgetRes = checkBudgetTotal(bdg.bonuses, bdg.dps.total_cap, bdg.reserve);
  return { cellBad, budget: budgetRes, ok: cellBad.length === 0 && !budgetRes.fail };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check.mjs");
if (isMain) {
  const baselinePath = root + "scripts/sim/baseline.json";
  if (!fs.existsSync(baselinePath)) {
    console.error("balance-check: chưa có baseline.json — chạy `npm run sim:baseline` trước.");
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  console.log("balance-check: chạy ma trận sim...");
  const cells = runMatrix();
  const { cellBad, budget: bres, ok } = runCheck({ cells, baselineCells: baseline.cells, budget });
  if (cellBad.length) {
    console.error(`\n❌ ${cellBad.length} ô lệch quá ${(budget.dps.fail_deviation * 100)}% so với baseline:`);
    for (const v of cellBad) console.error(`  - ${v.key}: baseline ${v.base} -> sim ${v.dps} (lệch ${v.dev}%)${v.reason ? " [" + v.reason + "]" : ""}`);
  } else {
    console.log(`  ✓ ${cells.length} ô trong ngưỡng ${(budget.dps.fail_deviation * 100)}% so với baseline`);
  }
  console.log(`  ngân sách: tổng +${(bres.total * 100).toFixed(1)}% / trần +${(bres.cap * 100).toFixed(0)}% (cảnh báo từ +${(bres.warnAt * 100).toFixed(0)}%)`);
  if (bres.fail) console.error(`❌ Tổng ngân sách vượt trần!`);
  else if (bres.warn) console.log(`  ⚠️ Tổng ngân sách đã vào vùng dự trữ`);
  else console.log(`  ✓ Tổng ngân sách trong giới hạn`);
  process.exit(ok ? 0 : 1);
}
