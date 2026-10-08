"use strict";
{
  const originalModal=expeditionModal;
  expeditionModal=function(){
    originalModal();
    if(!expeditionAllowed()&&!expeditionActive())return;
    const body=document.getElementById('mBody'),state=expeditionTravelState();
    if(state){
      const {e,t}=state;
      body.insertAdjacentHTML('beforeend',`<div class="card"><b>Vật tư và đường rút</b><p>Phí đã trả ${fmt(t.cost)} lượng. Thuốc HP ${e.supplies.life}/2, MP ${e.supplies.mana}/2; hồi chung ${Math.ceil(t.cd)}s. Thuốc chuyến đi riêng, không trừ kho thường.</p><p>Đang mang: ${fmt(t.gold)} lượng, ${t.items.length} món. Qua mỗi chặng: +${fmt(expeditionGoldPerSegment(e))} lượng, có thể nhặt đồ theo nguồn rơi elite. Chỉ rút an toàn hoặc đủ 3 chặng nhận thưởng; gục/reload mất phần mang theo, không hoàn phí.</p><p>Chặng 1: vòng lửa; chặng 2: hàn trận giảm tốc25%; chặng 3: bão hao MP. Vòng cảnh báo1,5giây, rời vòng để tránh. Khi rút trong chiến đấu, đi tới vòng xanh và giữ3giây; truy đuổi bắt đầu sau2giây. Auto tìm đường rút, manual tự điều khiển.</p>${e.status==='active'?`<div class="btnrow"><button class="btn" id="expLife">Thuốc HP (${e.supplies.life})</button><button class="btn" id="expMana">Thuốc MP (${e.supplies.mana})</button>${e.phase==='rest'?'<button class="btn" id="expRest">Nghỉ sức (+20% HP/MP, một lần/chặng)</button>':''}</div>`:''}</div>`);
      const bind=(id,fn)=>{const b=document.getElementById(id);if(b)b.onclick=()=>{const result=fn();if(!result.ok)toast(result.msg);expeditionModal();};};
      bind('expLife',()=>expeditionUseSupply('life'));bind('expMana',()=>expeditionUseSupply('mana'));bind('expRest',expeditionRest);
    }else if(featureEnabled('expedition_travel')){
      const plan=expeditionTravelPlan(R.P||calc());
      body.insertAdjacentHTML('beforeend',`<p>Phí chuẩn bị: ${fmt(plan.cost)} lượng, gồm2thuốc HP (${esc(plan.travel.potionNames.life)}) và2thuốc MP (${esc(plan.travel.potionNames.mana)}). Phí trả một lần khi chuẩn bị; không hoàn khi gục/rút sớm/reload. Qua chặng rồi rút tại điểm nghỉ hoặc qua đủ3chặng để chốt phần mang theo.</p>`);
    }
  };
  const originalDraw=draw;
  draw=function(dt){
    const result=originalDraw(dt),state=expeditionTravelState();if(!state||!expeditionActive())return result;
    const {e,t}=state,c=CX;
    c.save();c.setTransform(DPR,0,0,DPR,-Math.round(CAM.x)*DPR,-Math.round(CAM.y)*DPR);
    const circle=(x,y,r,color,label)=>{c.fillStyle=color+'22';c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=color;c.font='12px sans-serif';c.textAlign='center';c.fillText(label,x,y-r-6);};
    if(t.hazard)circle(t.hazard.x,t.hazard.y,t.hazard.r,'#ffad45',e.elapsed<t.hazard.warnUntil?'CẢNH BÁO · rời vòng':({fire:'Lửa',cold:'Hàn trận',mana:'Bão nội lực'}[t.hazard.kind]));
    if(e.phase==='retreat'&&t.escape){
      circle(t.escape.x,t.escape.y,t.escape.r,'#65ee9b','Điểm rút · '+Math.min(3,t.escape.hold).toFixed(1)+'/3s');
      c.strokeStyle='#65ee9b';c.setLineDash([8,8]);c.beginPath();c.moveTo(H.x,H.y);c.lineTo(t.escape.x,t.escape.y);c.stroke();c.setLineDash([]);
    }
    c.restore();return result;
  };
}
