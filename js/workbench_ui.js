"use strict";
function workbenchModal(){
  const problem=workbenchProblem();if(problem){toast(problem);return;}
  R.workbenchUiPaused=true;
  const pool=S.inv.filter(it=>!it.locked&&!Object.values(S.eq).some(eq=>eq?.uid===it.uid)&&modeItemOk(it,modeId()));
  const ores=Object.keys(S.mats?.ore||{}),shards=Object.keys(S.mats?.shard||{}).filter(k=>Object.hasOwn(SHARD_NEEDS,k));
  modal(`<h3>Bàn chế tác an toàn · ${esc(MODES[modeId()].n||modeId())}</h3><p>Chỉ chọn đồ trong túi, chưa khóa/chưa mặc. Preview không tiêu gì; xác nhận mới xử lý và lưu một lần. Công thức có rủi ro native; không đảm bảo tiến độ.</p>
    <label>Công thức <select id="wbKind"><option value="recycle">Hợp3món → Huyền Tinh</option><option value="enhance">Cường hóa1món</option><option value="reroll">Tẩy lại dòng1món</option><option value="enchase">Khảm Tím1món</option><option value="upgradeHT">Thăng3Huyền Tinh</option><option value="buyHT">Mua Huyền Tinh</option><option value="upgradeOre">Thăng khoáng</option><option value="randomForge">Rèn ngẫu nhiên</option><option value="combineShards">Ghép mảnh Hoàng Kim</option>${MC().platina?'<option value="makePlatina">Chế2Hoàng Kim → Bạch Kim</option><option value="upgradePlatina">Thăng1Bạch Kim</option>':''}</select></label>
    <fieldset id="wbItems"><legend>Nguyên liệu sở hữu (tối đa3món)</legend>${pool.map(it=>`<label><input type="checkbox" data-wb-uid="${it.uid}"> ${esc(it.n)} · UID ${it.uid}</label>`).join('')||'<p>Không có đồ phù hợp.</p>'}</fieldset>
    <label>Cấp Huyền Tinh <input id="wbHt" type="number" min="1" max="10" value="1"></label>
    <label>Số HT mua <input id="wbQuantity" type="number" min="1" max="3" value="1"></label><label><input id="wbInsured" type="checkbox"> Bảo hiểm khi thăng HT (trả thêm phí/đá native)</label>
    <label>Khoáng / mảnh <select id="wbKey">${[...ores,...shards,...RF_MUC.map(x=>x.k)].map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></label>
    <div class="btnrow"><button class="btn" id="wbPreview">Xem chi phí</button>${WORKBENCH_PENDING?'<button class="btn" id="wbRetry">Thử lưu kết quả đã giữ</button><button class="btn" id="wbDiscard">Bỏ kết quả chưa lưu</button>':''}</div><div id="wbResult" role="status" aria-live="polite"></div>`,()=>{
      const output=document.getElementById('wbResult');
      document.getElementById('wbPreview').onclick=()=>{
        try{
          const p=workbenchPreview({kind:document.getElementById('wbKind').value,uids:[...document.querySelectorAll('#wbItems input:checked')].map(x=>Number(x.dataset.wbUid)),ht:Number(document.getElementById('wbHt').value),key:document.getElementById('wbKey').value,quantity:Number(document.getElementById('wbQuantity').value),insured:document.getElementById('wbInsured').checked});
          output.innerHTML=`<p>Tiêu ${fmt(p.cost)} lượng; ${p.materials.map(esc).join(', ')||'không thêm vật liệu'}; món: ${p.names.map(esc).join(', ')||'không dùng đồ'}. Thành công ${p.chance}%. ${esc(p.detail)} ${esc(p.note)}</p><button class="btn red" id="wbConfirm">Xác nhận chế tác</button>`;
          document.getElementById('wbConfirm').onclick=()=>{const r=workbenchExecute(p);if(r.pending){toast(r.msg);workbenchModal();}else{output.textContent=r.msg;refresh();}};
        }catch(e){output.textContent=e.message;}
      };
      const retry=document.getElementById('wbRetry');if(retry)retry.onclick=()=>{const r=workbenchRetry();toast(r.msg);workbenchModal();};
      const discard=document.getElementById('wbDiscard');if(discard)discard.onclick=()=>{workbenchDiscard();workbenchModal();};
    });
}
{
  const originalTick=tick,originalClose=closeModal;
  tick=function(dt){if(R.workbenchUiPaused&&featureEnabled('safe_workbench'))return;return originalTick(dt);};
  closeModal=function(){R.workbenchUiPaused=false;return originalClose.apply(this,arguments);};
  const oldForge=forgeModal,oldLab=htModal,oldAuto=autoForge;
  forgeModal=function(it){if(featureEnabled('safe_workbench'))return workbenchModal();return oldForge(it);};
  htModal=function(){if(featureEnabled('safe_workbench'))return workbenchModal();return oldLab();};
  autoForge=function(){if(featureEnabled('safe_workbench')){toast('Bàn chế tác đang mở: chọn công thức và xác nhận chi phí');return;}return oldAuto.apply(this,arguments);};
  const original=renderMore;
  renderMore=function(){original.apply(this,arguments);if(!featureEnabled('safe_workbench'))return;
    const tab=document.getElementById('t-more');tab.insertAdjacentHTML('afterbegin','<div class="card"><button class="btn" id="wbOpen">Bàn chế tác an toàn · preview và lưu giao dịch</button></div>');document.getElementById('wbOpen').onclick=workbenchModal;
  };
}
