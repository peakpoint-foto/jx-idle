"use strict";
function onlGuildManagementHTML(data) {
  const g=data.guild,owner=g.role==="owner",manager=owner||g.role==="officer",me=onlGet()?.id;
  const button=(action,target,label)=>`<button class="btn sm" data-gm-action="${action}" data-gm-target="${esc(target)}">${label}</button>`;
  return `<div class="card guild-management"><h3>Quản lý bang online</h3><p class="dim small">Bang local tách riêng. Damage boss tuần do máy chủ tính từ snapshot đã kiểm định và receipt; không nhận đóng góp tự khai. Đóng góp tài nguyên chờ ledger.</p>${owner?'<button class="btn sm red" id="gmOwnerLeave">Rời bang và chuyển chủ tự động</button>':""}${data.members.map(member=>`<div class="gm-member"><b>${esc(member.name)} · ${esc(member.role)}</b><span class="gm-actions">${member.account_id!==me&&member.role!=="owner"?`${owner?button("transfer",member.account_id,"Chuyển chủ")+button(member.role==="officer"?"demote":"promote",member.account_id,member.role==="officer"?"Hạ quyền":"Phó bang"):""}${manager&&(owner||member.role==="member")?button("kick",member.account_id,"Mời rời bang"):""}`:""}</span></div>`).join("")}<details><summary>Lịch bang · giờ Việt Nam</summary>${(data.calendar||[]).map(event=>`<p>${esc(event.title)} · ${esc(event.activity)} · ${esc(new Date(event.starts_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}))} ${manager?button("cancel_event",event.id,"Hủy lịch"):""}</p>`).join("")||"Chưa có lịch"}${manager?'<div class="policy-grid"><label>Tên lịch<input id="gmEventTitle" maxlength="80" placeholder="Hẹn đánh boss"></label><label>Hoạt động<select id="gmEventActivity"><option value="boss">Boss tuần</option><option value="siege">Công thành</option><option value="tk">Tống Kim</option></select></label><label>Giờ Việt Nam<input id="gmEventTime" type="datetime-local"></label><button class="btn sm" id="gmEventSave">Thêm lịch</button></div><small class="dim">Tối đa 10 lịch tương lai, trong 90 ngày; lịch chỉ nhắc hẹn, không cấp lượt/thưởng.</small>':""}</details><details><summary>Nhật ký quản lý gần nhất</summary>${(data.logs||[]).map(log=>`<p>${esc(log.actor||"Thành viên")} · ${esc(log.action)} · ${esc(new Date(log.created_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}))}</p>`).join("")||"Chưa có thao tác"}</details></div>`;
}
function onlGuildManagementBind(box,data) {
  const send=async body=>{try{await onlGuildWrite({...body,guild_id:data.guild.id});await onlRenderGuild();toast("Đã cập nhật quyền/lịch bang");}catch(e){toast(e.msg||"Quyền hoặc dữ liệu đã thay đổi; thử tải lại bang");}};
  box.querySelectorAll('[data-gm-action]').forEach(button=>button.onclick=()=>{
    if(['transfer','kick'].includes(button.dataset.gmAction)&&!confirm('Xác nhận '+(button.dataset.gmAction==='transfer'?'chuyển quyền chủ bang':'mời thành viên rời bang')+'?'))return;
    return send({action:button.dataset.gmAction,target_id:button.dataset.gmTarget});
  });
  const leave=box.querySelector('#gmOwnerLeave');if(leave)leave.onclick=()=>{if(confirm(data.members.length===1?'Bạn là thành viên cuối; rời sẽ giải tán bang. Xác nhận?':'Chủ bang chuyển cho phó bang hoặc thành viên vào sớm nhất, rồi bạn rời bang. Xác nhận?'))return onlGuildAction('leave');};
  const event=box.querySelector('#gmEventSave');if(event)event.onclick=()=>{
    const time=box.querySelector('#gmEventTime').value;
    return send({action:'schedule',title:box.querySelector('#gmEventTitle').value,activity:box.querySelector('#gmEventActivity').value,starts_at:Date.parse(time+':00+07:00')});
  };
}
