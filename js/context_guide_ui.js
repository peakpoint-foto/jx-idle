"use strict";
function contextGuideOpen(id) {
  const hint=contextGuide().find(h=>h.id===id);if(!hint){toast("Gợi ý không còn đủ điều kiện");return;}
  if(["boss","mana","farm"].includes(hint.action))return buildAdviceModal(hint.action);
  if(hint.action==="codex")return lootCodexModal();
  if(hint.action==="library")return buildLibraryModal();
  if(hint.action==="report")return combatReportsModal();
  if(hint.action==="activities")return openGiftTab("siege");
  if(["online","guild"].includes(hint.action)){showTab("more");renderMore();document.getElementById(hint.action==="guild"?"onlGuildPanel":"t-more")?.scrollIntoView({block:"center"});return;}
  showTab("skill");renderSkill();
  const panel=document.getElementById({skills:"skillGraph",policy:"combatPolicyPanel",training:"trainingPanel"}[hint.action]);
  if(panel){panel.open=true;panel.scrollIntoView({block:"center"});}
}
function contextGuidePanel(panel) {
  panel.querySelector(".context-guide")?.remove();if(!featureEnabled("context_guide"))return;
  const hints=contextGuide();
  panel.insertAdjacentHTML("afterbegin",`<details class="card context-guide"><summary>Việc tiếp theo · ${esc(MC().short)}</summary>${hints.map(h=>`<div class="card"><b>${esc(h.title)}</b><p>${esc(h.detail)}</p><div class="btnrow"><button class="btn sm" data-guide-open="${h.id}">Mở màn liên quan</button><button class="btn sm" data-guide-done="${h.id}">Đã hiểu</button></div></div>`).join("")||'<p>Đã xem các gợi ý hiện đủ điều kiện. Gợi ý mới xuất hiện khi mở tính năng hoặc đủ điều kiện.</p>'}</details>`);
  panel.querySelectorAll("[data-guide-open]").forEach(button=>button.onclick=()=>contextGuideOpen(button.dataset.guideOpen));
  panel.querySelectorAll("[data-guide-done]").forEach(button=>button.onclick=()=>{const result=contextGuideComplete(button.dataset.guideDone);toast(result.msg);if(result.ok)contextGuidePanel(panel);});
}
{
  const skill=renderSkill,more=renderMore;
  renderSkill=function(){const value=skill.apply(this,arguments),panel=document.getElementById("t-skill");if(panel)contextGuidePanel(panel);return value;};
  renderMore=function(){const value=more.apply(this,arguments),panel=document.getElementById("t-more");if(panel)contextGuidePanel(panel);return value;};
}
