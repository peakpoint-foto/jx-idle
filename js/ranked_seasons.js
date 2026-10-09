"use strict";
// C08 client: server-owned ranked-season standings and cosmetic titles. Nothing here changes stats, resources or the save.
const SEASON_TITLES={champion:'Quán quân mùa',top3:'Tam hùng',top10:'Cao thủ',contender:'Chiến hữu mùa'};
const SEASON_ERRORS={season_locked:'Cần đồng bộ nhân vật hợp lệ gần đây để xem mùa.',feature_disabled:'Mùa xếp hạng chưa mở.',season_no_title:'Mùa này bạn chưa có danh hiệu.',season_claim_expired:'Đã quá hạn nhận danh hiệu.',season_not_final:'Mùa chưa chốt kết quả.'};
const SEASON_CLIENT={data:null,busy:false,error:'',loadedAt:0,identity:null,generation:0};
function seasonIdentity(){const a=onlGet();return a?.token&&S?.mode==='ctc'&&!ADMV.sandbox&&featureEnabled('ranked_seasons')?[a.token,S.cid||'',S.mode].join(':'):null;}
// The server publishes UTC milliseconds; players read Vietnam time (UTC+7).
function seasonTime(ms){const d=new Date(ms+7*3600e3),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear()+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+' giờ VN';}
function seasonBoardHTML(rows){return rows&&rows.length?rows.map(r=>`<div class="qrow"><span>${r.me?'<b>':''}#${r.placement} ${esc(r.name)}${r.me?'</b>':''}<small>${fmt(r.points)} điểm · ${fmt(r.wins)} thắng</small></span></div>`).join(''):'<p>Chưa có người đủ điều kiện.</p>';}
function seasonPanelHTML(){
  const d=SEASON_CLIENT.data,error=SEASON_CLIENT.error?`<p class="bad" role="status">${esc(SEASON_CLIENT.error)}</p>`:'';
  if(!d)return `<h4>Mùa xếp hạng CTC</h4><p>${SEASON_CLIENT.busy?'Đang tải…':'Chưa tải được mùa.'}</p>${error}<button class="btn" data-season="refresh" ${SEASON_CLIENT.busy?'disabled':''}>Tải lại</button>`;
  const s=d.season,st=d.standing,g=d.guild;
  const claims=d.claims.map(c=>`<div class="qrow"><span><b>Mùa ${c.season}: ${esc(SEASON_TITLES[c.title]||c.title)}</b><small>Hạng ${c.placement}/${c.group_size} · ${fmt(c.points)} điểm${c.claimed_at?' · đã nhận':c.claim_open?' · hạn nhận '+esc(seasonTime(c.claim_deadline)):' · hết hạn nhận'}</small></span>${!c.claimed_at&&c.claim_open?`<button class="btn" data-season="claim" data-index="${c.season}" ${SEASON_CLIENT.busy?'disabled':''}>Nhận danh hiệu</button>`:''}</div>`).join('');
  const previousBoard=d.claims.find(c=>c.board)?.board;
  const theme=typeof seasonThemeInfo==="function"?seasonThemeInfo():null;
  const themeHTML=theme&&theme.theme?`<p><b>Chủ đề mùa:</b> ${esc(theme.theme.name)} — ${esc(theme.theme.desc)} <small class="dim">(còn ${theme.weeksLeft} tuần; +${Math.round((theme.theme.modifiers.exp-1)*100)}% EXP · +${Math.round((theme.theme.modifiers.gold-1)*100)}% vàng · +${Math.round((theme.theme.modifiers.drop-1)*100)}% rơi đồ)</small></p>`:"";
  return `<h4>Mùa xếp hạng CTC · mùa ${s.index}</h4><small>${esc(seasonTime(s.start))} → ${esc(seasonTime(s.end))}. Kết quả chốt sau ${esc(seasonTime(s.final_at))}.</small>
    ${themeHTML}
    <p>Điểm lấy từ trận ranked đã xác thực của server (tối thiểu ${d.rules.minPoints} điểm). Hạng chỉ tính trong cùng phái và bracket; cần ít nhất ${d.rules.minGroup} người mới có danh hiệu hạng, nếu không nhận danh hiệu tham chiến. Danh hiệu chỉ để trưng bày, không có chỉ số hay tài nguyên.</p>
    <p><b>Của bạn:</b> ${fmt(st.points)} điểm · ${fmt(st.wins)} thắng · ${st.eligible?`hạng ${st.placement}/${st.group_size}`:`chưa đủ điều kiện (cần từ ${st.min_points} điểm, nhân vật đã xác thực và đồng bộ trong mùa)`}</p>
    <details open><summary>Bảng phái/bracket của bạn</summary>${seasonBoardHTML(d.board)}</details>
    ${claims?`<h4>Danh hiệu chờ nhận</h4>${claims}`:''}
    ${previousBoard?`<details><summary>Bảng chốt mùa trước</summary>${seasonBoardHTML(previousBoard)}</details>`:''}
    ${d.titles.length?`<details><summary>Danh hiệu đã nhận</summary>${d.titles.map(t=>`<p>Mùa ${t.season}: ${esc(SEASON_TITLES[t.title]||t.title)} · hạng ${t.placement}</p>`).join('')}</details>`:''}
    ${g?`<h4>Hậu cần bang · ${esc(g.name)}</h4><p>Đóng góp suy ra từ điểm ranked và công trạng phiên đã có, tối đa ${g.cap} điểm mỗi người mỗi mùa. Bạn: ${fmt(g.mine)}/${g.cap} · cả bang: ${fmt(g.total)}.</p>${g.members.map(m=>`<div class="qrow"><span>${esc(m.name)}<small>${fmt(m.points)}/${g.cap}</small></span></div>`).join('')}${g.board.length?`<details><summary>Bảng bang</summary>${g.board.map((b,i)=>`<p>#${i+1} ${esc(b.name)} · ${fmt(b.total)}</p>`).join('')}</details>`:''}`:''}
    ${error}<button class="btn" data-season="refresh" ${SEASON_CLIENT.busy?'disabled':''}>Cập nhật</button>`;
}
function seasonRender(){
  let box=document.getElementById('seasonPanel');
  if(!seasonIdentity()){if(box)box.remove();return;}
  const host=document.getElementById('t-more');if(!host)return;
  if(!box){box=document.createElement('section');box.id='seasonPanel';box.className='card season-panel';host.append(box);}
  const open=[...box.querySelectorAll('details')].map(x=>x.open);box.innerHTML=seasonPanelHTML();box.querySelectorAll('details').forEach((x,i)=>{if(open[i]!==undefined)x.open=open[i];});
  box.querySelectorAll('[data-season]').forEach(b=>{b.onclick=()=>{
    if(b.dataset.season==='claim')return seasonClaim(Number(b.dataset.index));
    return seasonLoad(true);
  };});
}
async function seasonLoad(force=false){
  const identity=seasonIdentity();
  if(!identity){SEASON_CLIENT.data=null;return;}
  if(SEASON_CLIENT.identity!==identity){SEASON_CLIENT.identity=identity;SEASON_CLIENT.data=null;SEASON_CLIENT.error='';SEASON_CLIENT.generation++;}
  if(SEASON_CLIENT.busy||(!force&&SEASON_CLIENT.data&&Date.now()-SEASON_CLIENT.loadedAt<30000))return;
  const generation=++SEASON_CLIENT.generation;SEASON_CLIENT.busy=true;seasonRender();
  try{const d=await onlApi('/season');if(identity===seasonIdentity()&&generation===SEASON_CLIENT.generation){SEASON_CLIENT.data=d;SEASON_CLIENT.loadedAt=Date.now();SEASON_CLIENT.error='';}}
  catch(e){if(identity===seasonIdentity()&&generation===SEASON_CLIENT.generation)SEASON_CLIENT.error=SEASON_ERRORS[e.error||e.code]||e.msg||e.message||'Mất kết nối; thử lại sau';}
  finally{if(generation===SEASON_CLIENT.generation){SEASON_CLIENT.busy=false;seasonRender();}}
}
async function seasonClaim(index){
  const identity=seasonIdentity();if(!identity||SEASON_CLIENT.busy||!Number.isSafeInteger(index))return;
  const generation=++SEASON_CLIENT.generation;SEASON_CLIENT.busy=true;seasonRender();
  try{const d=await onlApi('/season',{body:{action:'claim',season:index}});if(identity===seasonIdentity()&&generation===SEASON_CLIENT.generation){SEASON_CLIENT.data=d;SEASON_CLIENT.loadedAt=Date.now();SEASON_CLIENT.error='';toast('Đã nhận danh hiệu mùa');}}
  catch(e){if(identity===seasonIdentity()&&generation===SEASON_CLIENT.generation)SEASON_CLIENT.error=SEASON_ERRORS[e.error||e.code]||e.msg||e.message||'Chưa xác nhận; thử lại cùng yêu cầu an toàn (nhận lặp trả cùng kết quả)';}
  finally{if(generation===SEASON_CLIENT.generation){SEASON_CLIENT.busy=false;seasonRender();}}
}
{
  const original=renderMore;renderMore=function(){const r=original.apply(this,arguments);seasonRender();seasonLoad();return r;};
}
setInterval(()=>{if(seasonIdentity()&&document.getElementById('seasonPanel'))seasonLoad();},60000);
