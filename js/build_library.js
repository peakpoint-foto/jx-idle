"use strict";

function buildLibraryGuard(){if(modeId()!=="g2"||!featureEnabled("build_library"))throw new Error("Thư viện build chỉ mở cho 2.0");}
function buildShareExport(index=-1) {
  buildLibraryGuard();const state=buildComparisonState(index);
  const payload={v:1,mode:"g2",fac:state.fac,attr:{...state.attr},sk:{...state.sk},slots:(state.slots||[0,0,0,0]).slice(),
    main:state.main||0,mainLock:!!state.mainLock,rot:state.rot!==false,
    recipe:Object.fromEntries(Object.entries(state.eq).filter(([,it])=>it).map(([slot,it])=>[slot,{d:it.d,k:it.k,lvl:it.lvl,s:it.s,r:it.r,
      attrs:Object.entries(itemAttributeValues(it,false)).filter(([attr])=>Object.hasOwn(LOOT_RULE_NAMES,attr)).slice(0,32).map(([attr,value])=>({attr,value}))}]))};
  return "JXB1:"+btoa(JSON.stringify(payload));
}
function buildSharePreview(code) {
  buildLibraryGuard();
  if(typeof code!=="string"||code.length>16384||!/^JXB1:[A-Za-z0-9+/]+={0,2}$/.test(code))throw new Error("Mã build sai định dạng hoặc quá lớn");
  let data;try{data=JSON.parse(atob(code.slice(5)));}catch(e){throw new Error("Mã build bị lỗi");}
  const keys=["v","mode","fac","attr","sk","slots","main","mainLock","rot","recipe"];
  if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))throw new Error("Mã có trường ngoài schema");
  if(data.v!==1||data.mode!=="g2"||data.fac!==S.fac)throw new Error("Khác phiên bản, mode hoặc môn phái");
  if(typeof data.mainLock!=="boolean"||typeof data.rot!=="boolean")throw new Error("Cấu hình chiêu không hợp lệ");
  if(!data.recipe||typeof data.recipe!=="object"||Array.isArray(data.recipe)||Object.keys(data.recipe).length>12)throw new Error("Recipe không hợp lệ");
  for(const [slot,row] of Object.entries(data.recipe)){
    if(!Object.hasOwn(SLOT_VI,slot)||!row||Object.keys(row).some(k=>!["d","k","lvl","s","r","attrs"].includes(k))||
      !Number.isInteger(row.d)||!J.items[row.d]?.list.some(it=>it.k===row.k&&it.lvl===row.lvl)||
      !Number.isInteger(row.s)||row.s<0||row.s>4||!Number.isInteger(row.r)||row.r<0||row.r>MC().rarMax||
      DETAIL_SLOT[row.d]!== (slot.startsWith("ring")?"ring":slot)||!Array.isArray(row.attrs)||row.attrs.length>32||
      row.attrs.some(a=>!a||Object.keys(a).some(k=>!["attr","value"].includes(k))||!Object.hasOwn(LOOT_RULE_NAMES,a.attr)||!Number.isFinite(a.value)||a.value<0||a.value>1e9))
      throw new Error("Recipe chứa đồ hoặc thuộc tính chưa hỗ trợ");
  }
  const profile={v:2,mode:data.mode,fac:data.fac,attr:data.attr,sk:data.sk,slots:data.slots,main:data.main,mainLock:data.mainLock,rot:data.rot,equipment:null};
  const preview=buildCandidate(profile);if(!preview.ok)throw new Error(preview.errors.join("; "));
  return {data,profile,candidate:preview.candidate,summary:adviceSummary(preview.stats),code};
}
function buildLibraryEntries(){
  const lib=S.extensions?.buildLibrary;
  if(lib?.v!==1||!Array.isArray(lib.entries))return [];
  return lib.entries.filter(entry=>entry?.v===1&&typeof entry.label==="string"&&typeof entry.code==="string"&&entry.code.length<=16384).slice(0,12).map(entry=>({...entry,
    label:entry.label.slice(0,60),measurements:(Array.isArray(entry.measurements)?entry.measurements:[]).filter(m=>m?.parameters&&Number.isFinite(m.parameters.seed)&&Number.isFinite(m.elapsed)&&Number.isFinite(m.dps)&&typeof m.status==="string").slice(-5)}));
}
function buildLibraryWrite(entries) {
  const problem=buildChangeProblem();if(problem)return buildResult([problem]);buildLibraryGuard();
  if(S.extensions?.buildLibrary&&S.extensions.buildLibrary.v!==1)return buildResult(["Phiên bản thư viện mới hơn chưa hỗ trợ"]);
  if(entries.length>12||new TextEncoder().encode(JSON.stringify(entries)).length>65536)return buildResult(["Thư viện đã đầy (12 build / 64 KiB)"]);
  const candidate=JSON.parse(JSON.stringify(S));candidate.extensions||={v:1};candidate.extensions.buildLibrary={v:1,entries};return buildPersist(candidate);
}
function buildLibraryAdd(code,label) {
  const preview=buildSharePreview(code),entries=JSON.parse(JSON.stringify(buildLibraryEntries()));
  if(entries.some(entry=>entry.code===code))return buildResult(["Build đã có trong thư viện"]);
  entries.push({v:1,label:String(label||"Build chia sẻ").slice(0,60),code:preview.code,measurements:[]});return buildLibraryWrite(entries);
}
function buildLibraryApply(index) {
  const problem=buildChangeProblem();if(problem)return buildResult([problem]);
  const entry=buildLibraryEntries()[index];if(!entry)return buildResult(["Build không tồn tại"]);
  const preview=buildSharePreview(entry.code);return buildPersist(preview.candidate);
}
function buildLibraryMeasure(index,input={}) {
  const entry=buildLibraryEntries()[index];if(!entry)throw new Error("Build không tồn tại");
  const preview=buildSharePreview(entry.code),report=trainingRun(input,preview.candidate),entries=JSON.parse(JSON.stringify(buildLibraryEntries()));
  const measurement={version:report.version,parameters:report.parameters,status:report.status,elapsed:report.elapsed,dps:report.dps,
    usefulDamage:report.usefulDamage,manaRemaining:report.manaRemaining,healthLost:report.healthLost};
  entries[index].measurements=[...(entries[index].measurements||[]),measurement].slice(-5);
  const saved=buildLibraryWrite(entries);return {...saved,measurement};
}
function buildLibraryRemove(index){const entries=JSON.parse(JSON.stringify(buildLibraryEntries()));if(!Number.isInteger(index)||index<0||index>=entries.length)return buildResult(["Build không tồn tại"]);entries.splice(index,1);return buildLibraryWrite(entries);}
