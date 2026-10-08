"use strict";
const RESOURCE_LABELS={gold:'Lượng',items:'Trang bị',ht:'Huyền Tinh',ore:'Khoáng',shard:'Mảnh',misc:'Vật liệu',lifePots:'Thuốc HP',manaPots:'Thuốc MP'};
const RESOURCE_SOURCE_LABELS={local_net:'Biến động local',workbench:'Chế tác',expedition:'Hành trình'};
function resourceSummaryModal(){
  const s=resourceSummary();if(!s)return;
  if(s.unsupported){toast('Giữ nguyên summary không được hỗ trợ');return;}
  modal(`<h3>Tài nguyên local · ${esc(modeId())}</h3><p>${esc(s.catalog.policy)}</p><p>${Object.entries(s.balances).map(([k,v])=>esc(RESOURCE_LABELS[k])+': '+fmt(v)).join(' · ')}</p><p>Nguồn: ${s.catalog.sources.map(esc).join('; ')}. Chi: ${s.catalog.sinks.map(esc).join('; ')}.</p><p>32 biến động ròng giữa lần lưu gần nhất; chuyển kho/tự bán có thể gộp cùng dòng. Không phải tổng nguồn/chi đầy đủ hoặc số dư xác thực server. Thuốc/loot chưa bank của hành trình không cộng vào kho.</p>${s.entries.map(x=>`<p>${esc(RESOURCE_SOURCE_LABELS[x.source])} · ${new Date(x.at).toLocaleString('vi-VN')} · ${Object.entries(x.delta).map(([k,v])=>esc(RESOURCE_LABELS[k])+': '+(v>0?'+':'')+fmt(v)).join(' · ')}</p>`).join('')||'<p>Chưa có biến động đã lưu khi summary được bật.</p>'}`);
}
let ECONOMY_REQUEST=null,ECONOMY_BUSY=false;
async function onlEconomyModal(){
  if(!featureEnabled('online_economy')||!onlGet()?.token){toast('Công trạng online chưa mở');return;}
  const token=onlGet().token;
  try{
    const d=await onlApi('/economy');if(onlGet()?.token!==token||!featureEnabled('online_economy'))return;
    modal(`<h3>Công trạng online CTC</h3><p>Số dư ${fmt(d.balance)}/30. Nhận ${d.earned_today}/3, đóng góp ${d.donated_today}/3 trong ngày UTC. 1 receipt đánh boss hợp lệ hôm nay =1 công trạng; 1 công trạng đóng góp =100 XP bang. Bang tối đa cấp30 (29.000XP); không tiêu công trạng khi vượt cap. Tách khỏi vàng/đồ/kho offline.</p><div class="btnrow"><button class="btn" id="econCollect">Nhận từ receipt hôm nay</button><label>Số công trạng<input id="econAmount" type="number" min="1" max="3" value="1"></label><button class="btn" id="econDonate">Đóng góp vào bang hiện tại</button></div><p id="econStatus" role="status"></p>${d.entries.map(x=>`<p>${esc(x.source==='boss_attendance'?'Nhận từ đánh boss':'Đóng góp bang')} ${x.delta>0?'+':''}${fmt(x.delta)} · ${esc(x.day)}</p>`).join('')}`,
      ()=>{
        const send=async action=>{
          if(onlGet()?.token!==token||!featureEnabled('online_economy'))return;
          if(ECONOMY_BUSY)return;ECONOMY_BUSY=true;
          try{
            let body={action};
            if(action==='donate'){
              if(!ONL.guildId)throw Error('Tải bang hiện tại trước khi đóng góp');
              const amount=Number(document.getElementById('econAmount').value),payload=JSON.stringify({guild_id:ONL.guildId,amount});
              if(!ECONOMY_REQUEST||ECONOMY_REQUEST.token!==token||ECONOMY_REQUEST.payload!==payload)ECONOMY_REQUEST={token,payload,id:crypto.randomUUID().replaceAll('-','')};
              body={action,guild_id:ONL.guildId,amount,request_id:ECONOMY_REQUEST.id};
            }
            await onlApi('/economy',{body});ECONOMY_REQUEST=null;if(onlGet()?.token===token)await onlEconomyModal();
          }catch(e){const status=document.getElementById('econStatus');if(status)status.textContent=e.msg||e.message||'Chưa kết nối; giữ request để thử lại';}finally{ECONOMY_BUSY=false;}
        };
        document.getElementById('econCollect').onclick=()=>send('collect');document.getElementById('econDonate').onclick=()=>send('donate');
      });
  }catch(e){toast(e.msg||e.message||'Chưa tải được ví server');}
}
{
  const originalGuild=onlRenderGuild;
  onlRenderGuild=async function(){const token=onlGet()?.token;await originalGuild.apply(this,arguments);if(!token||onlGet()?.token!==token||!featureEnabled('online_economy')||!ONL.guildId)return;
    const box=document.getElementById('onlGuildPanel'),button=box?.querySelector('button[disabled][title="Chờ ledger tài nguyên xác thực"]');
    if(button){button.disabled=false;button.id='guildEconomyOpen';button.title='Đóng góp công trạng do server ghi nhận';button.textContent='Ví công trạng / đóng góp';button.onclick=onlEconomyModal;}
  };
  const original=renderMore;
  renderMore=function(){original.apply(this,arguments);const tab=document.getElementById('t-more');
    if(featureEnabled('resource_summary')){tab.insertAdjacentHTML('afterbegin','<button class="btn" id="resourceSummaryOpen">Tài nguyên và biến động local</button>');document.getElementById('resourceSummaryOpen').onclick=resourceSummaryModal;}
    if(featureEnabled('online_economy')&&onlGet()?.token){tab.insertAdjacentHTML('afterbegin','<button class="btn" id="onlineEconomyOpen">Ví công trạng server CTC</button>');document.getElementById('onlineEconomyOpen').onclick=onlEconomyModal;}
  };
}
