"use strict";
// UI observes server snapshots only: no client simulation, victory or inventory reward.
const PARTY_CLIENT={session:null,pending:null,busy:false,reading:false,readPromise:null,generation:0,error:"",retryAt:0,identity:null};
function partyIdentity(){const a=onlGet();return a?.token&&S?.mode==='ctc'?[a.token,S.cid||'',S.mode].join(':'):null;}
function partyPointer(value){
  const key=onlKey()+'_session';
  try{if(arguments.length){if(value)localStorage.setItem(key,JSON.stringify({v:1,cid:S.cid,id:value}));else localStorage.removeItem(key);return value;}
    const p=JSON.parse(localStorage.getItem(key)||'null');return p?.v===1&&p.cid===S.cid&&/^[A-Za-z0-9_-]{8,80}$/.test(p.id)?p.id:null;
  }catch(e){return null;}
}
function partyReset(){PARTY_CLIENT.generation++;PARTY_CLIENT.session=null;PARTY_CLIENT.pending=null;PARTY_CLIENT.error='';PARTY_CLIENT.retryAt=0;R.onlineSession=null;}
function partyAccept(data,identity){
  if(identity!==partyIdentity()||!featureEnabled('party_combat'))return false;
  const next=data?.session,current=PARTY_CLIENT.session;
  if(next&&(!next.id||next.mode!==S.mode||next.model!==COMBAT_MODEL_VERSION||next.rules!==SESSION_COMBAT.version||!Array.isArray(next.actors)||next.actors.length>4))throw Error('Phiên trận không tương thích');
  if(next&&current?.id===next.id&&next.revision<current.revision)return false;
  PARTY_CLIENT.session=next||null;R.onlineSession=next||null;
  if(next)partyPointer(next.id);PARTY_CLIENT.error='';PARTY_CLIENT.retryAt=0;partyRender();return true;
}
function partyPanelHTML(){
  const s=PARTY_CLIENT.session,me=onlGet()?.id;
  const error=PARTY_CLIENT.error?`<p class="bad" role="status">${esc(PARTY_CLIENT.error)} <button class="btn sm" data-party="retry">Thử lại</button></p>`:'';
  if(!s)return `<h4>Trận tổ đội CTC</h4><p>2–4 người đã sẵn sàng, chỉ chủ phòng bắt đầu. Trạng thái server cập nhật mỗi giây; có thể trễ khi mất mạng.</p><p>Thưởng công trạng server tối đa 1/phiên, chung cap 3/ngày UTC, ví30; cần đóng góp thực, người rời không nhận. Không cấp đồ hoặc lượng offline.</p><button class="btn" data-party="create" ${PARTY_CLIENT.busy?'disabled':''}>Bắt đầu trận tổ đội</button>${featureEnabled('party_dungeon')?`<button class="btn" data-party="dungeon" ${PARTY_CLIENT.busy?'disabled':''}>Vào phụ bản phá trận</button>`:''}${featureEnabled('party_siege')?`<button class="btn" data-party="siege" ${PARTY_CLIENT.busy?'disabled':''}>Công thành tổ đội</button>`:''}<button class="btn" data-party="refresh">Tìm phiên / kết nối lại</button>${error}`;
  const status={active:'Đang chiến đấu',completed:'Hoàn thành',aborted:'Kết thúc không thắng'};
  const dungeon=s.activity==='dungeon',siege=s.activity==='siege';
  return `<h4>${dungeon?'Phụ bản CTC · Phá trận':siege?'Công thành CTC · Chiếm điểm':'Trận tổ đội CTC'} · ${esc(status[s.status]||s.status)}</h4><small>Mã ${esc(s.id)} · nhịp ${s.tick} · bản ${s.revision} · tự đánh theo build đã chốt</small><p>Boss: ${Math.ceil(s.boss.hp)}/${Math.ceil(s.boss.max)}${dungeon&&s.boss.ward?' · kết trận đang dựng, cần 2 người phòng thủ':''}${siege?(s.boss.gate?' · cổng đóng, chủ tướng chỉ chịu 20% sát thương':' · cổng đã mở'):''}</p>${dungeon?`<p>Mục tiêu: phối hợp Phòng thủ để phá kết trận; hỗ trợ đồng đội tạo đóng góp hữu ích. Đã phá ${s.objectives?.breaks||0} kết trận.</p>`:''}${siege?`<p>Mục tiêu: chiếm đủ 3 điểm để mở cổng rồi hạ chủ tướng. Chiếm điểm và tiếp tế đều tính đóng góp; điểm chiếm dở tụt dần nếu không ai giữ.</p>${(s.objectives?.points||[]).map(p=>`<div class="qrow"><span><b>Điểm ${esc(String(p.id).toUpperCase())}</b> · ${p.owned?'Đã chiếm':Math.floor(p.progress)+'/'+p.need}</span>${s.status==='active'&&!p.owned?`<button class="btn" data-party="capture" data-target="${esc(p.id)}">Chiếm</button>`:''}</div>`).join('')}`:''}
    ${s.actors.map(a=>`<div class="qrow"><span><b>${esc(a.name)}</b> · ${a.withdrawn?'Đã rời':a.connected?'Kết nối':'Mất kết nối'}<small>HP ${Math.ceil(a.hp)}/${Math.ceil(a.maxHp)} · MP ${Math.ceil(a.mp)} · sát thương ${Math.floor(a.contribution.damage)}, hồi ${Math.floor(a.contribution.heal)}, chặn ${Math.floor(a.contribution.prevented)}${siege?`, chiếm ${Math.floor(a.contribution.capture||0)}, tiếp tế ${Math.floor(a.contribution.logistics||0)}`:''}</small></span>${s.status==='active'&&a.hp>0?`<button class="btn" data-party="support" data-target="${esc(a.id)}">Hỗ trợ</button>`:''}${siege&&s.status==='active'&&a.hp>0&&a.id!==me?`<button class="btn" data-party="supply" data-target="${esc(a.id)}">Tiếp tế</button>`:''}</div>`).join('')}
    ${s.status==='active'?'<p>Phòng thủ giảm sát thương 1 giây. Hỗ trợ hồi10% HP với5MP, hồi chiêu6 giây; chỉ tốn khi hồi hữu ích.</p><button class="btn" data-party="guard">Phòng thủ</button><button class="btn" data-party="leave">Rời phiên</button>':`<p>${s.reward?`Đã chốt thưởng: ${s.reward.amount} công trạng (${esc(s.reward.day)})`:'Chưa chốt thưởng'}</p>${s.status==='completed'&&!s.reward?'<button class="btn" data-party="claim">Nhận công trạng</button>':''}<button class="btn" data-party="dismiss">Đóng kết quả</button>`}
    <button class="btn" data-party="refresh">Cập nhật</button>${error}<details><summary>Diễn biến gần đây</summary>${(s.events||[]).slice(-8).map(e=>`<p>${esc(e.kind)} · ${esc(e.sourceId||'')} → ${esc(e.targetId||'')} · ${Math.round(e.useful||0)}</p>`).join('')}</details>`;
}
function partyRender(){
  let box=document.getElementById('onlineSessionPanel');
  if(!featureEnabled('party_combat')||!partyIdentity()){if(box)box.remove();return;}
  if(PARTY_CLIENT.identity!==partyIdentity()){partyReset();PARTY_CLIENT.identity=partyIdentity();}
  const host=document.getElementById('t-more');if(!host)return;
  if(!box){box=document.createElement('section');box.id='onlineSessionPanel';box.className='card party-session';host.prepend(box);}
  const target=box.querySelector('details')?.open;box.innerHTML=partyPanelHTML();const details=box.querySelector('details');if(details)details.open=!!target;
  box.querySelectorAll('[data-party]').forEach(b=>{b.disabled=PARTY_CLIENT.busy;b.onclick=()=>{
    const action=b.dataset.party;
    if(action==='dismiss'){partyPointer(null);partyReset();partyRender();return;}
    if(action==='refresh')return partyPoll(true);
    if(action==='retry')return PARTY_CLIENT.pending?partyWrite():partyPoll(true);
    if(action==='leave'&&!confirm('Rời phiên sẽ không nhận thưởng. Tiếp tục?'))return;
    return partyWrite(action,b.dataset.target);
  };});
}
async function partyPoll(force=false){
  const identity=partyIdentity();
  if(!identity||!featureEnabled('party_combat')){partyReset();partyRender();return;}
  if(PARTY_CLIENT.identity!==identity){partyReset();PARTY_CLIENT.identity=identity;}
  if(PARTY_CLIENT.reading){if(force){await PARTY_CLIENT.readPromise?.catch(()=>{});return partyPoll(true);}return;}
  if(!force&&(document.visibilityState==='hidden'||Date.now()<PARTY_CLIENT.retryAt))return;
  PARTY_CLIENT.reading=true;
  const generation=PARTY_CLIENT.generation;
  try{const id=PARTY_CLIENT.session?.id||partyPointer();PARTY_CLIENT.readPromise=onlApi('/sessions'+(id?'?id='+encodeURIComponent(id):''));const data=await PARTY_CLIENT.readPromise;if(generation===PARTY_CLIENT.generation)partyAccept(data,identity);}
  catch(e){if(identity===partyIdentity()){
    if(e.error==='session_not_found'||e.code==='session_not_found'){partyPointer(null);partyReset();}
    PARTY_CLIENT.error=e.msg||e.message||'Mất kết nối; bản trận giữ trên server';PARTY_CLIENT.retryAt=Date.now()+3000;partyRender();
  }}finally{PARTY_CLIENT.reading=false;PARTY_CLIENT.readPromise=null;}
}
async function partyWrite(action,target){
  const identity=partyIdentity();if(!identity||!featureEnabled('party_combat')||PARTY_CLIENT.busy)return;
  if(PARTY_CLIENT.identity!==identity){partyReset();PARTY_CLIENT.identity=identity;}
  const s=PARTY_CLIENT.session;
  if(action){
    if(PARTY_CLIENT.pending){PARTY_CLIENT.error='Lệnh trước chưa xác nhận; hãy thử lại trước khi gửi lệnh mới';partyRender();return;}
    const body=['guard','support','attack','capture','supply'].includes(action)?{action:'command',id:s?.id,seq:s?.next_seq,tick:(s?.tick||0)+1,kind:action,target:target||'boss'}:action==='create'||action==='dungeon'||action==='siege'?{action:'create',id:crypto.randomUUID().replaceAll('-',''),...(action==='dungeon'?{activity:'dungeon'}:action==='siege'?{activity:'siege'}:{})}:{action,id:s?.id};
    if(action==='create'||action==='siege')partyPointer(body.id);
    PARTY_CLIENT.pending={identity,body};
  }
  const pending=PARTY_CLIENT.pending;if(!pending||pending.identity!==identity)return;
  PARTY_CLIENT.generation++;PARTY_CLIENT.busy=true;partyRender();
  try{const d=await onlApi('/sessions',{body:pending.body});if(identity!==partyIdentity())return;
    PARTY_CLIENT.pending=null;partyAccept(d,identity);if(d.left){partyPointer(null);partyReset();}
  }catch(e){if(identity===partyIdentity()){
    const code=e.error||e.code;
    // Definite server rejection can be refreshed; a lost acknowledgement retains the exact command.
    if(['command_window','command_conflict','session_locked','session_actor_inactive','session_reward_unavailable','session_not_ready','feature_disabled','bad_session_command','siege_quota_used'].includes(code))PARTY_CLIENT.pending=null;
    PARTY_CLIENT.error=code==='siege_quota_used'?'Tuần UTC này đội đã công thành (mỗi người 1 lần mỗi tuần). Phiên bị hủy sẽ được hoàn lượt.':e.msg||e.message||'Chưa xác nhận lệnh; thử lại cùng mã để tránh gửi trùng';
  }}finally{PARTY_CLIENT.generation++;PARTY_CLIENT.busy=false;partyRender();}
}
{
  const original=renderMore;renderMore=function(){const r=original.apply(this,arguments);partyRender();return r;};
  const originalTick=tick;tick=function(dt){if(PARTY_CLIENT.session?.status==='active'||PARTY_CLIENT.pending?.body.action==='create')return;return originalTick(dt);};
}
setInterval(()=>{if(partyIdentity()&&featureEnabled('party_combat'))partyPoll();else if(PARTY_CLIENT.session){partyReset();partyRender();}},1000);
