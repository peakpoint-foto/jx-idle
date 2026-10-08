"use strict";
function expeditionModal(){
  if(!expeditionAllowed()&&!expeditionActive()){toast("Hành trình chưa mở cho mode này");return;}
  const e=expeditionState(),active=e?.status==="active",blocked=!!R.expeditionBlocked;
  R.expeditionUiPaused=!!active;
  modal(`<h3>Hành trình PHLT</h3><p>Chuyến đi tùy chọn ba chặng, tách khỏi săn Hoàng Kim thường. Đồ mặc/kho lâu dài được giữ; sinh lực và nội lực chuyến đi riêng. Reload kết thúc chuyến đang dở, không tự tiếp tục hoặc nhận thưởng.</p>
    ${!featureEnabled('expedition_travel')&&!e?.travel?'<p class="dim">Bản hành trình nền chưa cấp loot/vàng/EXP; vật tư/đường rút/thưởng cần mở hành trình mở rộng.</p>':''}
    ${active?`<p>${esc({prepare:'Chuẩn bị',segment:'Đang vượt chặng',rest:'Điểm nghỉ',retreat:'Đang rút qua truy đuổi'}[e.phase])} · chặng ${e.segment}/3 · đã qua ${e.cleared}/3 · hạ ${e.kills} quái</p><p>Sinh lực ${fmt(e.life)}/${fmt(e.maxLife)} · nội lực ${fmt(e.mana)}/${fmt(e.maxMana)}</p>`:`<p>${e?.outcome?'Chuyến trước: '+esc(e.outcome):'Chưa có chuyến đang hoạt động'}</p>`}
    <div class="btnrow">${blocked?'<button class="btn" id="expRetry">Thử lưu lại</button>':active?`${['prepare','rest'].includes(e.phase)&&e.cleared<3?'<button class="btn" id="expDepart">Đi tiếp</button>':''}${e.cleared===3?'<button class="btn" id="expComplete">Kết thúc chuyến</button>':''}<button class="btn red" id="expWithdraw">Rút khỏi chuyến</button><button class="btn" id="expBack">Theo dõi chiến đấu</button>`:`<button class="btn" id="expPrepare" ${S.lvl<20?'disabled':''}>Chuẩn bị chuyến đi ${S.lvl<20?'(cấp 20)':''}</button>`}</div>`,
    ()=>{
      const bind=(id,fn)=>{const b=document.getElementById(id);if(b)b.onclick=()=>{const r=fn();if(!r.ok)toast(r.msg);expeditionModal();};};
      bind('expPrepare',expeditionPrepare);bind('expDepart',expeditionDepart);bind('expComplete',()=>expeditionFinish('completed'));bind('expWithdraw',()=>expeditionFinish('withdrawn'));bind('expRetry',expeditionRetrySave);
      const back=document.getElementById('expBack');if(back)back.onclick=()=>{closeModal(true);if(window.jxClosePanel)jxClosePanel();};
    });
}
{
  const originalClose=closeModal;
  closeModal=function(){R.expeditionUiPaused=false;return originalClose.apply(this,arguments);};
  const originalMore=renderMore;
  renderMore=function(){originalMore.apply(this,arguments);if(!expeditionAllowed()&&!expeditionActive())return;
    const tab=document.getElementById('t-more');tab.insertAdjacentHTML('afterbegin','<div class="card"><button class="btn" id="expeditionOpen">Hành trình sinh tồn PHLT</button><small>Chuyến đi tùy chọn; săn Hoàng Kim hiện có vẫn dùng như cũ.</small></div>');document.getElementById('expeditionOpen').onclick=expeditionModal;
  };
  const originalDraw=draw;
  let shown=null;
  draw=function(dt){const value=originalDraw(dt);
    let hud=document.getElementById('expeditionHud');
    if(!expeditionActive()){if(hud)hud.remove();shown=null;return value;}
    if(!hud){hud=document.createElement('details');hud.id='expeditionHud';hud.className='card';document.getElementById('battle').appendChild(hud);}
    const e=expeditionState(),key=e?.phase+'|'+e?.segment+'|'+R.expeditionBlocked;
    if(key!==shown){shown=key;hud.innerHTML=`<summary>PHLT · chặng ${e?.segment||0}/3 · ${R.expeditionBlocked?'lưu bị lỗi':esc(e?.phase||'cần phục hồi')}</summary><button class="btn" id="expeditionManage">Quản lý chuyến đi</button>`;document.getElementById('expeditionManage').onclick=expeditionModal;}
    return value;
  };
}
