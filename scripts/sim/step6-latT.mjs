// Sim Bước 6 — 3 mục còn thiếu của Lát T (chạy SAU khi có cast thật + Đồng hành).
// (a) Sát thương tự thân Đồng hành: đòn phẳng round(0,20 × P.basic.tot) mỗi nhịp
//     đánh của nhân vật, boss ×0,5 — đo tỉ lệ so với DPS proxy trên 30 ô
//     (10 phái × cấp 60/100/180, tier mid, theo mẫu sim Bước 3) rồi cộng với
//     ngân sách hiện có +31% và aura/charm +15% để kiểm tra trần POWER_BUDGET
//     (+150%, cảnh báo từ +112,5%).
// (b) Linh Phù theo cấp: bảng giả định bonus sát thương = 0,05 × cấp (1 charm
//     damage), chỉ ra cấp chạm cảnh báo và chạm trần — cơ sở cho quyết giữ % phẳng.
// (c) Hiệu năng Cơ Quan Phổ: thời gian đánh giá step6PickTrigger với 1 ô vs 3 ô
//     (cùng điều kiện đủ) trong harness, quyết mở 3 ô hay giữ 1 ô theo số đo.
// Chạy: node worker/build-game.mjs && node scripts/sim/step6-latT.mjs
import { game } from "../../test/helpers/game.mjs";
import { GAME } from "../../worker/gen/game.js";
import { writeFileSync } from "node:fs";

const LEVELS = [60, 100, 180];
const FEMALE = new Set(["emei", "cuiyan"]);
const EXISTING_BUDGET = 0.31, AURA_CHARM = 0.15, CAP = 1.5, WARN = 1.125;

function midSave(fac, lvl, seed) {
  const g = game(seed);
  g.run(`fixture('ctc',${lvl})`);
  g.run(`S.fac='${fac}';S.sk={};const st=FAC['${fac}'].starter;if(st){S.sk[st]=1;S.main=st;}`);
  g.run(`S.sex=${FEMALE.has(fac) ? 1 : 0};S.sexSet=1;`);
  g.run(`autoSpendAttrs();autoSpendSkills();`);
  g.run(`recalc()`);
  return g.json("S");
}
function calcParts(save) {
  GAME.setS(save);
  const P = GAME.calc();
  const parts = P && P.main && P.main.parts ? Object.values(P.main.parts).reduce((t, v) => t + v, 0) : 0;
  return { dps: parts * (P.main.rate || 0), basicTot: (P.basic && P.basic.tot) || 0, rate: P.main.rate || 0 };
}

// (a) Đồng hành.
const cells = [];
for (const fac of Object.keys(GAME.FAC)) for (const lvl of LEVELS) {
  const save = midSave(fac, lvl, 101);
  const { dps, basicTot, rate } = calcParts(save);
  const strike = Math.round(basicTot * 0.20);
  const compDps = strike * rate; // 1 đòn ké / nhịp đánh của nhân vật
  const ratioNormal = dps ? compDps / dps : 0;
  const ratioBoss = ratioNormal * 0.5;
  cells.push({ fac, lvl, baseDps: Math.round(dps), basicTot: +basicTot.toFixed(1), rate: +rate.toFixed(3),
    companionRatioNormal: +ratioNormal.toFixed(4), companionRatioBoss: +ratioBoss.toFixed(4),
    totalRatioNormal: +(1 + EXISTING_BUDGET + AURA_CHARM + ratioNormal).toFixed(4),
    totalRatioBoss: +(1 + EXISTING_BUDGET + AURA_CHARM + ratioBoss).toFixed(4) });
}
const maxNormal = Math.max(...cells.map(c => c.totalRatioNormal));
const maxBoss = Math.max(...cells.map(c => c.totalRatioBoss));
const maxCompRatio = Math.max(...cells.map(c => c.companionRatioNormal));

// (b) Linh Phù theo cấp (giả định 0,05 × cấp, chỉ charm damage cộng DPS).
const charmByLevel = [];
for (let lv = 1; lv <= 25; lv++) {
  const total = 1 + EXISTING_BUDGET + AURA_CHARM + 0.05 * lv;
  charmByLevel.push({ level: lv, charmDamageBonus: +(0.05 * lv).toFixed(2), totalRatio: +total.toFixed(3),
    overWarn: total > 1 + WARN, overCap: total > 1 + CAP });
}
const warnLevel = charmByLevel.find(r => r.overWarn)?.level ?? null;
const capLevel = charmByLevel.find(r => r.overCap)?.level ?? null;

// (c) Hiệu năng đánh giá trigger: 1 ô vs 3 ô, cùng điều kiện đủ (hp<=90%).
// LƯU Ý: Date.now trong VM của harness bị đóng băng (đo trong VM luôn ra 0ms),
// nên đo từ phía ngoài bằng performance.now của Node qua các lần g.run —
// con số gồm overhead gọi VM nên chỉ dùng để SO SÁNH 1 ô vs 3 ô, không phải
// chi phí tuyệt đối trong game thật. Pick dừng ở slot đủ điều kiện đầu tiên
// (theo priority) nên trường hợp mọi slot đều đủ thì 3 ô ≈ 1 ô.
function evalCost(nSlots) {
  const g = game();
  g.run("fixture('phlt',60)");
  g.run("npcSfx = () => {}; skillSfx = () => {}; skillFx = () => {}; dirOf = () => 0;");
  g.run("for (const id of FAC.shaolin.skills) S.sk[id]=1; recalc();");
  g.run("R.enemies=[{x:H.x+30,y:H.y,r:12,hp:1e9,def:0,series:0,res:{phys:0,poison:0,cold:0,fire:0,light:0},poison:0,poisonDmg:0,cls:'normal',act:'st',stun:0,stunImm:0,tid:0}];");
  const slots = Array.from({ length: nSlots }, (_, i) => ({ condition: "hp<=90%", skill: 11, priority: i + 1 }));
  g.run(`setFeatureFlags({trigger_deck:true}); step3EnsureDefaults(S); S.step3.trigger_deck.slots=${JSON.stringify(slots)}; R.life=R.P.life*0.5;`);
  const t0 = performance.now();
  for (let i = 0; i < 5000; i++) g.run("step6PickTrigger()");
  return performance.now() - t0;
}
const ms1 = evalCost(1), ms3 = evalCost(3);

const out = { cells, maxTotalRatioNormal: +maxNormal.toFixed(4), maxTotalRatioBoss: +maxBoss.toFixed(4),
  maxCompanionRatio: +maxCompRatio.toFixed(4), warnThreshold: 1 + WARN, capThreshold: 1 + CAP,
  charmByLevel, warnLevel, capLevel,
  evalMs: { slots1: +ms1.toFixed(1), slots3: +ms3.toFixed(1), calls: 5000, note: "gồm overhead g.run; chỉ dùng để so sánh 1 ô vs 3 ô" } };
writeFileSync(new URL("./step6-latT.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("Đồng hành: tỉ lệ tối đa", out.maxCompanionRatio, "| tổng tối đa thường", out.maxTotalRatioNormal, "| boss", out.maxTotalRatioBoss, "| ngưỡng cảnh báo", out.warnThreshold, "| trần", out.capThreshold);
console.log("Linh Phù theo cấp: chạm cảnh báo ở cấp", warnLevel, "| chạm trần ở cấp", capLevel);
console.log("Đánh giá trigger: 1 ô", ms1.toFixed(1), "ms / 5000 lần; 3 ô", ms3.toFixed(1), "ms / 5000 lần (gồm overhead g.run)");
