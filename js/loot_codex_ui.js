"use strict";
function lootCodexModal(raw) {
  let codex;try{codex=lootCodex();}catch(e){toast(e.message);return;}
  const saved=S.extensions?.lootWishlist;
  raw=raw||(saved?.v===1&&saved.mode===modeId()&&saved.fac===S.fac?saved.filter:lootWishlistForGoal(Object.keys(BUILD_GOALS[modeId()])[0]));
  modal(`<h3>Cẩm nang săn đồ · ${esc(MC().short)}</h3><p class="dim">${esc(codex.note)}</p>${codex.sources.map(source=>`<div class="card"><b>${esc(source.name)}</b><p>${source.rarities.map(r=>RAR_VI[r]).join(" / ")} · ${esc(source.detail)}</p><small>${esc(source.reference)}</small></div>`).join("")}<h3>Wishlist theo thuộc tính</h3><div class="policy-grid"><label>Mục tiêu<select id="wishlistGoal">${Object.entries(BUILD_GOALS[modeId()]).map(([key,name])=>`<option value="${key}">${esc(name)}</option>`).join("")}</select></label><button class="btn sm" id="wishlistPreset">Gợi ý tiêu chí</button><label>Rarity tối thiểu<select id="wishlistRarity">${RAR_VI.slice(0,MC().rarMax+1).map((name,r)=>`<option value="${r}" ${raw.minRar===r?"selected":""}>${esc(name)}</option>`).join("")}</select></label><label>Kết hợp<select id="wishlistRuleMode"><option value="any" ${raw.ruleMode==="any"?"selected":""}>OR: một dòng đạt</option><option value="all" ${raw.ruleMode==="all"?"selected":""}>AND: tất cả đạt</option></select></label></div><label><input type="checkbox" id="wishlistActive" ${raw.activeOnly?"checked":""}> Chỉ dòng đang kích hoạt khi mặc</label>${raw.rules.map((rule,i)=>`<div class="policy-grid"><select data-wishlist-attr="${i}" aria-label="Thuộc tính ${i+1}">${LOOT_RULE_ATTRS.map(([attr,name])=>`<option value="${attr}" ${rule.attr===attr?"selected":""}>${esc(name)}</option>`).join("")}</select><input type="number" min="0.01" max="100000" step="any" data-wishlist-min="${i}" value="${rule.min}" aria-label="Ngưỡng ${i+1}"></div>`).join("")}<div class="btnrow"><button class="btn sm" id="wishlistPreview">Xem số món khớp</button><button class="btn sm" id="wishlistSave">Lưu wishlist</button><button class="btn sm" id="wishlistApply">Áp dụng vào bộ lọc loot</button></div><p id="wishlistSummary" class="dim">Wishlist chỉ lọc nhặt đồ; không bán, tái chế hoặc tự thay trang bị khóa. Wishlist khác mode/phái phải tạo lại.</p>`,()=>{
    const get=id=>document.getElementById(id),read=()=>({minRar:+get("wishlistRarity").value,ruleMode:get("wishlistRuleMode").value,activeOnly:get("wishlistActive").checked,
      rules:[...document.querySelectorAll("[data-wishlist-attr]")].map((el,i)=>({attr:el.value,min:+document.querySelector(`[data-wishlist-min="${i}"]`).value}))});
    const run=fn=>{try{const result=fn();get("wishlistSummary").textContent=result.msg;}catch(e){get("wishlistSummary").textContent=e.message;}};
    get("wishlistPreset").onclick=()=>lootCodexModal(lootWishlistForGoal(get("wishlistGoal").value));
    get("wishlistSave").onclick=()=>run(()=>lootWishlistSave(read()));
    get("wishlistApply").onclick=()=>run(()=>lootWishlistApply());
    get("wishlistPreview").onclick=()=>run(()=>{
      const filter=lootWishlistPreview(read()).filter,previous=S.lootF;
      try{S.lootF=filter;return {msg:`Khớp ${S.inv.filter(it=>modeItemOk(it,modeId())&&lootMatch(it)).length}/${S.inv.length} món đang sở hữu. Chưa áp dụng bộ lọc.`};}finally{S.lootF=previous;}
    });
  });
}
{
  const original=renderSkill;
  renderSkill=function(){const value=original.apply(this,arguments),panel=document.getElementById("t-skill");panel?.querySelector("#lootCodexOpen")?.remove();
    if(panel&&featureEnabled("loot_codex")){panel.insertAdjacentHTML("beforeend",'<button class="btn" id="lootCodexOpen">Cẩm nang nguồn rơi và wishlist</button>');document.getElementById("lootCodexOpen").onclick=()=>lootCodexModal();}
    return value;
  };
}
