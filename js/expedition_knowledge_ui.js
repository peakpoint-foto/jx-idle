"use strict";
{
  const original=expeditionModal;
  expeditionModal=function(){
    original();const view=expeditionKnowledgeView();if(!view)return;
    const body=document.getElementById("mBody");
    if(view.unsupported){body.insertAdjacentHTML("beforeend",'<p>Tri thức thuộc phiên bản khác hoặc chưa hợp lệ; giữ nguyên dữ liệu, chưa ghi thêm.</p>');return;}
    body.insertAdjacentHTML("beforeend",`<details class="card" id="expKnowledge"><summary>Tri thức hành trình · ${view.checkpoints.length}/6 mốc · ${view.completed.length}/2 đường hoàn tất</summary><p>Đủ 3 chặng mở cả 3 mốc và mục tra cứu của đường. Gục sau chặng đã qua chỉ giữ mốc đầu; rút/reload không mở mốc. Mốc chỉ là thông tin và dấu kỷ niệm, không cộng chỉ số hoặc vật liệu.</p><p>${view.cosmetics.map(x=>esc(x.label)).join("; ")||"Chưa mở dấu chặng."}</p>${view.recipes.map(x=>`<p><b>${esc(x.name)}</b>: ${esc(x.detail)}</p>`).join("")}${view.enemies.map(x=>`<p>${esc(x.name)} · trần kháng template ${x.resistance.map(v=>Number(v)||0).join("/")}. ${esc(x.note)}</p>`).join("")}<b>Nhật ký tài nguyên (10 chuyến gần nhất)</b>${view.journal.map(x=>`<p>${esc(EXPEDITION_ROUTES[x.route].name)} · ${esc(x.outcome)} · chặng ${x.cleared}/3: phí ${fmt(x.fee)}, mang về ${fmt(x.banked)} lượng/${x.items} món, mất phần mang ${fmt(x.lostGold)} lượng/${x.lostItems} món.</p>`).join("")||"<p>Chưa có chuyến đã chốt.</p>"}</details>`);
  };
}
