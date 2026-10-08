"use strict";
function riftState(){
  const r=S.extensions?.rift;
  if(!r||r.v!==1||r.rules!==RIFT_RULES.version||r.model!==COMBAT_MODEL_VERSION||r.mode!=='g2'||r.character!==S.cid||r.fac!==S.fac)return null;
  if(!['active','ended'].includes(r.status)||!['choice','combat','ended'].includes(r.phase)||!Number.isInteger(r.cleared)||r.cleared<0||r.cleared>5||!Number.isInteger(r.seed)||r.seed<0||r.seed>4294967295||!riftModifiersValid(r.modifiers))return null;
  if(r.status==='active'&&r.modifiers.length!==Math.min(5,r.cleared+(r.phase==='combat'?1:0))||r.status==='ended'&&(r.modifiers.length<r.cleared||r.modifiers.length>Math.min(5,r.cleared+1)))return null;
  if(typeof r.id!=='string'||r.id.length>80||!r.build||r.build.mode!=='g2'||r.build.fac!==S.fac||!Number.isFinite(r.life)||r.life<0||r.life>1||!Number.isFinite(r.mana)||r.mana<0||r.mana>1||!Array.isArray(r.history)||r.history.length>10)return null;
  return r;
}
function riftAllowed(){return modeId()==='g2'&&featureEnabled('skill_mutators')&&featureEnabled('training_lab')&&!ADMV.sandbox&&!SAVE_LOCK;}
function riftWrite(change){
  const previous=JSON.parse(JSON.stringify(S));
  try{change();if(!save())throw Error('Không lưu được bí cảnh');R.riftBlocked=false;return {ok:true,msg:'Đã lưu bí cảnh'};}
  catch(e){S=previous;R.riftBlocked=true;return {ok:false,msg:e.message};}
}
function riftPrepare(seed=42){
  if(!riftAllowed()||S.lvl<20||buildChangeProblem()||activityBusy())return {ok:false,msg:'Bí cảnh mở riêng2.0 từ cấp20; kết thúc hoạt động hiện tại trước'};
  if(!Number.isInteger(seed)||seed<0||seed>4294967295||S.extensions?.rift&&S.extensions.rift.v!==1)return {ok:false,msg:'Seed hoặc phiên bản bí cảnh chưa hỗ trợ'};
  if(S.extensions?.rift&&!riftState())return {ok:false,msg:'Bí cảnh cũ chưa hợp lệ; giữ nguyên để phục hồi'};
  const build=JSON.parse(JSON.stringify(S));delete build.extensions;build.extensions={v:1};build.inv=[];build.ground=[];
  const history=riftState()?.history||[],id='rift_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  const result=riftWrite(()=>{S.extensions||={v:1};S.extensions.rift={v:1,rules:RIFT_RULES.version,model:COMBAT_MODEL_VERSION,id,character:S.cid,fac:S.fac,mode:'g2',status:'active',phase:'choice',seed,cleared:0,modifiers:[],life:1,mana:1,build,history};});
  if(result.ok){R.riftRun=null;R.riftPaused=false;}return result;
}
function riftPreview(r=riftState()){
  if(!r)throw Error('Phiên bí cảnh không hợp lệ');
  const previous=S,old={...R};let p;
  try{S=r.build;R.training=true;R.riftModifiers=r.modifiers;p=calc();}finally{S=previous;for(const k of Object.keys(R))delete R[k];Object.assign(R,old);}
  const dps=Object.values(p.main.parts).reduce((x,y)=>x+y,0)*p.main.rate;
  return {seed:(r.seed+r.cleared*7919)>>>0,duration:60,targets:1+r.cleared%3,hp:Math.min(1e9,Math.max(20,dps*(3+r.cleared))),def:100,series:r.cleared%5,resistance:r.cleared*3,
    incomingDamage:Math.min(1e6,p.life*(.025+r.cleared*.006)),manaFraction:r.mana,cls:r.cleared===4?'boss':'normal'};
}
function riftChoose(key){
  const r=riftState();if(!riftAllowed()||!r||r.status!=='active'||r.phase!=='choice'||r.cleared>=5||!riftChoices(r.seed,r.cleared,r.modifiers).includes(key))return {ok:false,msg:'Lựa chọn chưa hợp lệ'};
  const next={...r,modifiers:[...r.modifiers,key],phase:'combat'};let run;
  try{run=trainingCreate(riftPreview(next),r.build,{riftModifiers:next.modifiers});run.runtime.life=run.runtime.P.life*r.life;}catch(e){return {ok:false,msg:e.message};}
  const result=riftWrite(()=>{S.extensions.rift.modifiers=next.modifiers;S.extensions.rift.phase='combat';});if(result.ok){R.riftRun=run;R.riftPaused=false;}return result;
}
function riftFinish(outcome='withdrawn'){
  const r=riftState();if(!r||r.status!=='active'||!['completed','failed','withdrawn','interrupted'].includes(outcome)||outcome==='completed'&&r.cleared!==5)return {ok:false,msg:'Chưa thể kết thúc bí cảnh'};
  const result=riftWrite(()=>{const e=riftState();e.status='ended';e.phase='ended';e.outcome=outcome;
    e.history=[{id:e.id,seed:e.seed,cleared:e.cleared,outcome,modifiers:e.modifiers.slice(),finished:Date.now()},...e.history].slice(0,10);
    // Cosmetic-only, atomic with completion; no stat/item/gold/quota changes.
    if(outcome==='completed')e.badge='rift-five';
  });if(result.ok){R.riftRun=null;R.riftPaused=false;R.riftBlocked=false;}return result;
}
function riftStep(dt){
  const r=riftState();if(!r)return;
  if(!riftAllowed()){if(!SAVE_LOCK&&!ADMV.sandbox)riftFinish('interrupted');return;}
  if(r.phase!=='combat'||R.riftPaused||R.riftBlocked)return;
  const run=R.riftRun;if(!run)return riftFinish('interrupted');
  if(run.runtime.life<=0)return riftFinish('failed');
  if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error('Bước bí cảnh không hợp lệ');
  const result=trainingAdvance(run,dt);
  if(result.status==='defeated')return riftFinish('failed');
  if(run.runtime.enemies.every(e=>e.hp<=0)){
    const result=riftWrite(()=>{const e=riftState();e.cleared++;e.phase='choice';e.life=Math.max(0,Math.min(1,run.runtime.life/run.runtime.P.life));e.mana=Math.max(0,Math.min(1,run.runtime.mana/run.runtime.P.mana));});
    if(result.ok){R.riftRun=null;if(riftState().cleared===5)return riftFinish('completed');}
  }else if(result.status==='completed')return riftFinish('failed');
}
function riftRecover(){
  if(R.riftRun||!S.extensions?.rift||S.extensions.rift.status!=='active'||SAVE_LOCK||ADMV.sandbox)return;
  const r=riftState();if(r)return riftFinish('interrupted');
  // Preserve unknown schemas; a malformed known state cannot execute or claim.
  if(S.extensions.rift.v===1)return riftWrite(()=>{S.extensions.rift.status='ended';S.extensions.rift.phase='ended';S.extensions.rift.outcome='invalid_interrupted';});
}
{
  const originalBusy=activityBusy;activityBusy=function(){return S.extensions?.rift?.v===1&&S.extensions.rift.status==='active'||originalBusy.apply(this,arguments);};
  const originalTick=tick;tick=function(dt){if(S.extensions?.rift?.v===1&&S.extensions.rift.status==='active'){if(!riftState()){riftRecover();return;}return riftStep(dt);}return originalTick(dt);};
  const originalLoad=modeAfterLoad;modeAfterLoad=function(){const result=originalLoad.apply(this,arguments);riftRecover();return result;};
  setTimeout(riftRecover,0);
}
