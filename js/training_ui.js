"use strict";

let TRAINING_SESSION=null,TRAINING_TIMER=null;
function trainingStopTimer() { if(TRAINING_TIMER!=null)clearInterval(TRAINING_TIMER);TRAINING_TIMER=null; }
function trainingResultHTML(report) {
  return `<div class="card stats"><span>DPS hữu ích</span><span>${fmt(report.dps)}</span><span>Thời gian</span><span>${report.elapsed.toFixed(1)}s / ${report.parameters.duration}s</span><span>Damage hữu ích / thô</span><span>${fmt(report.usefulDamage)} / ${fmt(report.rawDamage)}</span><span>Độc đã tick</span><span>${fmt(report.dotDamage)}</span><span>Mana chiêu / hồi ròng</span><span>${fmt(report.manaSpent)} / ${fmt(report.manaRecovered)}</span><span>Mana mất ròng khi bị đánh</span><span>${fmt(report.incomingManaSpent)}</span><span>Mana còn lại</span><span>${fmt(report.manaRemaining)}</span><span>Thiếu mana chiêu chính</span><span>${report.mainStarvedSec.toFixed(1)}s</span><span>Đòn thường thay thế</span><span>${report.basicFallbacks}</span><span>Hồi HP hữu ích</span><span>${fmt(report.healthRecovered)}</span></div>${trainingBreakdownHTML(report)}<small class="dim">${report.support.length?report.support.map(link=>esc(link.sourceName)+" → "+esc(link.targetName)+": +"+link.percent+"%").join("<br>"):"Không có bổ trợ đang kích hoạt"}<br>Không nhận EXP, vàng hoặc đồ; kết quả không dùng xếp hạng.</small>`;
}
function trainingRefreshResult() {
  const result=document.getElementById("trainingResult"),pause=document.getElementById("trainingPause");
  if(!TRAINING_SESSION)return;
  if(result)result.innerHTML=trainingResultHTML(trainingReport(TRAINING_SESSION));
  if(pause){pause.textContent=TRAINING_SESSION.paused?"Tiếp tục":"Tạm dừng";pause.disabled=TRAINING_SESSION.status!=="running";}
}
function trainingStartTimer() {
  trainingStopTimer();
  TRAINING_TIMER=setInterval(()=>{
    if(!TRAINING_SESSION||TRAINING_SESSION.status!=="running"||!featureEnabled("training_lab")) {
      if(TRAINING_SESSION?.status==="running")TRAINING_SESSION.paused=true;trainingStopTimer();return;
    }
    if(TRAINING_SESSION.paused)return;
    try {trainingAdvance(TRAINING_SESSION,1);trainingRefreshResult();if(TRAINING_SESSION.status!=="running")trainingStopTimer();}
    catch(e){trainingStopTimer();toast(e.message);}
  },100);
}
function trainingPanelHTML() {
  return `<details class="card" id="trainingPanel"><summary>Phòng luyện có điều kiện cố định · 2.0</summary><div class="policy-grid"><label>Seed<input id="trainingSeed" type="number" min="0" max="4294967295" value="42"></label><label>Thời lượng (giây)<input id="trainingDuration" type="number" min="1" max="180" value="30"></label><label>Số mục tiêu<input id="trainingTargets" type="number" min="1" max="8" value="1"></label><label>HP mỗi mục tiêu<input id="trainingHp" type="number" min="1" max="1000000000" value="1000000"></label><label>Kháng mọi hệ (%)<input id="trainingResistance" type="number" min="-75" max="75" value="0"></label><label>Phòng thủ<input id="trainingDef" type="number" min="0" max="1000000" value="200"></label><label>Hệ mục tiêu<select id="trainingSeries">${SERIES.map((name,i)=>`<option value="${i}">${esc(name)}</option>`).join("")}</select></label><label>Loại mục tiêu<select id="trainingClass"><option value="normal">Mộc nhân</option><option value="boss">Boss đứng yên</option></select></label><label>Mana ban đầu (%)<input id="trainingMana" type="number" min="0" max="100" value="100"></label><label>Damage mục tiêu / đòn mỗi giây<input id="trainingIncoming" type="number" min="0" max="1000000" value="0"></label></div><div class="btnrow"><button class="btn sm" id="trainingStart">Bắt đầu</button><button class="btn sm" id="trainingPause" disabled>Tạm dừng</button><button class="btn sm" id="trainingRetry" ${TRAINING_SESSION?"":"disabled"}>Chạy lại cùng build</button></div><p class="dim small">Các mục tiêu đứng sát nhau, không di chuyển. Dùng rotation hiện tại; không dùng hệ số damage/god của admin. Lưu build trước khi so sánh.</p><hr><div class="policy-grid">${["A","B"].map(side=>`<label>Build ${side}<select id="compare${side}"><option value="-1">Hiện tại</option>${Array.from({length:buildN()},(_,i)=>`<option value="${i}">Bộ ${i+1}${S.builds?.[i]?"":" (trống)"}</option>`).join("")}</select></label>`).join("")}</div><button class="btn sm" id="compareStart">So sánh A/B cùng điều kiện</button><div id="compareResult"></div><div id="trainingResult">${TRAINING_SESSION?trainingResultHTML(trainingReport(TRAINING_SESSION)):""}</div></details>`;
}
function trainingBindPanel() {
  const get=id=>document.getElementById(id);
  const parameters=()=>({seed:+get("trainingSeed").value,duration:+get("trainingDuration").value,
    targets:+get("trainingTargets").value,hp:+get("trainingHp").value,resistance:+get("trainingResistance").value,
    def:+get("trainingDef").value,series:+get("trainingSeries").value,cls:get("trainingClass").value,
    manaFraction:+get("trainingMana").value/100,incomingDamage:+get("trainingIncoming").value});
  get("compareStart").onclick=()=>{
    try { get("compareResult").innerHTML=buildComparisonHTML(buildCompare(+get("compareA").value,+get("compareB").value,parameters())); }
    catch(e){get("compareResult").textContent=e.message;}
  };
  get("trainingStart").onclick=()=>{
    try {
      TRAINING_SESSION=trainingCreate({seed:+get("trainingSeed").value,duration:+get("trainingDuration").value,
        targets:+get("trainingTargets").value,hp:+get("trainingHp").value,resistance:+get("trainingResistance").value,
        def:+get("trainingDef").value,series:+get("trainingSeries").value,cls:get("trainingClass").value,
        manaFraction:+get("trainingMana").value/100,incomingDamage:+get("trainingIncoming").value});
      get("trainingRetry").disabled=false;trainingStartTimer();trainingRefreshResult();
    } catch(e){toast(e.message);}
  };
  get("trainingPause").onclick=()=>{if(TRAINING_SESSION){TRAINING_SESSION.paused=!TRAINING_SESSION.paused;if(!TRAINING_SESSION.paused&&TRAINING_SESSION.status==="running")trainingStartTimer();trainingRefreshResult();}};
  get("trainingRetry").onclick=()=>{
    if(!TRAINING_SESSION)return;
    try {TRAINING_SESSION=trainingCreate(TRAINING_SESSION.parameters,TRAINING_SESSION.state);trainingStartTimer();trainingRefreshResult();}
    catch(e){toast(e.message);}
  };
  trainingRefreshResult();
}
{
  const originalRender=renderSkill;
  renderSkill=function() {
    const result=originalRender.apply(this,arguments),panel=document.getElementById("t-skill");
    if(!panel)return result;
    panel.querySelector("#trainingPanel")?.remove();
    if(!featureEnabled("training_lab")){if(TRAINING_SESSION?.status==="running")TRAINING_SESSION.paused=true;trainingStopTimer();return result;}
    panel.insertAdjacentHTML("beforeend",trainingPanelHTML());trainingBindPanel();return result;
  };
}
