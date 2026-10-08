"use strict";
function buildProgressionModal(){
  if(!buildProgressionAllowed()){toast('Tiến trình build chỉ mở trong2.0');return;}
  let p;try{p=buildProgressionObserve();}catch(e){toast(e.message);return;}
  modal(`<section class="build-progression"><h3>Hành trình thử build ·2.0</h3><p>Khám phá nhiều trục, đo nhiều cấu hình và vượt các seed khác nhau.9thành tựu hữu hạn, chỉ ngoại hiệu local; không cộng điểm/kháng/vàng/đồ hoặc ranked CTC.</p>
    <p>Trục ${p.axes.length}/6 · build đã đo ${p.builds.length}/12 · seed hoàn thành ${p.seeds.length}/8</p>
    ${Object.entries(BUILD_ACHIEVEMENTS).map(([id,a])=>`<div class="qrow"><span>${esc(a.name)}<small>${a.kind==='build'?'Đo3mã build khác nhau trong phòng luyện':a.kind==='seed'?'Vượt5chặng ở3seed khác nhau':a.kind==='rift'?'Hoàn thành5chặng bí cảnh':'Vượt5chặng có modifier của trục này'}</small></span><button class="btn sm" data-build-ach="${id}" ${p.claims.includes(id)||!buildAchievementReady(id,p)?'disabled':''}>${p.claims.includes(id)?'Đã nhận':'Nhận ngoại hiệu'}</button></div>`).join('')}
    <h4>Đi nhanh đến hệ thống</h4><div class="btnrow">${riftAllowed()?'<button class="btn" data-build-route="rift">Bí cảnh / chọn trục</button><button class="btn" data-build-route="reset">Bắt đầu lại bí cảnh</button>':''}${featureEnabled('build_library')?'<button class="btn" data-build-route="library">Mã / thư viện build</button>':''}${featureEnabled('training_lab')?'<button class="btn" data-build-route="training">Phòng luyện / so sánh</button>':''}</div><p class="desc">Bắt đầu lại chỉ thay phiên bí cảnh. Trang bị, bộ sưu tập và thành tựu đã lưu được giữ. Xóa mẫu khỏi thư viện không xóa build đã khám phá.</p></section>`,()=>{
    document.querySelectorAll('[data-build-ach]').forEach(b=>b.onclick=()=>{const result=buildAchievementClaim(b.dataset.buildAch);toast(result.msg);buildProgressionModal();});
    document.querySelectorAll('[data-build-route]').forEach(b=>b.onclick=()=>{
      const route=b.dataset.buildRoute;
      if(route==='rift')return riftModal();
      if(route==='library')return buildLibraryModal();
      if(route==='training'){closeModal(true);document.querySelector('#tabs [data-t="skill"]').click();renderSkill();const panel=document.getElementById('trainingPanel');if(panel){panel.open=true;panel.scrollIntoView({block:'center'});}return;}
      if(route==='reset'&&confirm('Bắt đầu lại bí cảnh? Tiến trình, trang bị và bộ sưu tập khác được giữ.')){const result=buildProgressionReset(riftState()?.seed||42);toast(result.msg);if(result.ok)riftModal();}
    });
  });
}
{
  const original=renderMore;renderMore=function(){const out=original.apply(this,arguments);if(buildProgressionAllowed()){document.getElementById('t-more').insertAdjacentHTML('afterbegin','<button class="btn" id="buildProgressionOpen">Hành trình thử build ·2.0</button>');document.getElementById('buildProgressionOpen').onclick=buildProgressionModal;}return out;};
}
