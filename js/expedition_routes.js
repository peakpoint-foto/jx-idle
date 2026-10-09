"use strict";
const EXPEDITION_ROUTES=Object.freeze({
  shelter:Object.freeze({name:"Đường trú ẩn",hp:.8,damage:.85,gold:.35,loot:3,hazards:["cold","mana","cold"]}),
  salvage:Object.freeze({name:"Đường phế tích",hp:1.15,damage:1.1,gold:.45,loot:6,hazards:["fire","cold","mana"]}),
});
function expeditionRouteRules(e=expeditionState()){
  const r=e?.travel?.route;if(!r)return null;
  if(r.v!==1||!Object.hasOwn(EXPEDITION_ROUTES,r.id)||typeof r.contract!=="boolean"||r.contract&&r.id!=="salvage")throw Error("Lựa chọn đường chưa hợp lệ");
  const base=EXPEDITION_ROUTES[r.id];
  // 2.12: cộng modifier từ ngã rẽ đã chọn.
  const forks=e?.travel?.forks?Object.values(e.travel.forks):[];
  const fm=typeof expeditionForkMods==="function"?expeditionForkMods(forks):{hp:1,damage:1,gold:1,loot:0};
  return {...base,hp:base.hp*(r.contract?1.25:1)*fm.hp,damage:base.damage*(r.contract?1.2:1)*fm.damage,
    gold:(r.contract?.5:base.gold)*fm.gold,loot:base.loot+fm.loot};
}
function expeditionRoutePreview(id="shelter",contract=false){
  if(!featureEnabled("expedition_routes")||!expeditionTravelEnabled())throw Error("Chọn đường chưa mở trong PHLT");
  const plan=expeditionTravelPlan(R.P||calc()),route={v:1,id,contract};
  const rules=expeditionRouteRules({travel:{route}}),z=zoneOf(S.stage);
  return {route,rules,cost:plan.cost,goldPerSegment:Math.floor(plan.cost*rules.gold),lootMax:rules.loot,
    enemies:z.m.map(tid=>MON[tid].n),level:S.lvl,loot:"Nguồn rơi elite bản địa, giữ cap PHLT Tím/Hoàng Kim; không bảo đảm phẩm chất hoặc số món.",
    control:"Khống chế dùng luật combat hiện có: ngắt đòn quái để giảm tổn thất và giữ thuốc; không yêu cầu hệ phái.",
    gear:typeof buildAdvice==="function"&&featureEnabled("build_advice")?{survival:buildAdvice("survival"),mana:buildAdvice("mana")}:null};
}
{
  let selection=null;
  const originalPrepare=expeditionPrepare,originalEntry=expeditionEntryPlan;
  expeditionPrepare=function(options){
    if(S.extensions?.expedition?.travel?.route&&S.extensions.expedition.travel.route.v!==1)return {ok:false,msg:"Giữ nguyên dữ liệu đường phiên bản mới"};
    if(expeditionActive())return {ok:false,msg:"Đường đã chốt khi chuẩn bị; không đổi hoặc đặt lại thưởng"};
    selection=null;
    if(featureEnabled("expedition_routes")){
      try{selection=expeditionRoutePreview(options?.route||"shelter",options?.contract??false).route;}catch(e){return {ok:false,msg:e.message};}
    }else if(options)return {ok:false,msg:"Chọn đường chưa mở"};
    try{return originalPrepare();}finally{selection=null;}
  };
  expeditionEntryPlan=function(P,id){const plan=originalEntry(P,id);if(selection){if(!plan.travel)throw Error("Cần bật vật tư trước khi chọn đường");plan.travel.route={...selection};}return plan;};
  const originalState=expeditionTravelState;
  expeditionTravelState=function(){const state=originalState();if(!state)return null;try{expeditionRouteRules(state.e);}catch{return null;}return state;};
  const originalGold=expeditionGoldPerSegment,originalLoot=expeditionLootLimit;
  expeditionGoldPerSegment=function(e){const rules=expeditionRouteRules(e);return rules?Math.floor(e.travel.cost*rules.gold):originalGold(e);};
  expeditionLootLimit=function(e){return expeditionRouteRules(e)?.loot??originalLoot(e);};
  const originalSpawn=expeditionSpawn;
  expeditionSpawn=function(){originalSpawn();const rules=expeditionRouteRules();if(!rules)return;for(const enemy of R.enemies){enemy.hp*=rules.hp;enemy.max*=rules.hp;enemy.dmg*=rules.damage;}};
  const originalHazard=expeditionTravelHazard;
  expeditionTravelHazard=function(dt){
    const state=expeditionTravelState(),rules=state&&expeditionRouteRules(state.e);
    if(rules&&state.e.phase==="segment"&&!state.t.hazard&&state.e.elapsed>=state.t.nextHazard){
      const {e,t}=state;t.hazard={x:H.x,y:H.y,r:72,kind:rules.hazards[e.segment-1],warnUntil:e.elapsed+1.5,until:e.elapsed+5.5,fired:false};
      t.nextHazard=e.elapsed+8;combatRecord("phase",{reason:"expedition_"+t.hazard.kind+"_warning"});
    }
    return originalHazard(dt);
  };
  const originalAllowed=expeditionAllowed;
  expeditionAllowed=function(){return originalAllowed()&&(!expeditionActive()||!S.extensions?.expedition?.travel?.route||featureEnabled("expedition_routes"));};
  // Future route schemas remain untouched, including on reload or flag changes.
  const future=()=>S.extensions?.expedition?.travel?.route&&S.extensions.expedition.travel.route.v!==1;
  const originalFinish=expeditionFinish,originalRecover=expeditionRecover,originalRetry=expeditionRetrySave,originalTick=tick;
  expeditionFinish=function(outcome){return future()?{ok:false,msg:"Giữ nguyên dữ liệu đường phiên bản mới"}:originalFinish(outcome);};
  expeditionRecover=function(){if(!future())return originalRecover();};
  expeditionRetrySave=function(){if(future())return {ok:false,msg:"Phiên bản đường chưa hỗ trợ"};if(expeditionActive()&&S.extensions?.expedition?.travel?.route&&!featureEnabled("expedition_routes"))return originalFinish("interrupted");return originalRetry();};
  tick=function(dt){if(!future())return originalTick(dt);};
}
