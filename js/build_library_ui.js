"use strict";
function buildLibraryModal() {
  try{buildLibraryGuard();}catch(e){toast(e.message);return;}
  const entries=buildLibraryEntries();
  modal(`<h3>Thư viện build · 2.0</h3><p class="dim small">Mã chỉ chứa điểm, kỹ năng, hotbar và recipe tham khảo. Đồ đang mặc được giữ; không nhập đồ/vàng/token. Lịch sử đo dùng đồ đang sở hữu tại thời điểm đo, không tạo đồ theo recipe.</p><div class="btnrow"><button class="btn sm" id="buildShareExport">Xuất build hiện tại</button><button class="btn sm" id="buildSharePreview">Xem trước mã</button></div><textarea id="buildShareCode" rows="4" maxlength="16384" aria-label="Mã build"></textarea><label>Tên trong thư viện<input id="buildShareLabel" maxlength="60" value="Build chia sẻ"></label><div id="buildShareSummary"></div><button class="btn sm" id="buildShareSave" disabled>Lưu mã đã kiểm tra</button>${entries.map((entry,index)=>`<div class="card"><b>${esc(entry.label)}</b><p>${(entry.measurements||[]).slice(-5).map(m=>`Seed ${m.parameters.seed} · ${m.elapsed.toFixed(1)}s · DPS ${m.dps.toFixed(1)} · ${esc(m.status)}`).join("<br>")||"Chưa đo"}</p><div class="btnrow"><button class="btn sm" data-library-apply="${index}">Áp dụng võ học</button><button class="btn sm" data-library-measure="${index}">Đo 30s, seed 42</button><button class="btn sm" data-library-code="${index}">Xem mã</button><button class="btn sm red" data-library-remove="${index}">Xóa</button></div></div>`).join("")}`,()=>{
    const get=id=>document.getElementById(id);let checked=null;
    const error=e=>{get("buildShareSummary").textContent=e.message;get("buildShareSave").disabled=true;checked=null;};
    get("buildShareCode").oninput=()=>{checked=null;get("buildShareSave").disabled=true;};
    get("buildShareExport").onclick=()=>{try{get("buildShareCode").value=buildShareExport();get("buildShareCode").oninput();}catch(e){error(e);}};
    get("buildSharePreview").onclick=()=>{try{checked=buildSharePreview(get("buildShareCode").value.trim());get("buildShareSummary").textContent=`Hợp lệ: DPS ước tính ${checked.summary.dps.toFixed(1)}, HP ${fmt(checked.summary.life)}, mana ${fmt(checked.summary.mana)}. ${Object.keys(checked.data.recipe).length} recipe tham khảo, không nhập trang bị.`;get("buildShareSave").disabled=false;}catch(e){error(e);}};
    get("buildShareSave").onclick=()=>{if(!checked)return;try{const result=buildLibraryAdd(checked.code,get("buildShareLabel").value);toast(result.msg);if(result.ok)buildLibraryModal();}catch(e){error(e);}};
    for(const [name,action] of [["apply",buildLibraryApply],["measure",buildLibraryMeasure],["remove",buildLibraryRemove]])document.querySelectorAll(`[data-library-${name}]`).forEach(button=>button.onclick=()=>{try{const result=action(+button.dataset["library"+name[0].toUpperCase()+name.slice(1)]);toast(result.msg);if(result.ok)buildLibraryModal();}catch(e){error(e);}});
    document.querySelectorAll("[data-library-code]").forEach(button=>button.onclick=()=>{get("buildShareCode").value=entries[+button.dataset.libraryCode].code;get("buildShareCode").oninput();});
  });
}
{
  const original=renderSkill;
  renderSkill=function(){const value=original.apply(this,arguments),panel=document.getElementById("t-skill");panel?.querySelector("#buildLibraryOpen")?.remove();
    if(panel&&featureEnabled("build_library")){panel.insertAdjacentHTML("beforeend",'<button class="btn" id="buildLibraryOpen">Thư viện và mã chia sẻ build · 2.0</button>');document.getElementById("buildLibraryOpen").onclick=buildLibraryModal;}
    return value;
  };
}
