"use strict";
const SESSION_COMBAT=Object.freeze({version:"party-combat-v1",step:.25,maxTicks:480,idleMs:10000,logMax:64});
function sessionRandom(state){state.rng=(Math.imul(state.rng,1664525)+1013904223)>>>0;return state.rng/4294967296;}
function sessionEvent(state,kind,data){const e=combatEvent(kind,{mode:state.mode,at:state.tick*SESSION_COMBAT.step,...data});state.events.push(e);state.events=state.events.slice(-64);}
function sessionAttack(stats){
  const copy=a=>({id:a.id,parts:{...a.parts},rate:a.rate,cost:a.cost,crit:a.crit||0,series:a.series,series5:a.series5||0,ignore:a.ignore||0,stun:a.stun||0,useAR:!!a.useAR});
  return {main:copy(stats.main),basic:copy(stats.basic)};
}
function sessionActor(id,name,stats,role="damage"){
  const p={};for(const k of ["life","mana","ar","def","regen","manaRegen","series","bossDmg","series5","leech","manaLeech","curseAR","curseDef","curseDR","flatDR","manaShield","absorb","res5","block"])p[k]=Number(stats[k])||0;
  p.res={...stats.res};p.statusRes={...stats.statusRes};p.ignRes={...stats.ignRes};Object.assign(p,sessionAttack(stats));
  return {id,name,role,p,hp:p.life,mp:p.mana,cooldown:0,utilityCooldown:0,guardUntil:0,contribution:{damage:0,control:0,heal:0,prevented:0},lastSeq:0};
}
function sessionCombatNew(mode,actors,seed,activity="party"){
  if(mode!=="ctc"||!Array.isArray(actors)||actors.length<2||actors.length>4||!['party','dungeon'].includes(activity))throw Error("Party snapshot requires2–4CTC actors and a known activity");
  const hp=Math.max(100,actors.reduce((n,a)=>n+Object.values(a.p.main.parts).reduce((x,y)=>x+y,0)*Math.max(.2,a.p.main.rate),0)*18);
  const state={v:1,model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,mode,activity,rng:seed>>>0,tick:0,status:"active",actors:JSON.parse(JSON.stringify(actors)),events:[],objectives:{breaks:0,supports:0},
    boss:{hp,max:hp,series:(seed>>>0)%5,res:Object.fromEntries(ELEM.map(k=>[k,10])),def:100,ar:1000,cooldown:1,poison:0,poisonDmg:0,stun:0,stunImm:0,ward:0,wardPhase:0,wardUntil:0,breakers:[]}};
  return state;
}
function sessionCombatUtility(state,actor,command){
  if(!command||actor.hp<=0)return;
  actor.lastSeq=command.seq;
  if(command.kind==="guard"){
    actor.guardUntil=state.tick+4;
    if(state.activity==="dungeon"&&state.boss.ward&&state.boss.wardUntil>=state.tick&&!state.boss.breakers.includes(actor.id)){
      state.boss.breakers.push(actor.id);
      if(state.boss.breakers.length>=2){state.boss.ward=0;state.objectives.breaks++;for(const participant of state.actors)if(state.boss.breakers.includes(participant.id))participant.contribution.control++;
        sessionEvent(state,"objective",{targetId:"boss",reason:"dungeon_formation_broken",count:state.objectives.breaks});}
    }
    return;
  }
  if(command.kind==="support"&&actor.utilityCooldown<=0&&actor.mp>=5){
    const target=state.actors.find(a=>a.id===command.target&&a.hp>0);if(!target)return;
    const raw=target.p.life*.1,capacity=target.p.life-target.hp;if(capacity<=0)return;
    target.hp=Math.min(target.p.life,target.hp+raw);actor.mp-=5;actor.utilityCooldown=6;actor.contribution.heal+=Math.min(raw,capacity);
    if(state.activity==="dungeon")state.objectives.supports++;
    sessionEvent(state,"heal",{sourceId:actor.id,targetId:target.id,raw,capacity,reason:"party_support"});
  }
}
function sessionCombatHit(state,actor){
  const p=actor.p,b=state.boss,a=actor.mp>=p.main.cost?p.main:p.basic;
  actor.cooldown=1/Math.max(.2,a.rate);actor.mp=Math.max(0,actor.mp-a.cost);
  if(a.useAR&&sessionRandom(state)*100>=hitPercent(p.ar,Math.max(0,b.def-p.curseDef),a.ignore))return;
  const crit=sessionRandom(state)*100<a.crit;let raw=0;
  const res=Object.fromEntries(ELEM.map(k=>[k,b.res[k]*(1-(p.ignRes[k]||0)/100)]));
  for(const el of Object.keys(a.parts)){
    const part=a.parts[el]*(.85+sessionRandom(state)*.3),d=applyPart(part,el,a.series,b.series,res,75,a.series5);
    if(el==="poison"){
      b.poisonShares||={};for(const id of Object.keys(b.poisonShares))b.poisonShares[id]=b.poisonShares[id]*Math.max(0,b.poison)/POISON_TIME;
      b.poisonShares[actor.id]=(b.poisonShares[actor.id]||0)+d/POISON_TIME;
      b.poisonDmg=Object.values(b.poisonShares).reduce((x,y)=>x+y,0);b.poison=POISON_TIME;continue;
    }
    raw+=crit&&el==="phys"?d*CRIT_MULT:d;
  }
  if(counters(a.series,b.series))raw+=p.series5;if(p.bossDmg>1)raw*=p.bossDmg;if(state.activity==="dungeon"&&b.ward>0)raw*=.2;raw=Math.max(1,raw);
  const useful=Math.min(raw,b.hp);b.hp=Math.max(0,b.hp-raw);actor.contribution.damage+=useful;
  sessionEvent(state,"damage",{sourceId:actor.id,targetId:"boss",skillId:a.id,raw,capacity:b.hp+useful,reason:"party_attack"});
  if(b.hp>0&&a.stun&&b.stunImm<=0&&sessionRandom(state)*100<a.stun){b.stun=.5;b.stunImm=STUN_IMM_BOSS;actor.contribution.control+=.5;sessionEvent(state,"control",{sourceId:actor.id,targetId:"boss",duration:.5,reason:"party_native_stun"});}
  if(p.leech){const amount=raw*p.leech/100,cap=p.life-actor.hp;actor.hp=Math.min(p.life,actor.hp+amount);actor.contribution.heal+=Math.min(amount,cap);sessionEvent(state,"heal",{sourceId:actor.id,targetId:actor.id,raw:amount,capacity:cap,reason:"party_leech"});}
  if(p.manaLeech)actor.mp=Math.min(p.mana,actor.mp+raw*p.manaLeech/100);
}
function sessionCombatBossHit(state,target){
  const p=target.p,b=state.boss;
  if(sessionRandom(state)*100>=hitPercent(b.ar*(1-p.curseAR),p.def)||sessionRandom(state)*100<p.block)return;
  const el=ELEM[b.series]||"phys",before=target.hp;
  let raw=applyPart(p.life*.045*(.8+sessionRandom(state)*.4),el,b.series,p.series,p.res,PLAYER_RES_MAX,10);
  if(p.res5&&!counters(b.series,p.series))raw=Math.max(1,raw-p.res5);
  if(p.statusRes[el])raw=Math.max(1,raw*(1-p.statusRes[el]/100));if(p.absorb)raw=Math.max(1,raw*(1-p.absorb));
  if(p.curseDR)raw*=1-p.curseDR;if(p.flatDR)raw=Math.max(1,raw-p.flatDR);
  if(p.manaShield>0&&target.mp>0){const absorbed=Math.min(target.mp,raw*p.manaShield/100);target.mp-=absorbed;raw-=absorbed;target.contribution.prevented+=absorbed;}
  if(target.guardUntil>=state.tick){target.contribution.prevented+=raw*.5;raw*=.5;}
  raw=Math.max(0,raw);target.hp=Math.max(0,target.hp-raw);
  sessionEvent(state,"damage",{sourceId:"boss",targetId:target.id,raw,capacity:before,element:el,reason:target.hp<=0?"party_fatal":"party_boss"});
}
function sessionCombatStep(input,commands=[],connectedIds=[]){
  const state=JSON.parse(JSON.stringify(input));if(state.status!=="active")return state;
  if(state.v!==1||state.model!==COMBAT_MODEL_VERSION||state.rules!==SESSION_COMBAT.version||!Number.isInteger(state.tick)||state.tick<0||state.tick>=480)throw Error("Session model/step unsupported");
  state.tick++;const dt=.25,b=state.boss;
  if(state.activity==="dungeon"&&b.ward&&b.wardUntil<state.tick){b.ward=0;sessionEvent(state,"objective",{targetId:"boss",reason:"dungeon_formation_expired",phase:b.wardPhase});}
  const dot=tickEnemyStatuses(b,dt);
  if(dot.useful)for(const actor of state.actors){const weight=(b.poisonShares?.[actor.id]||0)/Math.max(1e-12,b.poisonDmg);if(weight>0){actor.contribution.damage+=dot.useful*weight;sessionEvent(state,"damage",{sourceId:actor.id,targetId:"boss",raw:dot.raw*weight,capacity:dot.useful*weight,element:"poison",reason:"party_dot"});}}
  b.hp=Math.max(0,b.hp);b.stunImm=Math.max(0,b.stunImm-dt);
  for(const actor of state.actors){
    if(actor.hp<=0)continue;actor.hp=Math.min(actor.p.life,actor.hp+actor.p.regen*dt);actor.mp=Math.min(actor.p.mana,actor.mp+actor.p.manaRegen*dt);
    actor.cooldown=Math.max(0,actor.cooldown-dt);actor.utilityCooldown=Math.max(0,actor.utilityCooldown-dt);
    if(!connectedIds.includes(actor.id))continue;
    sessionCombatUtility(state,actor,commands.find(c=>c.actor===actor.id));
    if(b.hp>0&&actor.cooldown<=0)sessionCombatHit(state,actor);
  }
  if(state.activity==="dungeon"&&b.hp>0){const ratio=b.hp/b.max,phase=ratio<=.33?2:ratio<=.66?1:0;if(phase>b.wardPhase){b.wardPhase=phase;b.ward=1;b.wardUntil=state.tick+32;b.breakers=[];sessionEvent(state,"objective",{targetId:"boss",reason:"dungeon_formation_started",phase});}}
  if(b.hp<=0){state.status="completed";return state;}
  if(b.stun>0)b.stun=Math.max(0,b.stun-dt);
  else{b.cooldown-=dt;if(b.cooldown<=0){b.cooldown=1;const live=state.actors.filter(a=>a.hp>0);if(live.length)sessionCombatBossHit(state,live[Math.max(0,Math.floor(state.tick/4)-1)%live.length]);}}
  if(state.actors.every(a=>a.hp<=0)||state.tick>=480)state.status="aborted";
  return state;
}
