"use strict";
const EXPEDITION_TRAVEL=Object.freeze({v:1,medicineCooldown:10,warning:1.5,escapeHold:3,lootMax:6});
function expeditionGoldPerSegment(e){return Math.floor(e.travel.cost*.5);}
function expeditionLootLimit(){return 6;}
function expeditionTravelState(){
  const e=expeditionState(),t=e?.travel;
  if(!e||!t||t.v!==1)return null;
  if(!Number.isSafeInteger(t.cost)||t.cost<1||t.cost>1e9||!Number.isFinite(t.gold)||t.gold<0||t.gold>t.cost*1.5)return null;
  if(!Array.isArray(t.items)||t.items.length>6||!Array.isArray(t.rested)||t.rested.length>3||new Set(t.rested).size!==t.rested.length||!t.rested.every(n=>Number.isInteger(n)&&n>=1&&n<=3))return null;
  if(!["life","mana"].every(k=>Number.isFinite(t.recovery?.[k])&&t.recovery[k]>0&&t.recovery[k]<1e9))return null;
  if(!Number.isFinite(t.cd)||t.cd<0||t.cd>10)return null;
  if(t.escape&&(!["x","y","r","hold"].every(k=>Number.isFinite(t.escape[k])&&t.escape[k]>=0)||t.escape.r!==42))return null;
  if(t.escape&&e.status==="active"&&(t.escape.x>WORLD.w||t.escape.y>WORLD.h||t.escape.hold>3.25))return null;
  if(e.phase==="retreat"&&!t.escape)return null;
  if(t.hazard&&(!["fire","cold","mana"].includes(t.hazard.kind)||!["x","y","r","warnUntil","until"].every(k=>Number.isFinite(t.hazard[k])&&t.hazard[k]>=0)||t.hazard.r!==72))return null;
  return {e,t};
}
function expeditionTravelEnabled(){return featureEnabled("expedition_travel")&&expeditionAllowed();}
function expeditionTravelPlan(P){
  const chosen=kind=>{
    const target=P[kind]*.4,list=J.potions.filter(p=>p.kind===kind).sort((a,b)=>a.total-b.total);
    return list.find(p=>p.total>=target)||list.at(-1);
  };
  const life=chosen("life"),mana=chosen("mana");
  if(!life||!mana)throw Error("Chưa có cấu hình thuốc hành trình");
  const cost=2*(potPrice(life)+potPrice(mana));
  return {cost,travel:{v:1,cost,gold:0,items:[],recovery:{life:life.total*(diffOf().pot??1),mana:mana.total},
    potionNames:{life:life.n,mana:mana.n},cd:0,rested:[],hazard:null,nextHazard:6,escape:null,escaped:false,claimed:false}};
}
function expeditionUseSupply(kind){
  const state=expeditionTravelState();
  if(!state||!expeditionTravelEnabled()||!["life","mana"].includes(kind)||state.e.status!=="active"||state.e.phase==="prepare"||R.expeditionBlocked)return {ok:false,msg:"Chưa dùng được vật tư chuyến"};
  if(S.chal==="nopot")return {ok:false,msg:"Bất dược: không dùng thuốc"};
  const {e,t}=state,maximum=R.P[kind],value=kind==="life"?R.life:R.mana;
  if(e.supplies[kind]<=0||t.cd>0||value>=maximum)return {ok:false,msg:"Đã hết thuốc, còn hồi hoặc tài nguyên đang đầy"};
  const useful=Math.min(t.recovery[kind],Math.max(0,maximum-value));
  return expeditionWrite(()=>{
    const current=expeditionTravelState();if(!current||current.e.supplies[kind]<=0||current.t.cd>0)throw Error("Vật tư vừa thay đổi");
    current.e.supplies[kind]--;current.t.cd=10;current.e[kind]=value+useful;
  },()=>{
    if(kind==="life")R.life=value+useful;else R.mana=value+useful;
    combatRecord(kind==="life"?"heal":"mana",{sourceId:"player",targetId:"player",raw:t.recovery[kind],capacity:maximum-value,reason:"expedition_supply"});
  });
}
function expeditionRest(){
  const state=expeditionTravelState();if(!state||!expeditionTravelEnabled()||state.e.phase!=="rest"||R.expeditionBlocked)return {ok:false,msg:"Chỉ nghỉ sức tại điểm nghỉ"};
  const segment=state.e.cleared;if(state.t.rested.includes(segment))return {ok:false,msg:"Đã nghỉ ở chặng này"};
  const life=R.life,mana=R.mana,heal=R.P.life*.2,recover=R.P.mana*.2;
  return expeditionWrite(()=>{
    const {e,t}=expeditionTravelState();if(t.rested.includes(segment))throw Error("Đã nghỉ tại đây");
    t.rested.push(segment);t.cd=0;e.life=Math.min(R.P.life,life+heal);e.mana=Math.min(R.P.mana,mana+recover);
  },()=>{
    R.life=Math.min(R.P.life,life+heal);R.mana=Math.min(R.P.mana,mana+recover);
    combatRecord("heal",{sourceId:"player",targetId:"player",raw:heal,capacity:R.P.life-life,reason:"expedition_rest"});
    combatRecord("mana",{sourceId:"player",targetId:"player",raw:recover,capacity:R.P.mana-mana,reason:"expedition_rest"});
  });
}
function expeditionEscapePoint(){
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,raw=inWorld(H.x+Math.cos(a)*240,H.y+Math.sin(a)*240);
    const point=typeof obsSnap==="function"?obsSnap(...raw):raw;
    if(typeof obsWalk==="function"&&!obsWalk(...point))continue;
    if(OBS.g&&typeof obsPath==="function"&&!obsLine(H.x,H.y,...point)&&!obsPath(H.x,H.y,...point))continue;
    if(Math.hypot(point[0]-H.x,point[1]-H.y)>=80)return {x:point[0],y:point[1],r:42,hold:0};
  }
  // A tiny reachable component still has a safe exit at the current walkable position.
  if(!OBS.g||obsWalk(H.x,H.y))return {x:H.x,y:H.y,r:42,hold:0};
  throw Error("Chưa tìm được đường rút; hãy thử ở ô đi được");
}
function expeditionRetreat(){
  const state=expeditionTravelState();if(!state||!expeditionTravelEnabled()||state.e.phase!=="segment"||R.expeditionBlocked)return {ok:false,msg:"Chỉ mở đường rút khi đang chiến đấu"};
  let escape;try{escape=expeditionEscapePoint();}catch(e){return {ok:false,msg:e.message};}
  return expeditionWrite(()=>{const {e,t}=expeditionTravelState();e.phase="retreat";t.escape=escape;t.hazard=null;t.pursuitAt=e.elapsed+2;},()=>{
    combatRecord("phase",{reason:"expedition_retreat_warning"});
  });
}
function expeditionTravelAuto(dt){
  const state=expeditionTravelState();if(!state)return;
  state.t.cd=Math.max(0,state.t.cd-dt);
  if(S.potOff||S.chal==="nopot"||manual()||R.expeditionBlocked)return;
  const policy=typeof combatPolicy==="function"?combatPolicy():null;
  const low=policy?.profile==="conserve"?.3:.5;
  if(R.life<R.P.life*low)expeditionUseSupply("life");
  else if(R.P.main.cost>0&&R.mana<R.P.main.cost*(policy?.profile==="conserve"?1:2))expeditionUseSupply("mana");
}
function expeditionTravelHazard(dt){
  const state=expeditionTravelState();if(!state||state.e.phase!=="segment")return;
  const {e,t}=state;
  if(!t.hazard&&e.elapsed>=t.nextHazard){
    t.hazard={x:H.x,y:H.y,r:72,kind:["","fire","cold","mana"][e.segment],warnUntil:e.elapsed+1.5,until:e.elapsed+5.5,fired:false};
    t.nextHazard=e.elapsed+8;combatRecord("phase",{reason:"expedition_"+t.hazard.kind+"_warning"});
  }
  const hazard=t.hazard;if(!hazard)return;
  if(e.elapsed>=hazard.until){t.hazard=null;return;}
  if(e.elapsed<hazard.warnUntil||Math.hypot(H.x-hazard.x,H.y-hazard.y)>hazard.r)return;
  if(hazard.kind==="fire"&&!hazard.fired){
    hazard.fired=true;
    const capacity=Math.max(0,R.life),raw=heroGuard(applyPart(R.P.life*.12,"fire",3,R.P.series,R.P.res,PLAYER_RES_MAX,10));
    R.life=Math.max(0,R.life-raw);combatRecord("damage",{sourceId:"environment",targetId:"player",raw,capacity,reason:"expedition_fire"+(R.life<=0?"_fatal":"")});
    if(R.life<=0)heroDeath();
  }else if(hazard.kind==="mana"){
    const capacity=R.mana,raw=R.P.mana*.04*dt;R.mana=Math.max(0,R.mana-raw);
    combatRecord("mana",{sourceId:"environment",targetId:"player",raw,capacity,reason:"expedition_storm_spend"});
  }
}
{
  const futureTravel=()=>S.extensions?.expedition?.travel&&S.extensions.expedition.travel.v!==1;
  const originalPrepare=expeditionPrepare,originalRecover=expeditionRecover;
  expeditionPrepare=function(){if(futureTravel())return {ok:false,msg:"Phiên bản vật tư chưa được hỗ trợ"};return originalPrepare();};
  expeditionRecover=function(){if(futureTravel())return {ok:false,msg:"Giữ nguyên chuyến của phiên bản mới hơn"};return originalRecover();};
  const originalAllowed=expeditionAllowed;
  expeditionAllowed=function(){return originalAllowed()&&(!expeditionActive()||!S.extensions?.expedition?.travel||featureEnabled("expedition_travel"));};
  const originalEntry=expeditionEntryPlan;
  expeditionEntryPlan=function(P,id){return featureEnabled("expedition_travel")?expeditionTravelPlan(P):originalEntry(P,id);};
  const originalClear=expeditionClearExtra;
  expeditionClearExtra=function(e){
    originalClear(e);if(!e.travel)return;
    const {t}=expeditionTravelState();t.gold=expeditionGoldPerSegment(e)*e.cleared;t.hazard=null;
    // Retry rolls identical properties; UID allocation remains inside the atomic save.
    const random=Math.random;let seed=2166136261;for(const c of e.id+":"+e.cleared)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    try{
      Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const items=rollDrops({L:Math.min(e.level,S.lvl+DROP_OVER),cls:"elite",bonusDrop:1});
      t.items.push(...items.filter(it=>modeItemOk(it,"phlt")).slice(0,Math.max(0,expeditionLootLimit(e)-t.items.length)));
    }finally{Math.random=random;}
  };
  const originalReward=expeditionReward;
  expeditionReward=function(e,outcome){
    originalReward(e,outcome);if(!e.travel||!["completed","withdrawn"].includes(outcome))return;
    const state=expeditionTravelState();if(!state||!expeditionTravelEnabled())throw Error("Luật thưởng chuyến đi chưa hợp lệ");
    const {t}=state;if(t.claimed)throw Error("Chuyến đã chốt thưởng");
    if(t.gold!==expeditionGoldPerSegment(e)*e.cleared||t.items.length>expeditionLootLimit(e))throw Error("Phần thưởng không khớp chặng đã qua");
    if(e.phase==="retreat"&&!t.escaped)throw Error("Chưa tới điểm rút");
    if(S.inv.length+t.items.length>INV_MAX)throw Error("Hành trang thiếu chỗ; dọn túi rồi thử lưu lại");
    const used=new Set([...S.inv,...Object.values(S.eq)].filter(Boolean).map(it=>it.uid));
    for(const item of t.items){if(!modeItemOk(item,"phlt")||used.has(item.uid))throw Error("Loot không hợp lệ hoặc UID trùng");used.add(item.uid);}
    S.gold+=t.gold;S.inv.push(...JSON.parse(JSON.stringify(t.items)));t.claimed=true;
    t.receipt={session:e.id,gold:t.gold,items:t.items.length,finished:Date.now()};
  };
  const originalFinish=expeditionFinish;
  expeditionFinish=function(outcome="withdrawn"){
    if(futureTravel())return {ok:false,msg:"Không đổi chuyến của phiên bản mới hơn"};
    const state=expeditionTravelState();
    if(state&&outcome==="withdrawn"){
      if(state.e.phase==="segment")return expeditionRetreat();
      if(state.e.phase==="retreat"&&!state.t.escaped)return {ok:false,msg:"Đi tới vòng rút và giữ vị trí 3 giây"};
    }
    return originalFinish(outcome);
  };
  const originalRetry=expeditionRetrySave;
  expeditionRetrySave=function(){if(futureTravel())return {ok:false,msg:"Phiên bản vật tư chưa được hỗ trợ"};if(expeditionActive()&&S.extensions?.expedition?.travel&&!featureEnabled("expedition_travel"))return originalFinish("interrupted");return originalRetry();};
  const originalPotion=autoPotion;
  autoPotion=function(dt){if(expeditionTravelState())return expeditionTravelAuto(dt);return originalPotion(dt);};
  if(typeof drinkNow==="function"){const originalDrink=drinkNow;drinkNow=function(kind){if(expeditionTravelState()){const r=expeditionUseSupply(kind);if(!r.ok)toast(r.msg);return r;}return originalDrink(kind);};}
  const originalTick=tick;
  tick=function(dt){
    if(expeditionActive()&&futureTravel())return;
    const state=expeditionTravelState();
    if(expeditionActive()&&S.extensions?.expedition?.travel&&!state){if(!R.expeditionBlocked){if(expeditionState())originalFinish("interrupted");else expeditionRecover();}return;}
    if(!state||!expeditionActive()||!expeditionTravelEnabled()||R.expeditionBlocked||R.expeditionUiPaused)return originalTick(dt);
    if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error("Bước hành trình không hợp lệ");
    const {e,t}=state,P=R.P,speed=P.speed,h=t.hazard;
    if(h?.kind==="cold"&&e.elapsed>=h.warnUntil&&e.elapsed<h.until&&Math.hypot(H.x-h.x,H.y-h.y)<=h.r)P.speed*=.75;
    if(e.phase==="retreat"&&!manual()){obsFrame();obsSteer(H,t.escape.x,t.escape.y,150*P.speed*dt);R.moveTo=null;}
    try{originalTick(dt);}finally{P.speed=speed;}
    if(!expeditionActive()||R.expeditionBlocked)return;
    expeditionTravelHazard(dt);
    if(!expeditionActive())return;
    if(e.phase==="retreat"){
      if(t.pursuitAt!=null&&e.elapsed>=t.pursuitAt){
        t.pursuitAt=null;const z=zoneOf(S.stage);
        for(let i=0;i<2;i++){const raw=inWorld(H.x-80,H.y+i*40),point=typeof obsSnap==="function"?obsSnap(...raw):raw;const enemy=makeEnemy(z.m[i%z.m.length],e.level,"normal",point[0],point[1]);enemy.expeditionId=e.id;enemy.spd*=1.15;R.enemies.push(enemy);}
        combatRecord("phase",{reason:"expedition_pursuit"});
      }
      t.escape.hold=Math.hypot(H.x-t.escape.x,H.y-t.escape.y)<=t.escape.r?t.escape.hold+dt:0;
      if(t.escape.hold>=3){t.escaped=true;expeditionFinish("withdrawn");}
    }
    if(expeditionActive()){const current=expeditionState();current.life=Math.max(0,R.life);current.mana=Math.max(0,R.mana);}
  };
}
