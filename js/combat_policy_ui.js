"use strict";
{
  const original=renderSkill;
  renderSkill=function(){const value=original.apply(this,arguments),panel=document.getElementById("t-skill");
    panel?.querySelector("#combatPolicyPanel")?.remove();
    if(panel&&featureEnabled("combat_policy")){
      const current=combatPolicy();
      panel.insertAdjacentHTML("beforeend",`<details class="card" id="combatPolicyPanel"><summary>Chính sách tự chiến đấu</summary><label>Profile<select id="combatPolicyProfile">${Object.entries(COMBAT_POLICIES[modeId()]).map(([key,name])=>`<option value="${key}" ${current?.profile===key?"selected":""}>${esc(name)}</option>`).join("")}</select></label><label><input type="checkbox" id="combatPolicyControl" ${current?.reserveControl?"checked":""}> Giữ chiêu khống chế khi mục tiêu đã choáng/miễn nhiễm</label><p class="dim small">CTC ưu tiên mục tiêu/boss; PHLT giữ vật tư, không tự mua thuốc; 2.0 thử rotation. Buff/nội tại đã học được engine áp dụng liên tục theo vũ khí; không có lượt cast hoặc cooldown buff riêng. Điều khiển tay ưu tiên luồng hiện có. Thuốc vẫn chịu quota và HOT.</p><button class="btn sm" id="combatPolicySave">Lưu chính sách</button><p id="combatPolicyReason">${esc(R.policyReason?.reason||"Chưa có quyết định")}</p></details>`);
      document.getElementById("combatPolicySave").onclick=()=>{const result=combatPolicySave(document.getElementById("combatPolicyProfile").value,document.getElementById("combatPolicyControl").checked);toast(result.msg);if(result.ok)renderSkill();};
    }return value;
  };
  setInterval(()=>{const element=document.getElementById("combatPolicyReason");if(element)element.textContent=R.policyReason?.reason||"Chưa có quyết định";},500);
}
