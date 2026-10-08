"use strict";
function phaseBossHudRefresh() {
  let element=document.getElementById("phaseBossHud");const boss=phaseBossCurrent();
  if(!boss){element?.remove();return;}
  if(!element){element=document.createElement("details");element.id="phaseBossHud";element.className="card";element.innerHTML='<summary></summary><p></p><button class="btn sm red" id="phaseBossAbort">Rút lui khỏi encounter</button>';document.getElementById("battle").appendChild(element);document.getElementById("phaseBossAbort").onclick=()=>{phaseBossAbort();phaseBossHudRefresh();};}
  const state=boss.phaseBoss;const warning=state.warning?` · Rời vòng nguy hiểm (${Math.max(0,state.warning.left).toFixed(1)}s)`:"";
  element.querySelector("summary").textContent=`Trận kỳ của trùm · Pha ${state.phase}${warning}`;
  element.querySelector("p").textContent=`${boss.regen>state.baseRegen?"Phá trận kỳ để ngắt hồi trùm. ":"Hồi trùm đã ngắt. "}Damage hữu ích ${fmt(state.damage)} · hồi hữu ích ${fmt(state.healing)} · CC ${state.control.toFixed(1)}s. Vai trò theo build, mọi phái có thể phá kỳ. Tự chiến đấu tránh vòng; điều khiển tay tự chọn đường.`;
}
{
  const original=draw;
  draw=function(dt){const result=original.apply(this,arguments),boss=phaseBossCurrent(),warning=boss?.phaseBoss.warning;
    if(warning){const c=CX;c.save();c.setTransform(DPR,0,0,DPR,-Math.round(CAM.x)*DPR,-Math.round(CAM.y)*DPR);c.fillStyle="#ff413133";c.strokeStyle="#ffb03a";c.lineWidth=3;c.setLineDash([8,5]);c.beginPath();c.arc(warning.x,warning.y,warning.radius,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);c.fillStyle="#fff";c.font="bold 14px sans-serif";c.textAlign="center";c.fillText("RỜI VÙNG NGUY HIỂM",warning.x,warning.y-warning.radius-8);c.restore();}
    return result;
  };
  setInterval(phaseBossHudRefresh,100);
  const journal=jrModal;
  jrModal=function(){const value=journal.apply(this,arguments);
    if(modeId()==="ctc"&&featureEnabled("phased_boss")&&R.phaseBossResult){
      document.getElementById("mBody").insertAdjacentHTML("beforeend",'<button class="btn" id="phaseBossReport">Đóng góp trận kỳ vừa xong</button>');
      document.getElementById("phaseBossReport").onclick=()=>{const r=R.phaseBossResult;modal(`<h3>Trận kỳ · ${esc(r.outcome)}</h3><p>Vai trò từ build: ${r.roles.map(esc).join(" / ")||"Chưa có"}</p><div class="card stats"><span>Damage hữu ích</span><span>${fmt(r.damage)}</span><span>Hồi hữu ích nhận</span><span>${fmt(r.healing)}</span><span>CC quan sát</span><span>${r.control.toFixed(1)}s</span><span>Phá trận kỳ</span><span>${r.broken}</span></div><p class="dim small">Đây là encounter solo; hồi phục là của nhân vật hiện tại, không phải chữa đồng đội. Trận kỳ không có loot/EXP; boss dùng phần thưởng hạ quái hiện có. Rút lui/gục không thưởng thắng. Tổng kết này giữ trong phiên, báo cáo trận đầy đủ xem trong Sổ tay.</p>`);};
    }return value;
  };
}
