// Sim Bước 3 — Khí Tràng / Linh Phù (chạy TRƯỚC khi code Lát T).
// Phương pháp (theo docs/POWER_BUDGET.md): đơn vị DPS = % so với build tham chiếu
// tier mid tại cấp 60/100/180, mode CTC; cách cộng dồn ADDITIVE trên base.
// Vì Khí Tràng/Linh Phù Bước 3 chỉ là các dòng bonus % (không sửa calc() của game
// thật), sim dùng DPS proxy từ calc(): sum(P.main.parts) * P.main.rate — cùng công
// thức riftPreview() dùng — rồi áp các số ứng viên theo mô hình cộng dồn và kiểm
// tra trần POWER_BUDGET (+150%, vùng cảnh báo từ +112,5%, ngân sách hiện tại +31%).
// Cross-check bằng engine thật: 3 ô mẫu chạy sessionCombatStep với P gốc và với
// P đã scale parts ×1,15 để xác nhận engine scale đúng ~+15% (không phải chỉ proxy).
// Chạy: node worker/build-game.mjs && node scripts/sim/step3-aura-charm.mjs
import { game } from "../../test/helpers/game.mjs";
import { GAME } from "../../worker/gen/game.js";

const LEVELS = [60, 100, 180];
const FEMALE = new Set(["emei", "cuiyan"]);
// Số ứng viên đưa vào sim (chưa khóa cho tới khi sim này xanh):
const CANDIDATE = { auraDamage: 0.10, charmDamage: 0.05 };
const EXISTING_BUDGET = 0.31, CAP = 1.5, WARN = 1.125;

function midSave(fac, lvl, seed) {
  const g = game(seed);
  g.run(`fixture('ctc',${lvl})`);
  g.run(`S.fac='${fac}';S.sk={};const st=FAC['${fac}'].starter;if(st){S.sk[st]=1;S.main=st;}`);
  g.run(`S.sex=${FEMALE.has(fac) ? 1 : 0};S.sexSet=1;`);
  g.run(`autoSpendAttrs();autoSpendSkills();`);
  g.run(`recalc()`);
  return g.json("S");
}
function calcDps(save) {
  GAME.setS(save);
  const P = GAME.calc();
  const parts = P && P.main && P.main.parts ? Object.values(P.main.parts).reduce((t, v) => t + v, 0) : 0;
  return parts * (P.main.rate || 0);
}
function sessionDps(save, scale, seed) {
  GAME.setS(save);
  const P = GAME.calc();
  if (scale !== 1) for (const k of Object.keys(P.main.parts)) P.main.parts[k] *= scale;
  const actors = [0, 1].map(i => GAME.sessionActor("sim" + i, "Sim" + i, P, "damage"));
  let state = GAME.sessionCombatNew("ctc", actors, seed >>> 0);
  const ids = actors.map(a => a.id);
  while (state.status === "active" && state.tick < 480) state = GAME.sessionCombatStep(state, [], ids);
  const dmg = state.actors.reduce((t, a) => t + a.contribution.damage, 0);
  return dmg / Math.max(0.25, state.tick * 0.25);
}

const facs = Object.keys(GAME.FAC);
const cells = [];
for (const fac of facs) for (const lvl of LEVELS) {
  const save = midSave(fac, lvl, 101);
  const base = calcDps(save);
  // +1 cấp kỹ năng chính: đo để đối chiếu với trần +1 cấp/dòng (xem báo cáo).
  const savePlus = JSON.parse(JSON.stringify(save));
  const main = save.main;
  if (main && savePlus.sk[main] != null) savePlus.sk[main] += 1;
  const plus = calcDps(savePlus);
  cells.push({ fac, lvl, baseDps: Math.round(base), plusOneLevelRatio: base ? +((plus / base - 1).toFixed(4)) : 0,
    withAuraCharm: Math.round(base * (1 + CANDIDATE.auraDamage + CANDIDATE.charmDamage)) });
}
// Cross-check engine thật: 3 ô mẫu, 1 seed.
const checks = [];
for (const [fac, lvl] of [["shaolin", 100], ["emei", 100], ["wudang", 100]]) {
  const save = midSave(fac, lvl, 202);
  const base = sessionDps(save, 1, 202), scaled = sessionDps(save, 1.15, 202);
  checks.push({ fac, lvl, base: Math.round(base), scaled: Math.round(scaled), ratio: +(scaled / base).toFixed(4) });
}
const worstNew = CANDIDATE.auraDamage + CANDIDATE.charmDamage;
const total = EXISTING_BUDGET + worstNew;
const result = { method: "POWER_BUDGET additive on calc() DPS proxy + sessionCombatStep cross-check",
  candidate: CANDIDATE, worstNew, existingBudget: EXISTING_BUDGET, total, cap: CAP, warn: WARN,
  withinCap: total <= CAP, withinWarn: total <= WARN, cells, sessionChecks: checks,
  plusOneLevel: { min: Math.min(...cells.map(c => c.plusOneLevelRatio)), max: Math.max(...cells.map(c => c.plusOneLevelRatio)) } };
console.log(JSON.stringify(result, null, 1));
import fs from "node:fs";
import { fileURLToPath } from "node:url";
fs.writeFileSync(fileURLToPath(new URL("./step3-aura-charm.json", import.meta.url)), JSON.stringify(result, null, 1));
if (!result.withinCap) process.exit(1);
