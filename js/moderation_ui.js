"use strict";
(function(){
  async function request(key,status,reportId,next){
    const acc=onlGet();if(!acc?.token)throw Error('Cần đăng nhập CTC online.');
    const response=await fetch(onlBase()+'/admin/moderation'+(status?'?status='+encodeURIComponent(status):''),{
      method:reportId?'POST':'GET',headers:{authorization:'Bearer '+acc.token,'x-admin-key':key,'content-type':'application/json'},
      ...(reportId?{body:JSON.stringify({report_id:reportId,status:next})}:{})
    });
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.msg||data.error||'Không thể tải hàng đợi moderation.');return data;
  }
  function install(){
    const host=document.getElementById('t-more');if(!host||S?.mode!=='ctc'||!onlGet()?.token||document.getElementById('moderationAdminPanel'))return;
    const panel=document.createElement('section');panel.id='moderationAdminPanel';panel.className='card';
    panel.innerHTML='<h3>Hàng đợi moderation</h3><p class="dim small">Chỉ gửi khóa quản trị trực tiếp tới Worker; khóa không được lưu trong save hoặc localStorage.</p><label>Khóa quản trị <input type="password" id="moderationAdminKey" autocomplete="new-password" maxlength="256"></label><div class="btnrow"><button class="btn" id="moderationLoad">Tải báo cáo</button></div><div id="moderationAdminRows" aria-live="polite"></div>';
    host.prepend(panel);
    panel.querySelector('#moderationLoad').onclick=async()=>{
      const key=panel.querySelector('#moderationAdminKey').value.trim(),rows=panel.querySelector('#moderationAdminRows');rows.replaceChildren();
      if(!key){rows.textContent='Nhập khóa quản trị để tiếp tục.';return;}
      try{const data=await request(key,'open');if(!panel.isConnected)return;
        if(!data.rows?.length){rows.textContent='Không có báo cáo đang chờ.';return;}
        for(const item of data.rows){const card=document.createElement('article');card.className='card moderation-report';
          const summary=document.createElement('p');summary.textContent=`#${item.id} · ${item.reason} · ${item.reporter} báo cáo ${item.target} · ${new Date(item.created_at).toLocaleString()}`;
          const details=document.createElement('p');details.textContent=item.details||'Không có mô tả.';card.append(summary,details);
          for(const [status,label] of [['reviewing','Đang xem'],['closed','Đã xử lý']]){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await request(key,null,item.id,status);card.remove();}catch(e){details.textContent=e.message;button.disabled=false;}};card.append(button);}
          rows.append(card);
        }
      }catch(e){rows.textContent=e.message;}
    };
  }
  const original=renderMore;renderMore=function(){original.apply(this,arguments);install();};
})();
