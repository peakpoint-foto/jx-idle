"use strict";
(function(){
  const SEARCH_ACTIVITIES=[
    {name:"Công thành",mode:"ctc",giftTab:"siege"},{name:"Tống Kim",mode:"ctc",giftTab:"tk"},
    {name:"Tháp",mode:"ctc",giftTab:"tower"},
    {name:"Hành trình sinh tồn",mode:"phlt",button:"expeditionOpen"},
    {name:"Bí cảnh biến chiêu",mode:"g2",button:"riftOpen"},
    {name:"Phòng luyện DPS",mode:"g2",button:"trainingPanel"},
    {name:"Thư viện build",mode:"g2",button:"buildLibraryOpen"},
    {name:"Thành tựu thử build",mode:"g2",button:"buildProgressionOpen"},
    {name:"Bàn chế tác",mode:"phlt",button:"wbOpen"},
    {name:"Tài nguyên",mode:"ctc",button:"resourceSummaryOpen"}
  ];
  const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("vi");
  function catalog(q){
    const needle=norm(q);if(!needle)return[];const out=[];
    for(const f of FACTIONS)for(const id of f.skills){const s=SK[id];if(s&&norm(s.n).includes(needle)&&!out.some(x=>x.kind==="skill"&&x.id===id))out.push({kind:"skill",id,name:s.n,detail:`Kỹ năng · ${f.n}`});}
    for(const [d,group] of (J.items||[]).entries())for(const row of group?.list||[])if(norm(row.n).includes(needle))out.push({kind:"item",name:row.n,detail:"Vật phẩm · xem trong Hành trang"});
    for(const a of SEARCH_ACTIVITIES)if(norm(a.name).includes(needle)&&(a.mode===modeId())&&(a.button?document.getElementById(a.button):typeof giftModal==='function'))out.push({kind:"activity",name:a.name,detail:`Hoạt động · ${MC().n}`,button:a.button,giftTab:a.giftTab});
    return out.slice(0,12);
  }
  function render(){
    const panel=document.querySelector("#t-more");if(!panel||panel.querySelector("#fieldSearch"))return;
    const box=document.createElement("section");box.className="card field-search";box.id="fieldSearch";box.setAttribute("role","search");
    box.innerHTML='<h3>Tìm nhanh <small>Kỹ năng · vật phẩm · hoạt động</small></h3><label for="fieldSearchInput" class="sr-only">Tìm trong trò chơi</label><input id="fieldSearchInput" type="search" maxlength="48" autocomplete="off" placeholder="Tên kỹ năng, vật phẩm, hoạt động…" aria-controls="fieldSearchResults"><div id="fieldSearchResults" aria-live="polite"></div>';
    panel.prepend(box);const input=box.querySelector("input"),results=box.querySelector("#fieldSearchResults");
    input.addEventListener("input",()=>{
      const rows=catalog(input.value);results.replaceChildren();
      if(!input.value.trim())return;
      if(!rows.length){results.textContent="Không tìm thấy trong chế độ hiện tại.";return;}
      for(const row of rows){const b=document.createElement("button");b.type="button";b.className="btn field-search-result";b.textContent=`${row.name} · ${row.detail}`;b.onclick=()=>{
        if(row.kind==="skill"){showTab("skill");const target=document.querySelector(`#t-skill [data-id="${row.id}"]`);if(target)target.scrollIntoView({block:"center"});}
        else if(row.kind==="item"){lootFilter().kw=row.name.slice(0,20);save();showTab("inv");}
        else{showTab("more");renderMore();if(row.giftTab){giftModal();document.querySelector(`#giftTabs [data-g="${row.giftTab}"]`)?.click();}else{const target=document.getElementById(row.button);if(target){target.scrollIntoView({block:"center"});target.click();}else toast("Tính năng hiện không khả dụng trong chế độ này");}}
      };results.append(b);}
    });
  }
  const original=renderMore;renderMore=function(){original.apply(this,arguments);render();};
  document.addEventListener("keydown",e=>{if(e.key!=="/"||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||""))return;e.preventDefault();if(!document.getElementById('fieldSearchInput')||document.getElementById('t-more')?.classList.contains('hidden'))showTab('more');const input=document.getElementById("fieldSearchInput");input?.focus();});
})();
