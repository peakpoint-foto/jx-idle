"use strict";

function buildAdviceModal(goal) {
  let advice;try{advice=buildAdvice(goal);}catch(e){toast(e.message);return;}
  const stats=p=>`DPS ${p.dps.toFixed(1)} · HP ${fmt(p.life)} · mana ${fmt(p.mana)} · hồi mana ${p.manaRegen.toFixed(1)}/s · kháng thấp nhất ${p.minResistance}%`;
  modal(`<h3>Gợi ý · ${esc(advice.label)}</h3><p>${stats(advice.baseline)}</p><p class="dim small">${advice.notes.map(esc).join("<br>")}</p>${advice.results.map((row,i)=>`<div class="card"><b>${esc(row.label)}</b><p>${stats(row.before)} → ${stats(row.after)}</p><small>Điểm mục tiêu +${row.gain.toFixed(2)}</small><button class="btn sm" data-advice-apply="${i}">Áp dụng lựa chọn này</button></div>`).join("")||'<p>Chưa có bộ lưu hoặc trang bị trong túi cải thiện mục tiêu này.</p>'}<details><summary>Trục bổ trợ liên quan</summary>${advice.support.map(link=>`<p>${esc(link.sourceName)} → ${esc(link.targetName)}: ${link.percent}% · ${esc(link.reason||link.status)}</p>`).join("")||"Chưa có trục liên quan"}</details>${advice.rejected.length?`<details><summary>Bộ chưa dùng được</summary>${advice.rejected.map(row=>`<p>${esc(row.label)}: ${esc(row.reason)}</p>`).join("")}</details>`:""}`,()=>{
    document.querySelectorAll("[data-advice-apply]").forEach(button=>button.onclick=()=>{
      try{const result=buildAdviceApply(goal,advice.results[+button.dataset.adviceApply].source);toast(result.msg);if(result.ok){closeModal(true);renderSkill();}}
      catch(e){toast(e.message);}
    });
  });
}
{
  const original=renderSkill;
  renderSkill=function(){const value=original.apply(this,arguments),panel=document.getElementById("t-skill");
    panel?.querySelector("#buildAdvicePanel")?.remove();
    if(panel&&featureEnabled("build_advice")){
      panel.insertAdjacentHTML("beforeend",`<div class="card" id="buildAdvicePanel"><h3>Gợi ý theo mục tiêu</h3><div class="btnrow">${Object.entries(BUILD_GOALS[modeId()]).map(([key,name])=>`<button class="btn sm" data-advice-goal="${key}">${esc(name)}</button>`).join("")}</div></div>`);
      panel.querySelectorAll("[data-advice-goal]").forEach(button=>button.onclick=()=>buildAdviceModal(button.dataset.adviceGoal));
    }return value;
  };
}
