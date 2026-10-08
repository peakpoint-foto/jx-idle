"use strict";

const EXPEDITION_RULES=Object.freeze({v:1,segments:3,maxSeconds:3600,checkpoint:5,level:20});
function expeditionHistory(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>x&&typeof x.id==="string"&&x.id.length<=80&&["completed","withdrawn","failed","interrupted"].includes(x.outcome)&&
    Number.isInteger(x.cleared)&&x.cleared>=0&&x.cleared<=3&&Number.isInteger(x.kills)&&x.kills>=0&&x.kills<=1e7&&
    Number.isFinite(x.elapsed)&&x.elapsed>=0&&x.elapsed<=3600.25&&Number.isFinite(x.finished)&&x.finished>=0&&x.finished<=1e15)
    .slice(0,5).map(({id,outcome,cleared,kills,elapsed,finished})=>({id,outcome,cleared,kills,elapsed,finished}));
}
function expeditionAllowed(){return modeId()==="phlt"&&featureEnabled("expedition")&&!ADMV.sandbox&&!SAVE_LOCK;}
function expeditionState(){
  const e=S.extensions?.expedition;
  if(!e||e.v!==1||e.mode!=="phlt"||e.character!==S.cid||e.fac!==S.fac)return null;
  if(!["active","ended"].includes(e.status)||!["prepare","segment","rest","retreat","ended"].includes(e.phase))return null;
  if(typeof e.id!=="string"||!e.id.startsWith("exp_")||e.id.length>80||!Number.isInteger(e.level)||e.level<1||e.level>MAX_LEVEL||!Array.isArray(e.history))return null;
  if(!Number.isInteger(e.segment)||e.segment<0||e.segment>3||!Number.isInteger(e.cleared)||e.cleared<0||e.cleared>3)return null;
  if(!["elapsed","life","mana","maxLife","maxMana","kills"].every(k=>Number.isFinite(e[k])&&e[k]>=0&&e[k]<=1e12))return null;
  if(!e.supplies||!["life","mana"].every(k=>Number.isInteger(e.supplies[k])&&e.supplies[k]>=0&&e.supplies[k]<=10))return null;
  return e;
}
function expeditionActive(){return S.extensions?.expedition?.status==="active";}
function expeditionEntryPlan(){return {cost:0,travel:null};}
function expeditionClearExtra(){}
function expeditionReward(){}
function expeditionWrite(change,after){
  const previous=JSON.parse(JSON.stringify(S));
  try{
    change();
    if(!save())throw Error("Không lưu được chuyến đi");
  }catch(e){
    S=previous;
    R.expeditionPending={change,after,character:S.cid,mode:S.mode};R.expeditionBlocked=true;
    return {ok:false,msg:e.message};
  }
  R.expeditionPending=null;R.expeditionBlocked=false;
  if(after)after();
  return {ok:true,msg:"Đã lưu trạng thái chuyến đi"};
}
function expeditionRetrySave(){
  if(modeId()!=="phlt"||ADMV.sandbox||SAVE_LOCK)return {ok:false,msg:"Chuyến đi không thuộc mode này hoặc bản lưu bị khóa"};
  if(!featureEnabled("expedition"))return expeditionActive()?expeditionFinish("interrupted"):{ok:false,msg:"Chuyến đi chưa mở"};
  const pending=R.expeditionPending;
  if(pending&&(pending.character!==S.cid||pending.mode!==S.mode)){R.expeditionPending=null;R.expeditionBlocked=false;return {ok:false,msg:"Nhân vật đã thay đổi; không dùng thao tác cũ"};}
  return pending?expeditionWrite(pending.change,pending.after):{ok:save(),msg:"Đã thử lưu lại"};
}
function expeditionRestore(){
  const runtime=R.expeditionRuntime;
  if(!runtime)return;
  const same=runtime.character===S.cid;
  if(same){
    for(const key of Object.keys(R))delete R[key];Object.assign(R,runtime.restore);
    for(const key of Object.keys(H))delete H[key];Object.assign(H,runtime.hero);
    if(runtime.obs)Object.assign(OBS,runtime.obs);
    if(runtime.world)Object.assign(WORLD,runtime.world);
    if(runtime.camera&&typeof CAM!=="undefined")Object.assign(CAM,runtime.camera);
    R.combatTrace=null;R.dirty=true;
  }else{R.expeditionRuntime=null;R.expeditionPending=null;R.expeditionBlocked=false;R.enemies=[];R.spawnT=1;}
}
function expeditionPrepare(){
  if(!expeditionAllowed()||!FAC[S.fac]||S.lvl<EXPEDITION_RULES.level)return {ok:false,msg:"Hành trình mở riêng PHLT từ cấp 20 khi tính năng được bật"};
  if(S.extensions?.expedition&&S.extensions.expedition.v!==1)return {ok:false,msg:"Phiên bản chuyến đi chưa được hỗ trợ"};
  if(activityBusy()||R.deadT>0||R.phaseBossCurrent)return {ok:false,msg:"Kết thúc hoạt động hiện tại trước"};
  if(R.dirty||!R.P)recalc();
  const P=R.P,id="exp_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
  let plan;try{plan=expeditionEntryPlan(P,id);}catch(e){return {ok:false,msg:e.message};}
  if(!Number.isSafeInteger(plan.cost)||plan.cost<0||plan.cost>S.gold)return {ok:false,msg:"Không đủ ngân lượng chuẩn bị"};
  const oldHistory=S.extensions?.expedition?.history;
  const history=expeditionHistory(oldHistory);
  const next={v:1,id,mode:"phlt",character:S.cid,fac:S.fac,status:"active",phase:"prepare",segment:0,cleared:0,
    level:S.lvl,started:Date.now(),elapsed:0,kills:0,life:P.life,mana:P.mana,maxLife:P.life,maxMana:P.mana,
    supplies:{life:2,mana:2},history,...(plan.travel?{travel:plan.travel}:{})};
  return expeditionWrite(()=>{if(S.gold<plan.cost)throw Error("Ngân lượng đã thay đổi");S.gold-=plan.cost;S.extensions=S.extensions||{v:1};S.extensions.expedition=JSON.parse(JSON.stringify(next));},()=>{
    // World actors and health are paused, never exchanged for expedition drops.
    const restore={...R,combatTrace:null};
    R.expeditionRuntime={character:S.cid,restore,hero:{...H},obs:typeof OBS!=="undefined"?{...OBS}:null,world:{...WORLD},camera:typeof CAM!=="undefined"?{...CAM}:null,checkpoint:0};
    R.enemies=[];R.corpses=[];R.ground=[];R.fx=[];R.txt=[];R.hot={};R.town=false;R.deadT=0;
    R.moveTo=null;R.pickTarget=null;R.life=next.life;R.mana=next.mana;R.atkT=Math.max(.3,R.atkT||0);
    combatRecord("phase",{reason:"expedition_prepare"});
  });
}
function expeditionDepart(){
  const e=expeditionState();
  if(!expeditionAllowed()||!e||e.status!=="active"||!["prepare","rest"].includes(e.phase)||R.expeditionBlocked)return {ok:false,msg:"Chưa thể đi tiếp"};
  const segment=e.cleared+1;if(segment>3)return {ok:false,msg:"Chuyến đi đã đủ chặng"};
  return expeditionWrite(()=>{const state=expeditionState();state.phase="segment";state.segment=segment;},()=>{
    if(segment===1){
      const z=zoneOf(S.stage);obsLoad(z.id);R.bgImg=z.bg?img(z.bg):R.bgImg;
      [H.x,H.y]=inWorld(WORLD.w/2,WORLD.h/2);
    }
    R.spawnT=0;R.stall=0;R.life=e.life;R.mana=e.mana;R.enemies=[];expeditionSpawn();
    combatRecord("phase",{reason:"expedition_segment_"+segment});
  });
}
function expeditionSpawn(){
  const e=expeditionState();if(!e||e.phase!=="segment")return;
  const z=zoneOf(S.stage),count=2+e.segment;
  R.enemies=[];
  for(let i=0;i<count;i++){
    const cls=e.segment===3&&i===0?"elite":"normal",a=i*Math.PI*2/count;
    const point=inWorld(H.x+Math.cos(a)*130,H.y+Math.sin(a)*130);
    const enemy=makeEnemy(z.m[i%z.m.length],e.level+e.segment-1,cls,point[0],point[1]);
    enemy.expeditionId=e.id;R.enemies.push(enemy);
  }
}
function expeditionCleared(){
  const e=expeditionState();if(!e||e.phase!=="segment")return;
  if(R.life<=0)return expeditionFinish("failed");
  const segment=e.segment,life=Math.max(0,R.life),mana=Math.max(0,R.mana);
  expeditionWrite(()=>{const state=expeditionState();state.cleared=segment;state.phase="rest";state.life=life;state.mana=mana;expeditionClearExtra(state);},()=>{
    R.enemies=[];R.moveTo=null;combatRecord("phase",{reason:"expedition_rest_"+segment});
  });
}
function expeditionFinish(outcome="withdrawn"){
  const e=expeditionState();
  if(!e||e.status!=="active"||!["withdrawn","completed","failed","interrupted"].includes(outcome))return {ok:false,msg:"Không có chuyến đi đang hoạt động"};
  if(outcome==="completed"&&e.cleared!==3)return {ok:false,msg:"Cần hoàn thành đủ ba chặng"};
  const summary={id:e.id,outcome,cleared:e.cleared,kills:e.kills,elapsed:e.elapsed,finished:Date.now()};
  return expeditionWrite(()=>{
    const candidate=expeditionState();expeditionReward(candidate,outcome);
    if(outcome==="failed")combatRecord("death",{targetId:"player",reason:"expedition_hp_zero"});
    const state=expeditionState();state.status="ended";state.phase="ended";state.outcome=outcome;
    state.life=Math.max(0,R.expeditionRuntime?R.life:state.life);state.mana=Math.max(0,R.expeditionRuntime?R.mana:state.mana);
    state.history=[summary,...expeditionHistory(state.history)].slice(0,5);
  },()=>{
    combatFinish(outcome==="failed"?"defeated":outcome==="completed"?"won":"aborted");
    expeditionRestore();
  });
}
function expeditionRecover(){
  if(R.expeditionRuntime?.character===S.cid)return;
  const raw=S.extensions?.expedition;
  if(!raw||raw.v!==1||raw.status!=="active"||SAVE_LOCK||ADMV.sandbox)return;
  const e=expeditionState();
  R.expeditionRecovering=true;
  try{
    if(e)return expeditionFinish("interrupted");
    // Known malformed/foreign v1 cannot unlock loot or execute its saved phase.
    return expeditionWrite(()=>{S.extensions.expedition={v:1,status:"ended",phase:"ended",outcome:"invalid_interrupted",mode:S.mode,character:S.cid,fac:S.fac};},()=>expeditionRestore());
  }finally{R.expeditionRecovering=false;}
}
{
  const originalSave=save;
  save=function(){
    const runtime=R.expeditionRuntime,ground=R.ground;
    if(R.expeditionRecovering)R.ground=undefined;
    else if(runtime?.character===S.cid)R.ground=runtime.restore.ground;
    try{return originalSave();}finally{R.ground=ground;}
  };
  const originalActivity=combatActivity;
  combatActivity=function(){return expeditionActive()?"expedition":originalActivity();};
  const originalSpawn=spawnWave;
  spawnWave=function(){if(expeditionActive()){if(expeditionState()?.phase==="segment")expeditionSpawn();return;}return originalSpawn();};
  const originalKill=onKill;
  onKill=function(enemy){
    if(expeditionActive()){
      const e=expeditionState();if(e&&enemy.expeditionId===e.id)e.kills++;
      return;
    }
    return originalKill(enemy);
  };
  const originalWave=waveCleared;
  waveCleared=function(){if(expeditionActive())return expeditionCleared();return originalWave();};
  const originalDeath=heroDeath;
  heroDeath=function(){if(expeditionActive())return expeditionFinish("failed");return originalDeath();};
  const originalPotion=autoPotion,originalBossTick=goldBossTick,originalBossDue=goldBossDue;
  const originalStock=takeStock,originalBest=bestPotion,originalUse=usePotion,originalStall=stallOut;
  takeStock=function(kind){return expeditionActive()?null:originalStock(kind);};
  bestPotion=function(kind){return expeditionActive()?null:originalBest(kind);};
  usePotion=function(){if(expeditionActive())return false;return originalUse.apply(this,arguments);};
  stallOut=function(){if(expeditionActive()){R.stall=0;return;}return originalStall();};
  if(typeof goTown==="function"){const originalTown=goTown;goTown=function(){if(expeditionActive()){toast("Rút khỏi chuyến đi trước khi về thành");return;}return originalTown();};}
  autoPotion=function(dt){if(expeditionActive())return;return originalPotion(dt);};
  goldBossTick=function(dt){if(expeditionActive())return;return originalBossTick(dt);};
  goldBossDue=function(){return !expeditionActive()&&originalBossDue();};
  const originalTick=tick;
  tick=function(dt){
    if(!expeditionActive())return originalTick(dt);
    const e=expeditionState(),runtime=R.expeditionRuntime;
    if(!e||!runtime||runtime.character!==S.cid){expeditionRecover();return;}
    if(R.expeditionBlocked)return;
    if(!expeditionAllowed()){if(!SAVE_LOCK&&!ADMV.sandbox)expeditionFinish("interrupted");return;}
    if(R.expeditionUiPaused||!["segment","retreat"].includes(e.phase))return;
    if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error("Bước chuyến đi không hợp lệ");
    e.elapsed+=dt;if(e.elapsed>=EXPEDITION_RULES.maxSeconds){expeditionFinish("interrupted");return;}
    R.sweepT=0;originalTick(dt);
    if(expeditionActive()){
      const state=expeditionState();state.life=Math.max(0,R.life);state.mana=Math.max(0,R.mana);state.maxLife=R.P.life;state.maxMana=R.P.mana;
      runtime.checkpoint+=dt;
      if(runtime.checkpoint>=EXPEDITION_RULES.checkpoint){
        runtime.checkpoint=0;
        if(!save()){R.expeditionBlocked=true;R.expeditionPending={change:()=>{},after:()=>{},character:S.cid,mode:S.mode};}
      }
    }
  };
  const originalAfterLoad=modeAfterLoad;
  modeAfterLoad=function(){const result=originalAfterLoad();expeditionRecover();return result;};
  setTimeout(()=>expeditionRecover(),0);
}
