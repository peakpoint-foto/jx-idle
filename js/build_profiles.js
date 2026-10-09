"use strict";

// Profiles refer to owned UIDs, never embed equipment objects. Legacy profiles
// remain point-only; advanced capture is gated without deleting old profiles.
function buildChangeProblem() {
  if (SAVE_LOCK || ADMV.sandbox) return "Không đổi build khi bản lưu bị khóa hoặc đang thử nghiệm";
  if (S.siege || R.tower || R.tk || SV.on || R.phaseBossCurrent) return "Hãy kết thúc hoạt động trước khi đổi build";
  const extensions=S.extensions||{};
  if (extensions.expedition?.status==="active" || extensions.rift?.status==="active" ||
      R.onlineSession && !["completed","aborted"].includes(R.onlineSession.status))
    return "Không đổi build trong chuyến đi hoặc phiên trận online";
  return "";
}

function buildInteger(value) { return Number.isSafeInteger(value) && value>=0; }
function buildIndexValid(i) { return Number.isInteger(i) && i>=0 && i<buildN(); }
// 2.3: slot mở dần theo tiến trình — bộ 1 luôn mở, bộ 2 ở cấp 30, bộ 3 ở cấp 60.
function buildSlotsUnlocked() { const lvl=(typeof S!=="undefined"&&S&&S.lvl)||1; return lvl>=60?3:lvl>=30?2:1; }
function buildSlotLocked(i) { return i>=buildSlotsUnlocked(); }
function buildSlotNeed(i) { return i===2?60:30; }
function buildSlotProblem(i) { return buildSlotLocked(i)?`Bộ ${i+1} mở ở cấp ${buildSlotNeed(i)}`:""; }
function buildResult(errors, extra={}) { return {ok:!errors.length,msg:errors[0]||"Build hợp lệ",errors,...extra}; }

function buildCandidate(profile) {
  const errors=[];
  if (!profile || typeof profile!=="object" || Array.isArray(profile)) return buildResult(["Bộ trống hoặc không hợp lệ"]);
  if (profile.v!=null && profile.v!==2) return buildResult(["Phiên bản build chưa được hỗ trợ"]);
  if (profile.v===2 && (!isMode(profile.mode)||!FAC[profile.fac])) errors.push("Build thiếu mode hoặc môn phái hợp lệ");
  if (profile.mode && profile.mode!==modeId()) errors.push("Build thuộc mode khác");
  if (profile.fac && profile.fac!==S.fac) errors.push("Build thuộc môn phái khác");
  const own=new Set(FAC[S.fac]?.skills.map(Number)||[]),attr={},sk={};
  for (const key of Object.keys(profile.attr||{})) if (!["str","dex","vit","eng"].includes(key)) errors.push("Chỉ số tiềm năng không hợp lệ");
  for (const key of ["str","dex","vit","eng"]) {
    const value=profile.attr?.[key]??0;
    if (!buildInteger(value)) errors.push("Điểm tiềm năng phải là số nguyên không âm");
    attr[key]=value;
  }
  for (const [id,value] of Object.entries(profile.sk||{})) {
    if (!buildInteger(value) || !own.has(+id) || !SK[id] || value>SK[id].max || value && S.lvl<SK[id].req)
      errors.push("Chiêu không hợp lệ hoặc chưa đủ cấp: "+(SK[id]?.n||id));
    if (value) sk[id]=value;
  }
  const haveA=S.attrPts+sumObj(S.attr),haveS=S.skPts+sumObj(S.sk),needA=sumObj(attr),needS=sumObj(sk);
  if (!buildInteger(haveA)||!buildInteger(haveS)||needA>haveA||needS>haveS) errors.push("Không đủ ngân sách điểm cho build");
  const slots=profile.slots||[0,0,0,0],main=profile.main||0;
  if (!Array.isArray(slots)||slots.length!==4||slots.some(id=>!Number.isInteger(id)||id!==0&&(!sk[id]||!isAttack(SK[id])))) errors.push("Ô chiêu phải chứa kỹ năng tấn công đã học");
  if (!Number.isInteger(main)||main!==0&&(!sk[main]||!isAttack(SK[main]))) errors.push("Chiêu chính không hợp lệ");
  if (profile.rot!=null && typeof profile.rot!=="boolean") errors.push("Rotation không hợp lệ");
  const candidate=JSON.parse(JSON.stringify(S));
  Object.assign(candidate,{attr,sk,attrPts:haveA-needA,skPts:haveS-needS,slots:Array.isArray(slots)?slots.slice():[],main,mainLock:!!profile.mainLock});
  if (profile.rot!=null) candidate.rot=profile.rot;
  if (profile.equipment!=null) {
    if (!featureEnabled("build_profiles")) errors.push("Tính năng build trang bị đang tắt");
    if (typeof profile.equipment!=="object"||Array.isArray(profile.equipment)) errors.push("Danh sách trang bị không hợp lệ");
    else {
      const pool=[...candidate.inv,...Object.values(candidate.eq).filter(Boolean)],byId=new Map(),used=new Set();
      for(const item of pool) {
        if (!Number.isSafeInteger(item.uid)||item.uid<1||byId.has(item.uid)) errors.push("ID trang bị trùng hoặc không hợp lệ");
        byId.set(item.uid,item);
      }
      const nextEq={};
      for(const [slot,uid] of Object.entries(profile.equipment)) {
        if (!Object.hasOwn(SLOT_VI,slot)||!Number.isSafeInteger(uid)||uid<1||used.has(uid)) {errors.push("Slot hoặc ID trang bị không hợp lệ");continue;}
        const item=byId.get(uid);
        if (!item) {errors.push("Thiếu trang bị ID "+uid);continue;}
        const type=DETAIL_SLOT[item.d];
        if (type!==(slot.startsWith("ring")?"ring":slot)) errors.push("Trang bị sai vị trí: "+SLOT_VI[slot]);
        if (!modeItemOk(item,modeId())) errors.push("Trang bị vượt luật mode: "+item.n);
        nextEq[slot]=item;used.add(uid);
      }
      for(const [slot,item] of Object.entries(candidate.eq)) if(item?.locked && nextEq[slot]?.uid!==item.uid) errors.push("Giữ trang bị khóa: "+SLOT_VI[slot]);
      candidate.eq=nextEq;candidate.inv=pool.filter(item=>!used.has(item.uid));
      if(candidate.inv.length>INV_MAX) errors.push("Không đủ chỗ trong hành trang");
    }
  }
  if (errors.length) return buildResult([...new Set(errors)]);
  const previous=S;
  try {
    S=candidate;
    for(const item of Object.values(candidate.eq)) if(item && (!reqOk(item)||!modeItemOk(item,modeId()))) errors.push("Build không đủ điều kiện mặc: "+item.n);
    const stats=errors.length?null:calc(candidate.eq);
    return buildResult(errors,{candidate,stats});
  } finally { S=previous; }
}

function buildPreview(i) {
  if(!buildIndexValid(i))return buildResult(["Số bộ không hợp lệ"]);
  const locked=buildSlotProblem(i);if(locked)return buildResult([locked]);
  const result=buildCandidate(S.builds?.[i]);
  if(result.ok) result.summary={life:result.stats.life,mana:result.stats.mana,dps:result.stats.main.dps,
    power:power(result.stats),attributePoints:sumObj(result.candidate.attr),skillPoints:sumObj(result.candidate.sk),
    equipmentCount:Object.keys(result.candidate.eq).length};
  return result;
}

function buildPersist(candidate) {
  const previous=S;S=candidate;
  let written=false;
  try { written=save(); } catch(e) { written=false; }
  if(!written) { S=previous;return buildResult(["Không lưu được build; trạng thái trước đó được giữ nguyên"]); }
  R.dirty=true;recalc();invDirty=true;
  return buildResult([]);
}

buildSave=function(i) {
  if(!buildIndexValid(i)) return buildResult(["Số bộ không hợp lệ"]);
  const locked=buildSlotProblem(i);if(locked) return buildResult([locked]);
  if(SAVE_LOCK||ADMV.sandbox) return buildResult(["Không lưu build trong phiên bị khóa hoặc thử nghiệm"]);
  const candidate=JSON.parse(JSON.stringify(S)),advanced=featureEnabled("build_profiles");
  if(!Array.isArray(candidate.builds))candidate.builds=[];
  candidate.builds[i]={v:2,mode:modeId(),fac:S.fac,attr:{...S.attr},sk:{...S.sk},slots:(S.slots||[0,0,0,0]).slice(),
    main:S.main||0,mainLock:!!S.mainLock,rot:S.rot!==false,lvl:S.lvl,at:Date.now(),
    equipment:advanced?Object.fromEntries(Object.entries(S.eq).filter(([,it])=>it).map(([slot,it])=>[slot,it.uid])):null};
  const result=buildPersist(candidate);if(result.ok)result.msg=`Đã lưu bộ ${i+1}${advanced?" cùng trang bị":" võ học"}`;return result;
};

buildLoad=function(i) {
  const problem=buildChangeProblem();if(problem)return buildResult([problem]);
  const locked=buildSlotProblem(i);if(locked) return buildResult([locked]);
  const preview=buildPreview(i);if(!preview.ok)return preview;
  const result=buildPersist(preview.candidate);if(result.ok)result.msg=`Đã dùng bộ ${i+1}`;return result;
};

{
  const oldAttrs=respecAttrs,oldSkills=respecSkills;
  respecAttrs=function(){const problem=buildChangeProblem();if(problem){toast(problem);return 0;}return oldAttrs();};
  respecSkills=function(){const problem=buildChangeProblem();if(problem){toast(problem);return 0;}return oldSkills();};
}

buildsHTML=function() {
  const advanced=featureEnabled("build_profiles");
  const rows=builds().map((b,i)=>{const locked=buildSlotLocked(i);
    const info=locked?`Mở ở cấp ${buildSlotNeed(i)}`:(b?`${sumObj(b.sk)} kỹ năng · ${sumObj(b.attr)} tiềm năng${b.equipment?" · "+Object.keys(b.equipment).length+" trang bị":" · chỉ võ học"}`:"Trống");
    return `<div class="qrow build-profile-row${locked?" lock":""}"><span><b>Bộ ${i+1}</b><small>${info}</small></span><span class="build-profile-actions"><button class="btn sm" data-bsave="${i}" ${locked?"disabled":""}>Lưu</button><button class="btn sm" data-bpreview="${i}" ${b&&!locked?"":"disabled"}>Xem</button><button class="btn sm" data-bload="${i}" ${b&&!locked?"":"disabled"}>Dùng</button></span></div>`;}).join("");
  return `<h3>Bộ võ học${advanced?" và trang bị":""}</h3><div class="card">${rows}<small class="dim">${advanced?"Lưu trang bị đang sở hữu; đồ thiếu hoặc khóa được báo trước khi đổi.":"Lưu điểm, chiêu và rotation. Build kèm trang bị đang tắt."} Không đổi trong hoạt động.</small><div class="btnrow"><button class="btn red" id="bRespecAll">Tẩy toàn bộ điểm</button></div></div>`;
};

bindBuilds=function(rerender) {
  const done=result=>{toast(result.msg);if(result.ok)updateDots();rerender();};
  document.querySelectorAll("#t-skill [data-bsave]").forEach(b=>b.onclick=()=>done(buildSave(+b.dataset.bsave)));
  document.querySelectorAll("#t-skill [data-bload]").forEach(b=>b.onclick=()=>done(buildLoad(+b.dataset.bload)));
  document.querySelectorAll("#t-skill [data-bpreview]").forEach(b=>b.onclick=()=>{
    const result=buildPreview(+b.dataset.bpreview),p=result.summary;
    modal(`<h3>Xem build ${+b.dataset.bpreview+1}</h3>${result.ok?`<div class="card stats"><span>Sinh lực</span><span>${fmt(p.life)}</span><span>Nội lực</span><span>${fmt(p.mana)}</span><span>DPS ước tính</span><span>${fmt(p.dps)}</span><span>Trang bị</span><span>${p.equipmentCount}</span></div><p class="dim">Chưa áp dụng. DPS là ước tính từ chỉ số, không phải kết quả phòng luyện.</p>`:`<p class="bad">${result.errors.map(esc).join("<br>")}</p>`}`);
  });
  const reset=document.getElementById("bRespecAll");
  if(reset)reset.onclick=()=>{
    const problem=buildChangeProblem();if(problem){toast(problem);return;}
    modal('<h3>Tẩy toàn bộ điểm?</h3><p class="desc">Trả điểm về kho, giữ trang bị và quota. Nên lưu build trước.</p><button class="btn red" id="rsYes">Tẩy</button>',()=>{
      document.getElementById("rsYes").onclick=()=>{
        const blocked=buildChangeProblem();if(blocked){toast(blocked);return;}
        const candidate=JSON.parse(JSON.stringify(S));candidate.attrPts+=sumObj(candidate.attr);candidate.skPts+=sumObj(candidate.sk);
        candidate.attr={str:0,dex:0,vit:0,eng:0};candidate.sk={};candidate.main=0;candidate.mainLock=false;candidate.slots=[0,0,0,0];
        const result=buildPersist(candidate);if(result.ok){result.msg="Đã trả toàn bộ điểm";closeModal(true);}done(result);
      };
    });
  };
};
