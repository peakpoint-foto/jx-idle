// Thư viện chạy mô phỏng cân bằng — mục 0.1 của DEPTH_ROADMAP.
// Ma trận: 10 phái × cấp 60/100/180 × build yếu/trung bình/mạnh, engine sessionCombatStep.
// Mọi ô dùng seed cố định -> cùng seed cho cùng kết quả (tiêu chí "xong" của 0.1).
import { game } from "../../test/helpers/game.mjs";
import { GAME } from "../../worker/gen/game.js";

export const SIM_LEVELS = [60, 100, 180];
export const SIM_TIERS = ["weak", "mid", "strong"];
export const SIM_MODE = "ctc";
// 3 seed mỗi ô, lấy trung bình để giảm nhiễu RNG trong trận ngắn.
const SIM_SEEDS = [101, 202, 303];
const FEMALE = new Set(["emei", "cuiyan"]);

export function factionKeys() {
  return Object.keys(GAME.FAC);
}

function cellSeed(fi, li, ti, si) {
  return (((fi * 131 + li * 17 + ti * 7 + si * 3 + 11) * 2654435761) >>> 0);
}

// Dựng save cho một ô: weak = đồ tân thủ + chưa cộng điểm;
// mid = weak + autoSpendAttrs/autoSpendSkills (logic phân bổ của game);
// strong = mid + 50 lượt rollDrops + autoEquipAll.
function buildSave(facKey, lvl, tier, seed) {
  const g = game(seed);
  g.run(`fixture('${SIM_MODE}',${lvl})`);
  g.run(`S.fac='${facKey}';S.sk={};const st=FAC['${facKey}'].starter;if(st){S.sk[st]=1;S.main=st;}`);
  g.run(`S.sex=${FEMALE.has(facKey) ? 1 : 0};S.sexSet=1;`);
  if (tier !== "weak") g.run(`autoSpendAttrs();autoSpendSkills();`);
  if (tier === "strong") {
    g.run(`for(let i=0;i<50;i++){const ds=rollDrops({L:S.lvl,cls:i%8===0?'boss':'elite',bonusDrop:1});` +
      `for(const d of ds||[])if(d&&S.inv.length<200)S.inv.push(d);}autoEquipAll(true);`);
  }
  g.run(`recalc()`);
  return g.json("S");
}

export function runCell(facKey, lvl, tier, seed) {
  const save = buildSave(facKey, lvl, tier, seed);
  GAME.setS(save);
  const P = GAME.calc();
  const actors = [0, 1].map(i => GAME.sessionActor("sim" + i, "Sim" + i, P, "damage"));
  let state = GAME.sessionCombatNew(SIM_MODE, actors, seed >>> 0);
  const ids = actors.map(a => a.id);
  while (state.status === "active" && state.tick < 480) {
    state = GAME.sessionCombatStep(state, [], ids);
  }
  const dmg = state.actors.reduce((t, a) => t + a.contribution.damage, 0);
  const time = Math.max(0.25, state.tick * 0.25);
  return { status: state.status, ticks: state.tick, dmg: Math.round(dmg), dps: dmg / time };
}

export function runCellAvg(facKey, lvl, tier, fi, li, ti) {
  const runs = SIM_SEEDS.map((_, si) => runCell(facKey, lvl, tier, cellSeed(fi, li, ti, si)));
  const dps = runs.reduce((t, r) => t + r.dps, 0) / runs.length;
  const ticks = Math.round(runs.reduce((t, r) => t + r.ticks, 0) / runs.length);
  return { fac: facKey, lvl, tier, dps: Math.round(dps), ticks, status: runs[0].status, seeds: runs.length };
}

export function runMatrix(onCell) {
  const facs = factionKeys();
  const out = [];
  facs.forEach((fac, fi) => {
    SIM_LEVELS.forEach((lvl, li) => {
      SIM_TIERS.forEach((tier, ti) => {
        const cell = runCellAvg(fac, lvl, tier, fi, li, ti);
        out.push(cell);
        if (onCell) onCell(cell);
      });
    });
  });
  return out;
}
