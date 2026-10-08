"use strict";
(function(){
  let busy=false;
  async function refresh(){
    const box=document.getElementById('onlGuildChat'),guild=ONL.guildId;if(!box||!guild||busy)return;
    busy=true;try{const data=await onlApi('/chat?scope=guild&guild_id='+encodeURIComponent(guild));if(!box.isConnected||ONL.guildId!==guild)return;
      const list=box.querySelector('#guildChatMessages');list.replaceChildren();
      for(const item of data.messages||[]){const p=document.createElement('p'),name=document.createElement('b'),body=document.createElement('span');name.textContent=item.sender+': ';body.textContent=item.body;p.className='room-chat-message';p.append(name,body);list.append(p);}
    }catch(e){const msg=box.querySelector('#guildChatStatus');if(msg)msg.textContent=e.msg||'Không tải được chat bang';}finally{busy=false;}
  }
  function install(){
    const host=document.getElementById('onlGuildPanel');if(!host||!ONL.guildId){document.getElementById('onlGuildChat')?.remove();return;}
    let box=document.getElementById('onlGuildChat');if(!box){box=document.createElement('section');box.id='onlGuildChat';box.className='card room-chat';box.innerHTML='<h4>Chat bang · lưu 7 ngày</h4><div id="guildChatMessages" aria-live="polite"></div><label>Tin nhắn<textarea id="guildChatInput" maxlength="280"></textarea></label><div class="btnrow"><button class="btn" id="guildChatSend">Gửi</button><button class="btn" id="guildChatRefresh">Tải mới</button></div><small id="guildChatStatus" role="status"></small>';host.append(box);}
    box.querySelector('#guildChatSend').onclick=async()=>{const input=box.querySelector('#guildChatInput'),text=input.value;if(!text.trim())return;const button=box.querySelector('#guildChatSend');button.disabled=true;
      try{await onlApi('/chat',{body:{scope:'guild',guild_id:ONL.guildId,client_id:crypto.randomUUID().replaceAll('-',''),text}});input.value='';await refresh();}
      catch(e){box.querySelector('#guildChatStatus').textContent=e.msg||'Không gửi được tin nhắn';}finally{button.disabled=false;}
    };
    box.querySelector('#guildChatRefresh').onclick=refresh;refresh();
  }
  const original=onlRenderGuild;onlRenderGuild=async function(){const result=await original.apply(this,arguments);install();return result;};
  setInterval(()=>{if(document.visibilityState!=='hidden'&&ONL.guildId)refresh();},6000);
})();
