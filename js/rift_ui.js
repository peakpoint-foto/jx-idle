"use strict";
function riftModal(){
  if(!riftAllowed()){toast('Bí cảnh chưa mở trong chế độ này');return;}
  const focused=document.activeElement?.dataset?.rift,focusedKey=document.activeElement?.dataset?.key;
  const r=riftState(),active=r?.status==='active';
  const choices=active&&r.phase==='choice'&&r.cleared<5?riftChoices(r.seed,r.cleared,r.modifiers):[];
  const live=R.riftRun;
  modal(`<section id="riftModal"><h3>Bí cảnh biến chiêu ·2.0</h3><p>5chặng, mỗi chặng chọn một modifier tạm thời. Tối đa2lần mỗi loại; không sửa võ công/trang bị gốc. Thưởng huy hiệu local, không điểm/vàng/đồ hoặc ranked.</p>
    ${r?`<p>Seed ${r.seed} · đã qua ${r.cleared}/5 · ${esc(r.outcome||r.phase)}${live?` · HP ${Math.ceil(live.runtime.life)} · còn ${live.runtime.enemies.filter(e=>e.hp>0).length} mục tiêu`:''}</p><p>${r.modifiers.map(k=>esc(RIFT_MODIFIERS[k].name)).join(' · ')}</p>`:''}
    ${choices.map(k=>`<button class="btn rift-choice" data-rift="choose" data-key="${k}"><b>${esc(RIFT_MODIFIERS[k].name)}</b><small>${esc(RIFT_MODIFIERS[k].note)}</small></button>`).join('')}
    ${active?`<button class="btn" data-rift="pause">${R.riftPaused?'Tiếp tục':'Tạm dừng'}</button><button class="btn" data-rift="exit">Rút / kết thúc</button>${R.riftBlocked?'<button class="btn" data-rift="retry">Thử lưu / kết thúc lại</button>':''}`:'<label>Seed <input id="riftSeed" type="number" min="0" max="4294967295" value="42"></label><button class="btn" data-rift="start">Bắt đầu / chơi lại</button>'}
    <button class="btn" data-rift="refresh">Cập nhật</button><small>Reload kết thúc interrupted, không thưởng thắng. HP/mana giữa chặng được giữ; thế giới ngoài bí cảnh tạm dừng. Ngừng khi quá60giây/chặng.</small></section>`,()=>{
    document.querySelectorAll('[data-rift]').forEach(b=>b.onclick=()=>{
      const a=b.dataset.rift;let result;
      if(a==='start')result=riftPrepare(Number(document.getElementById('riftSeed').value));
      if(a==='choose')result=riftChoose(b.dataset.key);
      if(a==='exit')result=riftFinish('withdrawn');
      if(a==='retry')result=riftFinish(riftState()?.cleared===5?'completed':'interrupted');
      if(a==='pause')R.riftPaused=!R.riftPaused;
      if(result&&!result.ok)toast(result.msg);riftModal();
    });
    if(focused)document.querySelector(`[data-rift="${focused}"]${focusedKey?`[data-key="${focusedKey}"]`:''}`)?.focus();
  });
}
setInterval(()=>{if(!document.getElementById('riftModal'))return;if(!riftAllowed()){closeModal(true);return;}if(!document.getElementById('riftSeed'))riftModal();},1000);
{
  const original=renderMore;renderMore=function(){const r=original.apply(this,arguments);if(riftAllowed()){document.getElementById('t-more').insertAdjacentHTML('afterbegin','<button class="btn" id="riftOpen">Bí cảnh biến chiêu ·2.0</button>');document.getElementById('riftOpen').onclick=riftModal;}return r;};
}
