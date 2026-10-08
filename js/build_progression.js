"use strict";
const BUILD_ACHIEVEMENTS=Object.freeze(Object.fromEntries([
  ...Object.entries(RIFT_MODIFIERS).map(([k,m])=>['axis_'+k,{name:'Khám phá '+m.axis,kind:'axis',key:k}]),
  ['rift_first',{name:'Vượt năm cửa',kind:'rift'}],['build_three',{name:'Ba lối võ học',kind:'build'}],['seed_three',{name:'Ba bí cảnh khác nhau',kind:'seed'}],
]));
function buildProgressionAllowed(){return modeId()==='g2'&&featureEnabled('build_progression')&&!ADMV.sandbox&&!SAVE_LOCK;}
function buildProgressionState(){
  const p=S.extensions?.buildProgression;
  if(!p)return {v:1,mode:'g2',character:S.cid,axes:[],seeds:[],builds:[],completed:false,claims:[]};
  if(p.v!==1||p.mode!=='g2'||p.character!==S.cid||typeof p.completed!=='boolean')throw Error('Tiến trình build chưa hỗ trợ; giữ nguyên bản lưu');
  for(const [k,max,valid] of [['axes',6,x=>Object.hasOwn(RIFT_MODIFIERS,x)],['seeds',8,x=>Number.isInteger(x)&&x>=0&&x<=4294967295],['builds',12,x=>typeof x==='string'&&/^[a-z0-9_]{1,80}$/.test(x)],['claims',9,x=>Object.hasOwn(BUILD_ACHIEVEMENTS,x)]]){
    if(!Array.isArray(p[k])||p[k].length>max||new Set(p[k]).size!==p[k].length||p[k].some(x=>!valid(x)))throw Error('Tiến trình build không hợp lệ; giữ nguyên bản lưu');
  }
  return JSON.parse(JSON.stringify(p));
}
function buildProgressionObserve(p=buildProgressionState()){
  const next=JSON.parse(JSON.stringify(p)),r=riftState();
  if(r)for(const row of r.history){
    if(row?.outcome!=='completed'||row.cleared!==5||!Number.isInteger(row.seed)||row.seed<0||row.seed>4294967295||!riftModifiersValid(row.modifiers)||row.modifiers.length!==5)continue;
    next.completed=true;for(const key of row.modifiers)if(!next.axes.includes(key))next.axes.push(key);
    if(!next.seeds.includes(row.seed)&&next.seeds.length<8)next.seeds.push(row.seed);
  }
  if(featureEnabled('build_library'))for(const entry of buildLibraryEntries()){
    if(!entry.measurements.some(m=>m.version===COMBAT_MODEL_VERSION&&m.elapsed>=1&&m.status==='completed'))continue;
    try{const {data}=buildSharePreview(entry.code),ordered=x=>{if(Array.isArray(x))return x.map(ordered);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])]));return x;};
      const key=workbenchHash(JSON.stringify(ordered({fac:data.fac,attr:data.attr,sk:data.sk,main:data.main,slots:data.slots,recipe:data.recipe})));
      if(!next.builds.includes(key)&&next.builds.length<12)next.builds.push(key);
    }catch(e){}
  }
  return next;
}
function buildAchievementReady(id,p){
  const a=BUILD_ACHIEVEMENTS[id];if(!a)return false;
  return a.kind==='axis'?p.axes.includes(a.key):a.kind==='rift'?p.completed:a.kind==='build'?p.builds.length>=3:p.seeds.length>=3;
}
function buildProgressionWrite(p){
  const previous=JSON.parse(JSON.stringify(S));
  try{S.extensions||={v:1};S.extensions.buildProgression=p;if(!save())throw Error('Không lưu được tiến trình build');return {ok:true,msg:'Đã lưu tiến trình build'};}
  catch(e){S=previous;return {ok:false,msg:e.message};}
}
function buildProgressionSync(){
  if(!buildProgressionAllowed())return {ok:false,msg:'Tiến trình build chỉ mở trong2.0'};
  try{const p=buildProgressionState(),next=buildProgressionObserve(p);if(JSON.stringify(p)===JSON.stringify(next))return {ok:true,msg:'Không có tiến trình mới'};return buildProgressionWrite(next);}catch(e){return {ok:false,msg:e.message};}
}
function buildAchievementClaim(id){
  if(!buildProgressionAllowed())return {ok:false,msg:'Tiến trình build chưa mở'};
  try{const p=buildProgressionObserve();if(!buildAchievementReady(id,p))throw Error('Chưa đạt thành tựu');
    if(p.claims.includes(id))return {ok:true,replayed:true,msg:'Đã nhận ngoại hiệu này'};
    p.claims.push(id);return buildProgressionWrite(p);
  }catch(e){return {ok:false,msg:e.message};}
}
function buildProgressionReset(seed=42){
  if(!buildProgressionAllowed()||!riftAllowed())return {ok:false,msg:'Bắt đầu lại bí cảnh chưa mở'};
  try{buildProgressionState();}catch(e){return {ok:false,msg:e.message};}
  const r=riftState();if(r?.status==='active'){const end=riftFinish('withdrawn');if(!end.ok)return end;}
  return riftPrepare(seed);
}
{
  const original=riftFinish;riftFinish=function(){const result=original.apply(this,arguments);if(result.ok&&buildProgressionAllowed())buildProgressionSync();return result;};
  const originalMeasure=buildLibraryMeasure;buildLibraryMeasure=function(){const result=originalMeasure.apply(this,arguments);if(result.ok&&buildProgressionAllowed())buildProgressionSync();return result;};
}
