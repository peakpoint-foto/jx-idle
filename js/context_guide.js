"use strict";

function contextGuide() {
  const previous=S;
  try{S=JSON.parse(JSON.stringify(previous));return contextGuideValues();}finally{S=previous;}
}
function contextGuideValues() {
  if(!S.fac||!featureEnabled("context_guide"))return [];
  const progress=S.extensions?.contextGuide,mode=modeId();
  const done=progress?.v===1&&progress.modes?.[mode]?.fac===S.fac&&Array.isArray(progress.modes[mode].done)?progress.modes[mode].done:[];
  const hints=[],add=(id,title,detail,action,feature)=>{if(!feature||featureEnabled(feature))hints.push({id,title,detail,action,done:done.includes(id)});};
  add("skills","Kiểm tra trục võ học",S.attrPts||S.skPts?`Còn ${S.attrPts} tiềm năng / ${S.skPts} kỹ năng; xem bổ trợ và điều kiện vũ khí trước phân điểm.`:"Đối chiếu chiêu nguồn/đích, bonus và kỹ năng chưa hỗ trợ.","skills","skill_graph");
  const idle=!buildChangeProblem();
  if(!idle){add("report","Xem báo cáo hoạt động","Kết thúc hoạt động trước khi đổi build; xem damage hữu ích và nguyên nhân chết đã ghi nhận.","report","combat_reports");return hints.filter(h=>!h.done);}
  if(mode==="ctc") {
    add("build","Chuẩn bị build CTC","Thử mục tiêu boss, dọn quái hoặc sống sót bằng đồ hợp lệ hiện có.","boss","build_advice");
    const used=S.rw?.siege?.week===weekKey()?S.rw.siege.used||0:0;
    if(siegeOpen()&&used<1)add("activity","Chuẩn bị công thành","Còn lượt tuần; xem hoạt động và thuốc trước khi vào trận. Mở hướng dẫn không tiêu lượt.","activities");
    const linked=onlGet(),char=ONL.me?.char;
    if(linked&&char&&char.validation_status==="verified"&&!char.flagged&&char.updated_at>=Date.now()-30*864e5)
      add("guild","Tìm bang và đồng đội","Mở sảnh bang CTC; phòng hiện là lobby và hoạt động bất đồng bộ.","guild","guild_online");
    else if(!linked&&S.lvl<=ONL_REG_MAX_LVL)add("register","Liên kết online trước cấp 40","Tùy chọn đăng ký CTC để có đồng bộ/xếp hạng; không tự đăng ký hoặc gửi save.","online","guild_online");
  } else if(mode==="phlt") {
    add("gear","Đặt mục tiêu săn đồ","Xem nguồn đồ đúng mode, kháng yếu nhất và wishlist chỉ tính dòng đang kích hoạt.","codex","loot_codex");
    add("mana","Kiểm tra kháng và mana","Gợi ý sustain từ đồ đang sở hữu; giữ vật tư để chống đòn trùm.","mana","build_advice");
    add("supplies","Giữ vật tư","Profile giữ vật tư chỉ dùng thuốc trong kho, không tự mua; xem ngưỡng HP/mana trước lưu.","policy","combat_policy");
  } else {
    add("train","Đo và so sánh build","Hai build cùng seed/kháng/HP/mana; không reward, không ranked.","training","training_lab");
    add("library","Lưu template và lịch sử thử","Mã chỉ nhập võ học; recipe không tạo đồ. Preview ngân sách trước áp dụng.","library","build_library");
    add("combo","Thử combo nhiều mục tiêu","Xem ước tính theo số mục tiêu, rồi xác minh bằng phòng luyện.","farm","build_advice");
  }
  return hints.filter(h=>!h.done);
}
function contextGuideComplete(id) {
  if(SAVE_LOCK||ADMV.sandbox)return buildResult(["Không ghi hướng dẫn trong phiên bị khóa/thử nghiệm"]);
  if(!contextGuide().some(h=>h.id===id))return buildResult(["Gợi ý đã xong hoặc không còn đủ điều kiện"]);
  if(S.extensions?.contextGuide&&S.extensions.contextGuide.v!==1)return buildResult(["Phiên bản hướng dẫn mới hơn chưa hỗ trợ"]);
  const candidate=JSON.parse(JSON.stringify(S));candidate.extensions||={v:1};candidate.extensions.contextGuide||={v:1,modes:{}};
  const guide=candidate.extensions.contextGuide;guide.modes=guide.modes&&typeof guide.modes==="object"&&!Array.isArray(guide.modes)?guide.modes:{};
  const current=guide.modes[modeId()],done=current?.fac===S.fac&&Array.isArray(current.done)?current.done.filter(i=>typeof i==="string").slice(0,20):[];
  guide.modes[modeId()]={fac:S.fac,done:[...new Set([...done,id])].slice(-21)};
  return buildPersist(candidate);
}
