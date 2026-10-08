"use strict";
const onlRenderRoomLegacy=onlRenderRoom;
function lobbyFriendsHTML(data){
  const muted=new Set((data.moderation?.mutes||[]).map(x=>x.target_id)),blocked=new Set((data.moderation?.blocks||[]).map(x=>x.target_id));
  return `<details class="lobby-friends"><summary>Bạn bè và lời mời</summary><div class="btnrow"><input id="lobbyFriendName" maxlength="16" aria-label="Tên bạn" placeholder="Tên người chơi"><button class="btn sm" data-friend="request">Kết bạn</button></div><small>Lời kết bạn có hạn 7 ngày; tối đa 100 bạn. Presence tài khoản có thể trễ 90 giây.</small>
    ${(data.friends||[]).map(f=>`<div class="qrow"><span>${esc(f.name)} · ${f.status==='accepted'?(f.online?'online gần đây':'offline'):(f.direction==='incoming'?'đang mời bạn':'đã gửi lời mời')}${f.expires_at?' · '+esc(new Date(f.expires_at).toLocaleString('vi-VN')):''}</span>${f.status==='pending'&&f.direction==='incoming'?`<button class="btn sm" data-friend="accept" data-target="${esc(f.account_id)}">Đồng ý</button>`:''}<button class="btn sm" data-friend="remove" data-target="${esc(f.account_id)}">${f.status==='accepted'?'Bỏ kết bạn':'Hủy/từ chối'}</button>${f.status==='accepted'&&ONL.room?`<button class="btn sm" data-invite-name="${esc(f.name)}">Mời vào phòng</button>`:''}<button class="btn sm" data-moderate="${muted.has(f.account_id)?'unmute':'mute'}" data-target="${esc(f.account_id)}">${muted.has(f.account_id)?'Hiện lời mời':'Ẩn lời mời'}</button><button class="btn sm" data-moderate="${blocked.has(f.account_id)?'unblock':'block'}" data-target="${esc(f.account_id)}">${blocked.has(f.account_id)?'Bỏ chặn':'Chặn'}</button><button class="btn sm" data-moderate="report" data-target="${esc(f.account_id)}">Báo cáo</button></div>`).join('')}
    ${(data.invites||[]).map(i=>`<div class="qrow"><span>${esc(i.sender)} mời vào ${esc(i.room_id)} · hạn ${esc(new Date(i.expires_at).toLocaleString('vi-VN'))}</span><button class="btn sm" data-lobby="invite_accept" data-invite="${esc(i.id)}">Vào phòng</button><button class="btn sm" data-lobby="invite_decline" data-invite="${esc(i.id)}">Từ chối</button></div>`).join('')}</details>`;
}
function lobbyRoomHTML(room){
  if(!room)return '<b>Sảnh tổ đội CTC</b><small>Phòng tối đa 4 người, TTL 2 giờ. Sảnh trao đổi trạng thái; combat tổ đội chưa mở.</small><div class="btnrow"><button class="btn sm" data-lobby="create">Tạo phòng</button><input id="lobbyRoomCode" aria-label="Mã phòng" placeholder="Mã phòng"><button class="btn sm" data-lobby="join">Vào phòng</button></div>';
  const me=ONL.me?.id||onlGet()?.id,own=room.members.find(m=>m.account_id===me),leader=room.owner_id===me;
  const goals={farm:'Săn đồ',boss:'Boss',siege:'Công thành',tk:'Tống Kim'},roles={damage:'Sát thương',control:'Khống chế',support:'Duy trì'};
  return `<b>Sảnh ${esc(room.id)} · ${room.members.length}/4</b><small>Presence phòng trễ tối đa 35 giây. Người mất mạng vẫn giữ chỗ đến TTL; chủ offline sẽ chuyển cho thành viên online. Sẵn sàng chỉ là trạng thái sảnh, không bắt đầu combat.</small>
    <div class="btnrow"><button class="btn sm" data-lobby="leave">Rời phòng</button>${leader?`<label>Mục tiêu<select id="lobbyObjective">${Object.entries(goals).map(([k,n])=>`<option value="${k}" ${k===room.objective?'selected':''}>${n}</option>`).join('')}</select></label><button class="btn sm" data-lobby="objective">Đặt mục tiêu</button>`:`<span>Mục tiêu: ${esc(goals[room.objective]||room.objective)}</span>`}</div>
    ${room.members.map(m=>`<div class="qrow"><span><b>${esc(m.name)} ${m.account_id===room.owner_id?'· Chủ phòng':''}</b><small>${m.online?'Online':'Mất kết nối'} · ${esc(roles[m.role]||m.role)} · ${m.ready?'Sẵn sàng':'Chưa sẵn sàng'}</small></span>${leader&&m.account_id!==me?`<button class="btn sm" data-lobby="transfer" data-target="${esc(m.account_id)}" ${m.online?'':'disabled'}>Chuyển chủ</button><button class="btn sm" data-lobby="kick" data-target="${esc(m.account_id)}">Mời rời phòng</button>`:''}</div>`).join('')}
    ${own?`<div class="btnrow"><label>Vai trò<select id="lobbyRole">${Object.entries(roles).map(([k,n])=>`<option value="${k}" ${own.role===k?'selected':''}>${n}</option>`).join('')}</select></label><button class="btn sm" data-lobby="role">Đổi vai trò</button><button class="btn sm" data-lobby="ready" data-ready="${own.ready?'false':'true'}">${own.ready?'Bỏ sẵn sàng':'Sẵn sàng'}</button></div>`:''}
    <p>${room.all_ready?'Mọi người sẵn sàng trong sảnh.':'Chờ thành viên sẵn sàng.'} Lượt và phần thưởng hoạt động chưa thay đổi.</p><div class="btnrow"><input id="lobbyInviteName" maxlength="16" aria-label="Tên người được mời" placeholder="Tên bạn/người cùng bang"><button class="btn sm" data-lobby="invite">Mời vào phòng</button></div><small>Lời mời có hạn 10 phút, chỉ người nhận dùng được; không giữ chỗ.</small>`;
}
async function onlLobbyWrite(path,body){
  if(ONL.lobbyBusy)return;ONL.lobbyBusy=true;
  try{await onlApi(path,{body});await onlRenderRoom(true);toast('Đã cập nhật sảnh/bạn bè');}
  catch(e){toast(e.msg||'Sảnh hoặc lời mời vừa thay đổi; tải lại để thử');}
  finally{ONL.lobbyBusy=false;}
}
function lobbyBind(box){
  box.querySelectorAll('[data-friend]').forEach(b=>b.onclick=()=>onlLobbyWrite('/friends',{action:b.dataset.friend,target_id:b.dataset.target,name:box.querySelector('#lobbyFriendName')?.value}));
  box.querySelectorAll('[data-invite-name]').forEach(b=>b.onclick=()=>onlLobbyWrite('/room',{action:'invite',name:b.dataset.inviteName,room_id:ONL.room?.id}));
  box.querySelectorAll('[data-moderate]').forEach(b=>b.onclick=async()=>{
    const action=b.dataset.moderate,target_id=b.dataset.target;let body={action,target_id};
    if(action==='report'){body.reason=prompt('Lý do: harassment, spam, cheat, impersonation hoặc other','spam');if(!body.reason)return;body.details=prompt('Mô tả ngắn (tối đa 500 ký tự)','')||'';}
    b.disabled=true;try{await onlApi('/moderation',{body});await onlRenderRoom(true);toast(action==='report'?'Đã gửi báo cáo':action==='block'?'Đã chặn người chơi':'Đã cập nhật tùy chọn moderation');}
    catch(e){b.disabled=false;toast(e.msg||'Không cập nhật được moderation');}
  });
  box.querySelectorAll('[data-lobby]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.lobby;
    if(['kick','transfer'].includes(action)&&!confirm(action==='kick'?'Mời thành viên rời phòng?':'Chuyển quyền chủ phòng?'))return;
    return onlLobbyWrite('/room',{action,room_id:action==='join'?box.querySelector('#lobbyRoomCode')?.value:ONL.room?.id,invite_id:b.dataset.invite,target_id:b.dataset.target,
      objective:box.querySelector('#lobbyObjective')?.value,role:box.querySelector('#lobbyRole')?.value,ready:b.dataset.ready==='true',name:box.querySelector('#lobbyInviteName')?.value});
  });
}
onlRenderRoom=async function(force=false){
  if(!featureEnabled('party_lobby'))return onlRenderRoomLegacy();
  const box=document.getElementById('onlRoomPanel');if(!box||!onlGet()||!featureEnabled('room_presence'))return;
  if(ONL.lobbyReading){await ONL.lobbyReadPromise;if(force)return onlRenderRoom(true);return;}
  // Polling never replaces a field while the player is typing.
  if(!force&&box.contains(document.activeElement)&&['INPUT','SELECT'].includes(document.activeElement.tagName))return;
  ONL.lobbyReading=true;
  const identity=onlGet()?.token,mode=S.mode;
  ONL.lobbyReadPromise=(async()=>{try{
    let data=await onlApi('/room');if(data.room)data=await onlApi('/room',{body:{action:'heartbeat',room_id:data.room.id}});
    const [people,moderation]=await Promise.all([onlApi('/friends'),onlApi('/moderation')]);people.moderation=moderation;
    if(onlGet()?.token!==identity||S.mode!==mode||!featureEnabled('party_lobby')||!box.isConnected)return;
    ONL.room=data.room;const open=box.querySelector('.lobby-friends')?.open;
    box.innerHTML=lobbyRoomHTML(data.room)+lobbyFriendsHTML(people);box.hidden=false;
    box.querySelector('.lobby-friends').open=!!open;lobbyBind(box);
  }catch(e){box.innerHTML=`<small class="bad">${esc(e.msg||'Không tải được sảnh')}</small>`;box.hidden=false;}
  finally{ONL.lobbyReading=false;}})();
  await ONL.lobbyReadPromise;
};
