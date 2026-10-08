"use strict";

const COMBAT_TIMELINE_MAX=128,COMBAT_HISTORY_MAX=5,COMBAT_HISTORY_BYTES=64*1024;
function combatActivity() { return SV.on?"survival":S.siege?"siege":R.tower?"tower":R.tk?"tk":"farm"; }
function combatTrace() {
  if(R.training || !S?.fac)return null;
  if(R.town){if(R.combatTrace)R.combatTrace.partial=true;return null;}
  if(!featureEnabled("combat_reports")) {if(R.combatTrace)R.combatTrace.partial=true;return null;}
  const key=S.cid||S.fac;
  if(R.combatTrace && R.combatTrace.character===key && R.combatTrace.mode===modeId() && R.combatTrace.fac===S.fac && R.combatTrace.activity!==combatActivity()) {
    R.combatTrace.partial=true;combatFinish("interrupted");
  }
  if(!R.combatTrace||R.combatTrace.mode!==modeId()||R.combatTrace.fac!==S.fac||R.combatTrace.character!==key) {
    R.combatTrace={v:1,model:COMBAT_MODEL_VERSION,mode:modeId(),fac:S.fac,character:key,activity:combatActivity(),
      started:Date.now(),elapsed:0,events:[],dropped:0,partial:false,totals:{},
      stats:{life:SV.on?SV.maxhp:R.P?.life||0,mana:SV.on?0:R.P?.mana||0,mainId:SV.on?SV.main||0:R.P?.main?.id||0}};
  }
  return R.combatTrace;
}
function combatRecord(kind,data={}) {
  const trace=combatTrace();if(!trace)return;
  let event;
  try {event=combatEvent(kind,{...data,mode:trace.mode,at:trace.elapsed});} catch(e) {trace.dropped++;trace.partial=true;return;}
  const direction=data.targetId==="player"?"incoming":"outgoing",key=kind+":"+direction+":"+(data.reason||"").slice(0,40);
  if(!trace.totals[key] && Object.keys(trace.totals).length>=64) {trace.partial=true;return;}
  const total=trace.totals[key]||(trace.totals[key]={kind,direction,reason:String(data.reason||"").slice(0,40),raw:0,useful:0,excess:0,count:0,duration:0});
  total.count++;total.raw+=event.raw||0;total.useful+=event.useful||0;total.excess+=event.excess||0;total.duration+=event.duration||0;
  trace.events.push(event);if(trace.events.length>COMBAT_TIMELINE_MAX){trace.events.shift();trace.dropped++;}
}
function combatReportHistory() {
  const store=S.extensions?.combatReports;
  if(store?.v!==1||!Array.isArray(store.history))return [];
  return store.history.filter(report=>report && typeof report==="object" && isMode(report.mode) && FAC[report.fac] &&
    Number.isFinite(report.elapsed)&&report.elapsed>=0 && Array.isArray(report.events) &&
    report.totals && typeof report.totals==="object" && !Array.isArray(report.totals) &&
    Object.values(report.totals).every(total=>total&&typeof total==="object"&&Number.isFinite(total.useful)&&Number.isFinite(total.raw)));
}
function combatFinish(outcome) {
  const trace=R.combatTrace;if(!trace || R.training || !featureEnabled("combat_reports"))return null;
  const report=JSON.parse(JSON.stringify(trace));delete report.character;
  report.outcome=outcome;report.finished=Date.now();
  const death=report.events.filter(event=>event.kind==="death"&&event.targetId==="player").at(-1);
  const incoming=report.events.filter(event=>event.kind==="damage"&&event.targetId==="player"&&event.useful>0).at(-1);
  report.deathReason=death&&incoming&&incoming.at===death.at&&incoming.reason?.endsWith("_fatal")?{sourceId:incoming.sourceId||"enemy",reason:incoming.reason,at:incoming.at}:null;
  if(!S.extensions)S.extensions={v:1};
  const existing=S.extensions.combatReports;
  if(!existing || existing.v===1) {
    const history=[report,...combatReportHistory()].slice(0,COMBAT_HISTORY_MAX);
    const bytes=()=>new TextEncoder().encode(JSON.stringify(history)).length;
    while(history.length>1&&bytes()>COMBAT_HISTORY_BYTES)history.pop();
    while(history[0].events.length&&bytes()>COMBAT_HISTORY_BYTES){history[0].events.shift();history[0].dropped++;history[0].partial=true;}
    S.extensions.combatReports={v:1,history};
  }
  R.combatTrace=null;return report;
}
function combatDiagnosticExport(index=0,options={}) {
  const report=combatReportHistory()[index];if(!report)throw new Error("Chưa có báo cáo trận");
  const output={v:1,model:report.model,mode:report.mode,fac:report.fac,activity:report.activity,outcome:report.outcome,
    elapsed:report.elapsed,partial:!!report.partial,dropped:Number(report.dropped)||0,totals:Object.values(report.totals).map(total=>({
      kind:String(total.kind||"").slice(0,20),direction:total.direction==="incoming"?"incoming":"outgoing",reason:String(total.reason||"").slice(0,40),
      raw:Number(total.raw)||0,useful:Number(total.useful)||0,excess:Number(total.excess)||0,count:Number(total.count)||0,duration:Number(total.duration)||0})),
    deathReason:report.deathReason?{sourceId:String(report.deathReason.sourceId||"").slice(0,100),reason:String(report.deathReason.reason||"").slice(0,100),at:Number(report.deathReason.at)||0}:null};
  if(options.timeline===true)output.events=report.events.flatMap(event=>{
    try {const clean=combatEvent(event.kind,{...event,capacity:event.useful||0});clean.version=report.model;return [clean];} catch(e){return [];}
  });
  if(options.stats===true)output.stats={life:Number(report.stats?.life)||0,mana:Number(report.stats?.mana)||0,mainId:Number(report.stats?.mainId)||0};
  return JSON.stringify(output,null,2);
}
function combatModeSummary(report) {
  const totals=Object.values(report.totals),sum=(kind,field,reason,direction)=>totals.filter(t=>t.kind===kind&&(!reason||t.reason===reason)&&(!direction||t.direction===direction)).reduce((n,t)=>n+(Number(t[field])||0),0);
  if(report.mode==="ctc")return `CTC · Khống chế thực ${sum('control','duration',null,'outgoing').toFixed(2)}s · Damage gây ra hữu ích ${fmt(sum('damage','useful',null,'outgoing'))} · Hồi phục nhận hữu ích ${fmt(sum('heal','useful',null,'incoming'))}`;
  if(report.mode==="phlt")return `PHLT · Mana dùng chiêu ${fmt(sum('mana','useful','skill_spend'))} · Mana shield ${fmt(sum('mana','useful','shield_spend'))} · HP từ thuốc ${fmt(sum('heal','useful','potion'))}`;
  return `2.0 · Độc đã tick ${fmt(sum('damage','useful','dot_tick','outgoing')+sum('damage','useful','survival_dot_tick','outgoing'))} · Damage gây ra dư ${fmt(sum('damage','excess',null,'outgoing'))} · Model ${esc(report.model)}`;
}
function combatTimelineHTML(report) {
  const rows=report.events.filter(event=>event&&COMBAT_EVENT_KINDS.includes(event.kind)&&Number.isFinite(event.at)).map(event=>
    `<div class="row"><small>${event.at.toFixed(2)}s · ${esc(event.kind)} · ${esc(event.sourceId||'—')} → ${esc(event.targetId||'—')}${event.skillId?" · "+esc(SK[event.skillId]?.n||event.skillId):""} · ${event.duration!=null?Number(event.duration).toFixed(2)+"s":event.useful!=null?fmt(event.useful)+" hữu ích / "+fmt(event.raw)+" thô":esc(event.reason||'')}</small></div>`).join("");
  return `<details class="card report-timeline"><summary>Timeline gần nhất (${report.events.length} event)</summary>${rows}</details>`;
}
function combatReportsModal() {
  const history=combatReportHistory(),labels={ctc:"Công Thành Chiến",phlt:"Phong Hỏa Liên Thành",g2:"2.0"};
  const rows=history.map((r,i)=>`<details class="card"><summary>${esc(labels[r.mode]||r.mode)} · ${esc(r.activity)} · ${esc(r.outcome)} · ${r.elapsed.toFixed(1)}s</summary><p class="dim">${combatModeSummary(r)}</p><div class="card stats">${Object.values(r.totals).map(t=>`<span>${esc(t.kind+" / "+t.direction+" / "+t.reason)}</span><span>${fmt(t.useful)} hữu ích · ${fmt(t.excess)} dư</span>`).join("")}</div><p class="dim">${r.deathReason?"Gục sau damage từ "+esc(r.deathReason.sourceId)+" ("+esc(r.deathReason.reason)+")":"Không đủ event để kết luận nguyên nhân gục"}${r.partial?" · Có khoảng không được thu thập":""} · ${r.dropped} event cũ/lỗi không còn trong timeline</p>${combatTimelineHTML(r)}<label><input type="checkbox" data-report-timeline="${i}"> Kèm timeline</label><label><input type="checkbox" data-report-stats="${i}"> Kèm chỉ số tổng hợp</label><button class="btn sm" data-report-export="${i}">Xuất chẩn đoán</button></details>`).join("");
  modal(`<h3>Báo cáo trận</h3><p class="dim">Bộ nhớ tối đa 5 báo cáo / 64 KB. Không tự gửi dữ liệu. ${featureEnabled("combat_reports")?"Đang ghi nhận event.":"Tính năng ghi event đang tắt; báo cáo cũ được giữ."}</p>${rows||'<p class="dim">Chưa có trận đã kết thúc.</p>'}`,()=>{
    document.querySelectorAll("[data-report-export]").forEach(button=>button.onclick=()=>{
      const index=+button.dataset.reportExport,timeline=document.querySelector(`[data-report-timeline="${index}"]`).checked,
        stats=document.querySelector(`[data-report-stats="${index}"]`).checked;
      const text=combatDiagnosticExport(index,{timeline,stats});
      modal(`<h3>Chẩn đoán đã chọn</h3><p class="dim">Sao chép nếu muốn gửi; không chứa save, token, tên hoặc cid.</p><textarea readonly rows="12" style="width:100%;box-sizing:border-box">${esc(text)}</textarea>`);
    });
  });
}

{
  const originalHit=heroHit;
  heroHit=function(attack,enemy) {
    const hp=Math.max(0,enemy.hp),mana=R.mana,stun=enemy.stun||0;
    const raw=originalHit(attack,enemy);
    combatRecord("damage",{sourceId:"player",targetId:"enemy",skillId:attack.id||0,raw,capacity:hp,reason:"direct"});
    if(R.P.manaLeech&&raw>0)combatRecord("mana",{sourceId:"player",targetId:"player",raw:raw*R.P.manaLeech/100,capacity:Math.max(0,R.P.mana-mana),reason:"leech_recover"});
    if(enemy.stun>stun && enemy.hp>0)enemy.combatStunSkill=attack.id||0;
    return raw;
  };
  const originalStatus=tickEnemyStatuses;
  tickEnemyStatuses=function(enemy,dt) {
    const hp=Math.max(0,enemy.hp),result=originalStatus(enemy,dt);
    R.dmgRaw=(R.dmgRaw||0)+result.raw;R.dmgUseful=(R.dmgUseful||0)+result.useful;
    if(result.healed)combatRecord("heal",{sourceId:"enemy",targetId:"enemy",raw:result.healed,capacity:result.healed,reason:"regen"});
    if(result.raw)combatRecord("damage",{sourceId:"player",targetId:"enemy",raw:result.raw,capacity:hp+result.healed,element:"poison",reason:"dot_tick"});
    return result;
  };
  const originalHeal=heal;
  heal=function(raw,quiet) {const capacity=Math.max(0,R.P.life-R.life),result=originalHeal(raw,quiet);combatRecord("heal",{sourceId:"player",targetId:"player",raw,capacity,reason:"heal"});return result;};
  const originalGuard=heroGuard;
  heroGuard=function(damage) {const mana=R.mana,result=originalGuard(damage);if(mana>R.mana)combatRecord("mana",{sourceId:"player",targetId:"player",raw:mana-R.mana,capacity:mana,reason:"shield_spend"});return result;};
  const wrapIncoming=(original,reason)=>function(enemy) {
    const life=R.life,hp=enemy.hp,result=original(enemy);
    if(life>R.life)combatRecord("damage",{sourceId:enemy.tid==null?"enemy":"npc_"+enemy.tid,targetId:"player",raw:life-R.life,capacity:Math.max(0,life),reason:reason+(R.life<=0?"_fatal":"")});
    if(enemy.hp<hp)combatRecord("damage",{sourceId:"player",targetId:"enemy",raw:hp-enemy.hp,capacity:Math.max(0,hp),reason:"retaliation"});
    return result;
  };
  enemyHit=wrapIncoming(enemyHit,"hit");bossUlt=wrapIncoming(bossUlt,"boss_ult");
  const originalAI=enemyAI;
  enemyAI=function(enemy,dt){const stun=enemy.stun||0,result=originalAI(enemy,dt);if(stun>0&&enemy.hp>0)combatRecord("control",{sourceId:"player",targetId:"enemy",skillId:enemy.combatStunSkill||0,duration:Math.min(stun,dt),reason:"stun_tick"});return result;};
  const originalDeath=heroDeath;
  heroDeath=function(){combatRecord("death",{targetId:"player",reason:"hp_zero"});combatFinish("defeated");return originalDeath();};
  const originalTick=tick;
  tick=function(dt){const trace=combatTrace(),dead=R.deadT>0;if(trace&&!R.town&&!dead)trace.elapsed+=dt;const result=originalTick(dt);if(dead&&R.deadT<=0)combatRecord("phase",{reason:"revived"});return result;};
  const originalPotion=autoPotion;
  autoPotion=function(dt){const h=R.hot||{},life=R.life,mana=R.mana,rawLife=h.lifeT>0?h.life*Math.min(dt,h.lifeT):0,rawMana=h.manaT>0?h.mana*Math.min(dt,h.manaT):0,result=originalPotion(dt);
    if(rawLife)combatRecord("heal",{sourceId:"player",targetId:"player",raw:rawLife,capacity:Math.max(0,R.P.life-life),reason:"potion"});
    if(rawMana)combatRecord("mana",{sourceId:"player",targetId:"player",raw:rawMana,capacity:Math.max(0,R.P.mana-mana),reason:"potion_recover"});return result;};
  const originalWave=waveCleared;
  waveCleared=function(){combatRecord("phase",{reason:"wave_cleared"});if(combatActivity()==="farm")combatFinish("wave_cleared");return originalWave();};
  const wrapExit=(original,active)=>function(dead,won){if(active())combatFinish(won?"won":dead?"defeated":"aborted");return original(dead,won);};
  towerExit=wrapExit(towerExit,()=>!!R.tower);tkExit=wrapExit(tkExit,()=>!!R.tk);siegeExit=wrapExit(siegeExit,()=>!!S.siege);
  const originalJournal=jrModal;
  jrModal=function(){originalJournal();const body=document.getElementById("mBody");body.insertAdjacentHTML("beforeend",'<button class="btn" id="combatReportsOpen">Báo cáo trận</button>');document.getElementById("combatReportsOpen").onclick=combatReportsModal;};
  const originalSurvivalDamage=svDamage;
  svDamage=function(enemy,raw,id,noElem){const hp=Math.max(0,enemy.hp),result=originalSurvivalDamage(enemy,raw,id,noElem);combatRecord("damage",{sourceId:"player",targetId:"enemy",skillId:id,raw,capacity:hp,reason:"survival_direct"});return result;};
  const originalSurvivalHit=svEnemyHit;
  svEnemyHit=function(enemy,def){const hp=SV.hp,result=originalSurvivalHit(enemy,def);if(SV.hp<hp)combatRecord("damage",{sourceId:"npc_"+enemy.tid,targetId:"player",raw:hp-SV.hp,capacity:Math.max(0,hp),reason:"survival_hit"+(SV.hp<=0?"_fatal":"")});return result;};
  const originalSurvivalTick=svTick;
  svTick=function(dt){if(SV.on&&!SV.over&&!SV.paused&&!SV.choosing){const trace=combatTrace();if(trace)trace.elapsed+=dt;}return originalSurvivalTick(dt);};
  const originalSurvivalEnd=svEnd;
  svEnd=function(win){if(SV.on&&!SV.over){if(!win&&SV.hp<=0)combatRecord("death",{targetId:"player",reason:"survival_hp_zero"});combatFinish(win?"won":"defeated");}return originalSurvivalEnd(win);};
  const originalSurvivalExit=svExit;
  svExit=function(){if(SV.on&&!SV.over)combatFinish("aborted");return originalSurvivalExit();};
}
