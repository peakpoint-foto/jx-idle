"use strict";

function trainingParameters(input={}) {
  const number=(key,defaultValue,min,max,integer=false)=>{
    const value=input[key]==null?defaultValue:Number(input[key]);
    if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new Error("Điều kiện luyện không hợp lệ: "+key);
    return value;
  };
  const res={};for(const element of ELEM) {
    const value=Number(input.res?.[element]??input.resistance??0);
    if(!Number.isFinite(value)||value < -75||value>75)throw new Error("Kháng mục tiêu không hợp lệ");res[element]=value;
  }
  return Object.freeze({seed:number("seed",42,0,4294967295,true),duration:number("duration",30,1,180),
    targets:number("targets",1,1,8,true),hp:number("hp",1000000,1,1e9),def:number("def",200,0,1e6),
    series:number("series",0,0,4,true),manaFraction:number("manaFraction",1,0,1),
    incomingDamage:number("incomingDamage",0,0,1e6),cls:input.cls==="boss"?"boss":"normal",res:Object.freeze(res)});
}

function trainingContext(session,operation) {
  const previousState=S,previousRuntime={...R},previousHero={...H},random=Math.random,heroDmg=ADMV.heroDmg,god=ADMV.god;
  const text=globalThis.addText;
  try {
    S=session.state;
    for(const key of Object.keys(R))delete R[key];Object.assign(R,session.runtime);
    H.x=0;H.y=0;ADMV.heroDmg=1;ADMV.god=0;globalThis.addText=()=>{};
    Math.random=()=>{session.random=(Math.imul(session.random,1664525)+1013904223)>>>0;return session.random/4294967296;};
    const value=operation();session.runtime={...R};return value;
  } finally {
    S=previousState;Math.random=random;ADMV.heroDmg=heroDmg;ADMV.god=god;globalThis.addText=text;
    for(const key of Object.keys(R))delete R[key];Object.assign(R,previousRuntime);
    for(const key of Object.keys(H))delete H[key];Object.assign(H,previousHero);
  }
}

function trainingCreate(input={},state=S) {
  if(!state||!FAC[state.fac]||!featureEnabled("training_lab",state.mode))throw new Error("Phòng luyện chỉ mở cho 2.0 khi tính năng được bật");
  const parameters=trainingParameters(input),session={version:COMBAT_MODEL_VERSION,parameters,state:JSON.parse(JSON.stringify(state)),
    random:parameters.seed,time:0,step:0,paused:false,status:"running",runtime:{rotI:0,training:true},attackTime:0,incomingTime:1,
    raw:0,useful:0,dot:0,manaSpent:0,manaRecovered:0,incomingManaSpent:0,healthRecovered:0,mainStarvedSec:0,basicFallbacks:0,
    outgoingBySkill:{},attacks:0,healthLost:0};
  trainingContext(session,()=>{
    R.P=calc();R.life=R.P.life;R.mana=R.P.mana*parameters.manaFraction;R.enemies=[];
    session.support=factionSkillGraph(S.fac,S).filter(link=>link.active);
    for(let i=0;i<parameters.targets;i++)R.enemies.push({id:"training_"+i,n:"Mộc nhân",cls:parameters.cls,
      hp:parameters.hp,max:parameters.hp,def:parameters.def,series:parameters.series,res:{...parameters.res},
      x:0,y:0,r:10,act:"at",stun:0,stunImm:0,poison:0,poisonDmg:0,dmg:parameters.incomingDamage,ar:1000,ranged:false});
  });
  return session;
}

function trainingStep(session,dt) {
  const P=R.P;
  const oldMana=R.mana,oldLife=R.life;
  R.mana=Math.min(P.mana,R.mana+P.manaRegen*dt);R.life=Math.min(P.life,R.life+P.regen*dt);
  session.manaRecovered+=R.mana-oldMana;session.healthRecovered+=R.life-oldLife;
  if(P.main.cost>R.mana)session.mainStarvedSec+=dt;
  session.attackTime-=dt;
  const list=R.enemies.filter(enemy=>enemy.hp>0);
  if(list.length && session.attackTime<=0 && R.life>0) {
    const attack=pickAttack(P,session.parameters.cls==="boss");
    R.mana-=attack.cost;session.manaSpent+=attack.cost;session.attacks++;
    if(!attack.id&&P.main.id)session.basicFallbacks++;
    const damageTargets=list.slice(0,Math.max(1,attack.targets));
    for(const enemy of damageTargets) {
      const before=Math.max(0,enemy.hp),manaBefore=R.mana,lifeBefore=R.life;
      const raw=heroHit(attack,enemy),useful=Math.min(raw,before);
      session.raw+=raw;session.useful+=useful;
      const id=attack.id||0;session.outgoingBySkill[id]=(session.outgoingBySkill[id]||0)+useful;
      session.manaRecovered+=R.mana-manaBefore;session.healthRecovered+=R.life-lifeBefore;
    }
    session.attackTime+=1/Math.max(.01,attack.rate);
  }
  for(const enemy of R.enemies) {
    if(enemy.hp<=0)continue;
    const tick=tickEnemyStatuses(enemy,dt);session.raw+=tick.raw;session.useful+=tick.useful;session.dot+=tick.useful;
    if(enemy.stunImm>0)enemy.stunImm=Math.max(0,enemy.stunImm-dt);
    if(enemy.stun>0)enemy.stun=Math.max(0,enemy.stun-dt);
  }
  session.incomingTime-=dt;
  if(session.parameters.incomingDamage>0 && session.incomingTime<=0 && R.life>0) {
    const enemy=R.enemies.find(e=>e.hp>0);
    if(enemy) {
      const before=R.life,targetBefore=Math.max(0,enemy.hp),manaBefore=R.mana;
      enemyHit(enemy);session.healthLost+=Math.min(Math.max(0,before-R.life),Math.max(0,before));
      const ret=Math.max(0,targetBefore-enemy.hp);session.raw+=ret;session.useful+=Math.min(ret,targetBefore);
      // Shield spend is distinct from offensive skill cost; damage-triggered mana gain may be useful.
      session.manaRecovered+=Math.max(0,R.mana-manaBefore);
      session.incomingManaSpent+=Math.max(0,manaBefore-R.mana);
    }
    session.incomingTime+=1;
  }
  session.time+=dt;session.step++;
  if(R.life<=0)session.status="defeated";
  else if(session.time>=session.parameters.duration-1e-9)session.status="completed";
}

function trainingAdvance(session,seconds=1) {
  if(!session||session.version!==COMBAT_MODEL_VERSION)throw new Error("Phiên luyện không tương thích");
  if(!Number.isFinite(seconds)||seconds<0||seconds>180)throw new Error("Thời lượng luyện không hợp lệ");
  if(session.paused||session.status!=="running")return trainingReport(session);
  // Advance full fixed ticks only. Partial wall-clock chunks cannot alter RNG or attack timing.
  session.pending=(session.pending||0)+seconds;
  trainingContext(session,()=>{
    while(session.pending>=.05-1e-9 && session.status==="running") {
      const dt=Math.min(.05,session.parameters.duration-session.time);
      trainingStep(session,dt);session.pending=Math.max(0,session.pending-dt);
    }
    if(session.status==="running"&&session.parameters.duration-session.time<.05 &&
       session.pending>=session.parameters.duration-session.time-1e-9) {
      trainingStep(session,session.parameters.duration-session.time);session.pending=0;
    }
  });
  return trainingReport(session);
}

function trainingReport(session) {
  return {version:session.version,parameters:{...session.parameters,res:{...session.parameters.res}},status:session.status,
    paused:session.paused,elapsed:session.time,dps:session.time?session.useful/session.time:0,rawDamage:session.raw,
    usefulDamage:session.useful,overkill:session.raw-session.useful,dotDamage:session.dot,manaSpent:session.manaSpent,
    manaRecovered:session.manaRecovered,incomingManaSpent:session.incomingManaSpent,manaRemaining:Math.max(0,session.runtime.mana),healthRecovered:session.healthRecovered,
    healthLost:session.healthLost,mainStarvedSec:session.mainStarvedSec,basicFallbacks:session.basicFallbacks,attacks:session.attacks,
    bySkill:{...session.outgoingBySkill},support:session.support.map(link=>({...link})),
    reward:{xp:0,gold:0,items:0},ranked:false};
}

function trainingRun(input={},state=S) { const session=trainingCreate(input,state);return trainingAdvance(session,session.parameters.duration); }
