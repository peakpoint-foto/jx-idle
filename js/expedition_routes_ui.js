"use strict";
{
  const original=expeditionModal;
  expeditionModal=function(){
    original();if(!featureEnabled("expedition_routes")||!expeditionTravelEnabled())return;
    const body=document.getElementById("mBody"),e=expeditionState();
    if(e?.status==="active"){
      const r=expeditionRouteRules(e);if(r)body.insertAdjacentHTML("beforeend",`<p>Đã chốt: ${esc(r.name)}${e.travel.route.contract?" · Hợp đồng truy kích":""}. Vàng/chặng ${fmt(expeditionGoldPerSegment(e))}; tối đa ${r.loot} món/chuyến. Không đổi đường giữa chuyến.</p>`);
      // 2.12: ngã rẽ trong chuyến — chọn nhánh mỗi ngã.
      if(typeof expeditionDailyForks==="function"){
        const forks=expeditionDailyForks(),chosen=e.travel?.forks||{};
        const html=forks.map(f=>{const c=chosen[f.id];return `<div class="card"><b>${esc(f.name)}</b><br>${f.branches.map(b=>`<label class="qrow"><input type="radio" name="fork_${f.id}" value="${b.id}" ${c?.branch===b.id?"checked":""}><span><b>${esc(b.name)}</b> <small>${esc(b.desc)}</small></span></label>`).join("")}</div>`}).join("");
        body.insertAdjacentHTML("beforeend",`<h4>Ngã rẽ hôm nay (chung mọi người)</h4>${html}<div class="btnrow"><button class="btn sm" id="expForkSave">Chốt ngã rẽ</button></div>`);
        document.getElementById("expForkSave").onclick=()=>{
          for(const f of forks){const el=document.querySelector(`input[name="fork_${f.id}"]:checked`);if(el)expeditionChooseFork(f.id,el.value);}
          toast("Đã chốt ngã rẽ");expeditionModal();
        };
      }
      return;
    }
    body.insertAdjacentHTML("beforeend",'<div class="card"><label>Đường đi <select id="expRoute"><option value="shelter">Đường trú ẩn</option><option value="salvage">Đường phế tích</option></select></label><label><input id="expContract" type="checkbox"> Hợp đồng truy kích (chỉ phế tích): HP quái +25%, đòn quái +20%, vàng/chặng từ45% lên50% phí</label><div id="expRoutePreview"></div></div>');
    const route=document.getElementById("expRoute"),contract=document.getElementById("expContract");
    const preview=()=>{
      contract.disabled=route.value!=="salvage";if(contract.disabled)contract.checked=false;
      const p=expeditionRoutePreview(route.value,contract.checked),r=p.rules;
      document.getElementById("expRoutePreview").innerHTML=`<p>Phí ${fmt(p.cost)}; vàng ${fmt(p.goldPerSegment)}/chặng, tối đa ${fmt(p.goldPerSegment*3)}/chuyến; tối đa ${r.loot} món. Máu quái ×${r.hp}, đòn ×${r.damage}. Quái: ${p.enemies.map(esc).join(", ")}; cấp ${p.level} đến ${p.level+2}, chặng cuối có elite. Địa hình: ${r.hazards.map(x=>({fire:"Lửa",cold:"Hàn trận",mana:"Hao MP"}[x])).join(" → ")}.</p><p>${esc(p.loot)} ${esc(p.control)}</p><p>Ưu tiên kháng và hồi sinh lực/nội lực. ${p.gear?[...p.gear.survival.results.slice(0,2),...p.gear.mana.results.slice(0,2)].map(x=>esc(x.label)).join("; ")||"Chưa có món sở hữu cải thiện mục tiêu.":"Bật gợi ý build để so sánh đồ đang sở hữu."} Gợi ý là ước tính; tự đổi đồ trước khi xuất phát.</p>`;
    };
    route.onchange=contract.onchange=preview;preview();
    const prepare=document.getElementById("expPrepare");if(prepare)prepare.onclick=()=>{const result=expeditionPrepare({route:route.value,contract:contract.checked});if(!result.ok)toast(result.msg);expeditionModal();};
  };
}
