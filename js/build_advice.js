"use strict";

const BUILD_GOALS={ctc:{boss:"DPS boss",farm:"Dọn quái",survival:"Sống sót"},phlt:{survival:"Kháng và sinh lực",mana:"Duy trì mana",boss:"DPS săn đồ"},g2:{boss:"DPS đơn mục tiêu",farm:"Combo nhiều mục tiêu",mana:"Thử sustain"}};
function adviceStats(state) {
  const previous=S;try{S=state;return calc(state.eq);}finally{S=previous;}
}
function adviceSummary(p) {
  return {dps:p.main.dps,targets:p.main.targets,life:p.life,mana:p.mana,regen:p.regen,manaRegen:p.manaRegen,
    minResistance:Math.min(...ELEM.map(e=>p.res[e])),main:p.main.id};
}
function adviceScore(p,goal) {
  if(goal==="survival")return p.life*(1+Math.max(-75,Math.min(75,Math.min(...ELEM.map(e=>p.res[e]))))/100)+p.regen*30;
  if(goal==="mana")return p.mana+30*p.manaRegen-30*p.main.cost*p.main.rate;
  return p.main.dps*(goal==="farm"?Math.min(8,p.main.targets):p.bossDmg);
}
function buildAdvice(goal) {
  if(!featureEnabled("build_advice")||!BUILD_GOALS[modeId()]?.[goal])throw new Error("Mục tiêu hoặc tính năng gợi ý chưa mở");
  const baseline=adviceStats(S),score=adviceScore(baseline,goal),results=[],rejected=[];
  const add=(label,state,source)=>{
    const stats=adviceStats(state),value=adviceScore(stats,goal);
    if(value>score+1e-8)results.push({label,source,score:value,gain:value-score,before:adviceSummary(baseline),after:adviceSummary(stats)});
  };
  for(let i=0;i<buildN();i++)if(S.builds?.[i]){
    const p=buildPreview(i);if(p.ok)add("Bộ "+(i+1),p.candidate,{kind:"profile",index:i});
    else rejected.push({label:"Bộ "+(i+1),reason:p.errors.join("; ")});
  }
  for(const item of S.inv) {
    const type=DETAIL_SLOT[item.d],fac=FAC[S.fac];
    if(!type||!modeItemOk(item,modeId())||!reqOk(item)||type==="weapon"&&fac.wcode>=0&&weaponCode({weapon:item})!==fac.wcode)continue;
    for(const slot of type==="ring"?["ring1","ring2"]:[type]) {
      if(S.eq[slot]?.locked)continue;
      const candidate=JSON.parse(JSON.stringify(S));
      candidate.eq[slot]=JSON.parse(JSON.stringify(item));
      // calc evaluates only currently activated hidden/set lines with this equipment.
      add(item.n+" · "+SLOT_VI[slot],candidate,{kind:"item",uid:item.uid,slot});
    }
  }
  results.sort((a,b)=>b.gain-a.gain||a.label.localeCompare(b.label));
  const graph=factionSkillGraph(S.fac,S),support=graph.filter(link=>link.active||link.status==="learnable"&&S.sk[link.target]>0);
  const weapon=weaponCode(S.eq),wrongWeapon=FAC[S.fac].wcode>=0&&weapon!==FAC[S.fac].wcode;
  return {mode:modeId(),goal,label:BUILD_GOALS[modeId()][goal],baseline:adviceSummary(baseline),results:results.slice(0,8),rejected,support,
    notes:["Điểm mục tiêu là ước tính, không phải kết quả trận hoặc build tối ưu toàn cục.",
      goal==="survival"?"Ưu tiên HP, hồi phục và kháng thấp nhất.":goal==="mana"?"Ước tính mana sau 30 giây chiêu chính; không mô phỏng hút mana/rotation.":goal==="farm"?"DPS chiêu chính × số mục tiêu, tối đa 8; phụ thuộc quái đứng trong vùng.":"DPS chiêu chính × hệ số boss.",
      wrongWeapon?"Vũ khí hiện tại khác vũ khí môn phái: kiểm tra nội tại bị mất hiệu lực.":"Gợi ý đồ chỉ nhận vũ khí đúng môn phái.",
      modeId()==="phlt"?"Giữ vật tư và kiểm tra kháng theo kẻ địch; đổi đồ không cấp hoặc tiêu vật tư.":"Không tự phân điểm hay mặc đồ."]};
}
function buildAdviceApply(goal,source) {
  const problem=buildChangeProblem();if(problem)return buildResult([problem]);
  const fresh=buildAdvice(goal).results.find(row=>JSON.stringify(row.source)===JSON.stringify(source));
  if(!fresh)return buildResult(["Gợi ý không còn hợp lệ; hãy xem lại trạng thái hiện tại"]);
  if(source.kind==="profile")return buildLoad(source.index);
  if(!featureEnabled("build_profiles"))return buildResult(["Bật tính năng build trang bị trước khi áp dụng"]);
  const profile={v:2,mode:modeId(),fac:S.fac,attr:{...S.attr},sk:{...S.sk},slots:(S.slots||[0,0,0,0]).slice(),main:S.main||0,mainLock:!!S.mainLock,rot:S.rot!==false,
    equipment:Object.fromEntries(Object.entries(S.eq).filter(([,it])=>it).map(([slot,it])=>[slot,it.uid]))};
  profile.equipment[source.slot]=source.uid;
  const preview=buildCandidate(profile);return preview.ok?buildPersist(preview.candidate):preview;
}
