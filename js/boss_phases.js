"use strict";

const PHASE_BOSS_RULES=Object.freeze({version:1,wardThreshold:.6,finalThreshold:.25,wardHp:.08,regen:.015,warning:1.5,radius:90,every:6,burstFraction:.25});
function phaseBossAllowed(){return modeId()==="ctc"&&featureEnabled("phased_boss")&&!ADMV.sandbox&&!R.training&&!R.tower&&!R.tk&&!R.town&&!S.siege&&!SV.on;}
function phaseBossAttach(boss) {
  if(!phaseBossAllowed()||!boss||boss.cls!=="boss"||boss.goldBoss||boss.hp<=0||!Number.isFinite(boss.max)||boss.max<=0)return false;
  if(R.phaseBossCurrent)return false;
  boss.phaseBoss={v:1,phase:1,next:PHASE_BOSS_RULES.every,warning:null,baseRegen:boss.regen||0,rewarded:false,aborted:false,
    character:S.cid,fac:S.fac,damage:0,healing:0,control:0,flagDamage:0,broken:0};
  R.phaseBossCurrent=boss;
  combatRecord("phase",{sourceId:"enemy",reason:"boss_phase_1"});return true;
}
function phaseBossCurrent() {
  const boss=R.phaseBossCurrent;
  return phaseBossAllowed()&&boss?.phaseBoss?.character===S.cid&&boss.phaseBoss.fac===S.fac&&!boss.phaseBoss.aborted&&!boss.phaseBoss.rewarded?boss:null;
}
function phaseBossSummary(boss,outcome) {
  const state=boss.phaseBoss,P=R.P;
  return {v:1,mode:"ctc",outcome,phase:state.phase,damage:state.damage,healing:state.healing,control:state.control,flagDamage:state.flagDamage,broken:state.broken,
    roles:[P?.main.dps>0?"Sát thương":null,P?.stunPct>0||P?.main.stun>0?"Khống chế":null,P?.regen>0||P?.leech>0?"Duy trì":null].filter(Boolean)};
}
function phaseBossCleanup(boss) {
  boss.regen=boss.phaseBoss.baseRegen;boss.phaseBoss.warning=null;
  R.enemies=R.enemies.filter(e=>e.phaseFlagOwner!==boss);
  if(R.phaseBossCurrent===boss)R.phaseBossCurrent=null;
}
function phaseBossAbort(outcome="aborted") {
  const boss=R.phaseBossCurrent;if(!boss||boss.phaseBoss.rewarded||boss.phaseBoss.aborted)return false;
  boss.phaseBoss.aborted=true;R.phaseBossResult=phaseBossSummary(boss,outcome);phaseBossCleanup(boss);
  // Restart the same wave; killing remaining mobs must not turn abort into a clear.
  R.enemies=[];R.spawnT=3;R.moveTo=null;R.policyTarget=null;
  combatRecord("phase",{reason:outcome==="defeated"?"boss_wipe":"boss_aborted"});
  if(outcome==="aborted")combatFinish("aborted");return true;
}
function phaseBossWard(boss) {
  const hp=Math.max(1,Math.round(boss.max*PHASE_BOSS_RULES.wardHp));
  const flag={...boss,id:String(boss.id)+"_ward",n:"Trận kỳ · phá để ngắt hồi",cls:"normal",goldBoss:false,phaseBoss:null,phaseFlagOwner:boss,
    hp,max:hp,x:boss.x+45,y:boss.y,r:12,regen:0,dmg:0,spd:0,atkCd:1e9,ultCd:1e9,stun:0,stunImm:0,poison:0,poisonDmg:0,dead:false,objective:true};
  R.enemies.push(flag);boss.regen=PHASE_BOSS_RULES.regen;
  combatRecord("phase",{reason:"boss_ward_spawned"});
}
function phaseBossTick(dt) {
  if(!Number.isFinite(dt)||dt<0)throw new Error("Bước boss không hợp lệ");
  const active=R.phaseBossCurrent;if(!active)return;
  const boss=phaseBossCurrent();
  if(!boss){phaseBossCleanup(active);return;}
  const state=boss.phaseBoss;
  if(boss.hp<=0||R.life<=0||R.deadT>0)return;
  const ratio=boss.hp/boss.max;
  if(state.phase===1&&ratio<=PHASE_BOSS_RULES.wardThreshold){state.phase=2;phaseBossWard(boss);combatRecord("phase",{reason:"boss_phase_2"});}
  if(state.phase===2&&ratio<=PHASE_BOSS_RULES.finalThreshold){state.phase=3;combatRecord("phase",{reason:"boss_phase_3"});}
  if(state.warning) {
    const warning=state.warning;
    if(!manual()&&Math.hypot(H.x-warning.x,H.y-warning.y)<warning.radius+20) {
      const dx=H.x-warning.x,dy=H.y-warning.y,len=Math.hypot(dx,dy)||1,tx=warning.x+(dx||1)/len*(warning.radius+35),ty=warning.y+dy/len*(warning.radius+35);
      if(typeof obsSteer==="function")obsSteer(H,tx,ty,150*R.P.speed*dt);
      R.moveTo=null;R.atkT=Math.max(R.atkT||0,dt+.01);combatPolicyReason("move","Tránh vùng báo nguy hiểm của boss");
    }
    warning.left-=dt;
    if(warning.left<=0){
      if(Math.hypot(H.x-warning.x,H.y-warning.y)<=warning.radius){
        const hp=Math.max(0,R.life),raw=ADMV.god?0:heroGuard(R.P.life*PHASE_BOSS_RULES.burstFraction);R.life-=raw;
        combatRecord("damage",{sourceId:"enemy",targetId:"player",raw,capacity:hp,reason:R.life<=0?"phase_burst_fatal":"phase_burst"});
      }
      state.warning=null;state.next=state.phase===3?PHASE_BOSS_RULES.every*.75:PHASE_BOSS_RULES.every;
    }
  } else {
    state.next-=dt;if(state.next<=0){state.warning={x:H.x,y:H.y,radius:PHASE_BOSS_RULES.radius,left:PHASE_BOSS_RULES.warning};combatRecord("phase",{reason:"boss_warning"});}
  }
}
{
  const originalSpawn=spawnWave;
  spawnWave=function(){const result=originalSpawn.apply(this,arguments);if(phaseBossAllowed()&&!R.phaseBossCurrent){const boss=R.enemies.find(e=>e.cls==="boss"&&!e.goldBoss);if(boss)phaseBossAttach(boss);}return result;};
  const originalTick=tick;
  tick=function(dt){phaseBossTick(dt);return originalTick.apply(this,arguments);};
  const originalAI=enemyAI;
  enemyAI=function(enemy,dt){if(enemy.phaseFlagOwner){tickEnemyStatuses(enemy,dt);return;}return originalAI.apply(this,arguments);};
  const originalHit=heroHit;
  heroHit=function(attack,enemy){const hp=Math.max(0,enemy.hp),raw=originalHit.apply(this,arguments);if(enemy.phaseFlagOwner?.phaseBoss)enemy.phaseFlagOwner.phaseBoss.flagDamage+=Math.min(raw,hp);return raw;};
  const originalRecord=combatRecord;
  combatRecord=function(kind,data={}){
    const boss=phaseBossCurrent(),state=boss?.phaseBoss;
    if(state){try{
      const event=combatEvent(kind,{...data,mode:"ctc",at:0});
      if(kind==="damage"&&data.targetId!=="player"&&["player","pet"].includes(data.sourceId))state.damage+=event.useful;
      if(kind==="heal"&&data.targetId==="player")state.healing+=event.useful;
      if(kind==="control"&&data.sourceId==="player")state.control+=event.duration;
    }catch(e){}}return originalRecord.apply(this,arguments);
  };
  const originalKill=onKill;
  onKill=function(enemy){
    if(enemy.phaseFlagOwner){const boss=enemy.phaseFlagOwner;if(boss.phaseBoss&&!boss.phaseBoss.aborted&&!enemy.wardProcessed){enemy.wardProcessed=true;boss.phaseBoss.broken++;boss.regen=boss.phaseBoss.baseRegen;combatRecord("phase",{reason:"boss_ward_broken"});}return;}
    if(enemy.phaseBoss){const state=enemy.phaseBoss;if(state.rewarded||state.aborted||state.character!==S.cid||state.fac!==S.fac)return;state.rewarded=true;R.phaseBossResult=phaseBossSummary(enemy,"won");phaseBossCleanup(enemy);}
    return originalKill.apply(this,arguments);
  };
  const originalDeath=heroDeath;
  heroDeath=function(){phaseBossAbort("defeated");return originalDeath.apply(this,arguments);};
}
