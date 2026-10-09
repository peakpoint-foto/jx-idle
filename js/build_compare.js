"use strict";

function buildComparisonState(index) {
  if(index===-1)return JSON.parse(JSON.stringify(S));
  if(!buildIndexValid(index))throw new Error("Số bộ không hợp lệ");
  const preview=buildPreview(index);
  if(!preview.ok)throw new Error("Bộ "+(index+1)+": "+preview.errors.join("; "));
  return preview.candidate;
}

function buildCompare(a,b,input={}) {
  if(!featureEnabled("training_lab")||modeId()!=="g2")throw new Error("So sánh build chỉ mở trong phòng luyện 2.0");
  const parameters=trainingParameters(input);
  // Preflight both builds before simulating; never apply a candidate to the save.
  const states=[buildComparisonState(a),buildComparisonState(b)];
  const reports=states.map(state=>trainingRun(parameters,state));
  const metrics=["dps","usefulDamage","dotDamage","manaRemaining","healthLost","healthRecovered","mainStarvedSec","elapsed"];
  return {version:COMBAT_MODEL_VERSION,mode:"g2",parameters,labels:[a===-1?"Hiện tại":"Bộ "+(a+1),b===-1?"Hiện tại":"Bộ "+(b+1)],
    reports,delta:Object.fromEntries(metrics.map(key=>[key,reports[1][key]-reports[0][key]])),ranked:false,reward:{xp:0,gold:0,items:0},
    breakdowns:reports.map(trainingBreakdownHTML)};
}

function buildComparisonHTML(result) {
  const names={dps:"DPS hữu ích",usefulDamage:"Damage hữu ích",dotDamage:"Độc đã tick",manaRemaining:"Mana còn",
    healthLost:"HP đã mất",healthRecovered:"HP đã hồi",mainStarvedSec:"Giây thiếu mana",elapsed:"Giây sống / đo"};
  const p=result.parameters;
  return `<p class="dim small">Seed ${p.seed} · ${p.duration}s · ${p.targets} mục tiêu · HP ${p.hp} · phòng thủ ${p.def} · hệ ${esc(SERIES[p.series])} · ${esc(p.cls)} · mana đầu ${p.manaFraction*100}% · damage vào ${p.incomingDamage}/giây · kháng ${ELEM.map(e=>esc(e)+": "+p.res[e]+"%").join(", ")}<br>Chênh lệch = B − A; chỉ so sánh trong bài đo này, không dùng xếp hạng. Mana hồi theo thay đổi ròng.</p><div style="overflow-x:auto"><table><thead><tr><th>Chỉ số</th><th>A: ${esc(result.labels[0])}</th><th>B: ${esc(result.labels[1])}</th><th>B − A</th></tr></thead><tbody>${Object.entries(names).map(([key,name])=>`<tr><td>${name}</td><td>${result.reports[0][key].toFixed(2)}</td><td>${result.reports[1][key].toFixed(2)}</td><td>${result.delta[key].toFixed(2)}</td></tr>`).join("")}<tr><td>Kết thúc</td><td>${esc(result.reports[0].status)}</td><td>${esc(result.reports[1].status)}</td><td>Không thưởng</td></tr></tbody></table></div><div class="policy-grid"><div>${result.breakdowns[0]}</div><div>${result.breakdowns[1]}</div></div>`;
}
