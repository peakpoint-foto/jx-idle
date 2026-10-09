"use strict";
const SESSION_COMBAT=Object.freeze({version:"party-combat-v1",step:.25,maxTicks:480,idleMs:10000,logMax:64});
const SESSION_RESCUE=Object.freeze({window:24,hpCost:.2,mpCost:8,reviveHp:.35,perActor:1,bossHp:1.5,bossDamage:1.8});
// 2.6: Boss nhiều phase (session engine, deterministic).
// 3 phase theo % HP; tuyệt chiêu báo trước 1s (4 tick); enrage sau 90s.
const SESSION_BOSS_PHASES=Object.freeze({thresholds:[.66,.33],phaseDmgMul:[1,1.15,1.3],
  telegraphTicks:4,telegraphEvery:40,ultimateMul:3,enrageTick:360,enrageMul:1.5});
const SESSION_ACTIVITY_MODE=Object.freeze({party:"ctc",dungeon:"ctc",siege:"ctc",rescue:"phlt",trial:"phlt",challenge:"g2"});
// Both weekly trials (PHLT) and community challenges (2.0) fight one absolute boss chain; only trials and challenges are solo.
const sessionWaves=state=>state.activity==="trial"||state.activity==="challenge";
const sessionSolo=activity=>activity==="trial"||activity==="challenge";
// Weekly trial (P06): one actor faces the same absolute boss chain as everyone else that week. The rule list is a fixed allowlist indexed by the UTC week.
// Dữ liệu từ data/content/trial.v1.json (qua js/content.gen.js, validate bởi js/content.js).
// JSON sai schema -> lỗi rõ ngay lúc nạp, không chạy với dữ liệu hỏng.
validateTrialRules(JX_CONTENT.trial);
const SESSION_TRIAL=JX_CONTENT.trial;
const sessionTrialRule=week=>SESSION_TRIAL.rules[((week%SESSION_TRIAL.rules.length)+SESSION_TRIAL.rules.length)%SESSION_TRIAL.rules.length];
// Mutator trial (1.2): biến thể chủ tướng theo tuần, đọc từ content JSON.
// Engine thuần theo input (options.mutator) — flag trial_mutators chỉ quyết định ở caller.
const sessionTrialMutator=week=>{const ms=JX_CONTENT.trialMutators.mutators;return ms[((week%ms.length)+ms.length)%ms.length];};
const trialMutatorOf=state=>state.trial.mutator?JX_CONTENT.trialMutators.mutators.find(m=>m.id===state.trial.mutator):null;
const SESSION_SIEGE=Object.freeze({points:Object.freeze(["p1","p2","p3"]),need:12,decay:.25,gateDamage:.2,supplyBoost:1,supplyTicks:8,supplyCost:5,supplyRestore:.1,supplyCooldown:6});
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
function sessionCombatNew(mode,actors,seed,activity="party",options={}){
  const min=sessionSolo(activity)?1:2,max=sessionSolo(activity)?1:4;
  if(!Array.isArray(actors)||actors.length<min||actors.length>max||SESSION_ACTIVITY_MODE[activity]!==mode)throw Error("Session snapshot requires a known activity, the mode that owns it and the right number of actors");
  if(activity==="trial"&&(!Number.isSafeInteger(options.week)||!Object.prototype.hasOwnProperty.call(SESSION_TRIAL.lengths,options.length)))throw Error("Trial needs a week and a known length");
  if(activity==="challenge"&&(!Number.isSafeInteger(options.week)||typeof options.version!=="string"||!Number.isInteger(options.waves)||options.waves<1||options.waves>8||!(typeof options.scale==="number"&&options.scale>=.1&&options.scale<=10)))throw Error("Challenge needs a seed, a version, 1-8 waves and a bounded scale");
  const baseHp=Math.max(100,actors.reduce((n,a)=>n+Object.values(a.p.main.parts).reduce((x,y)=>x+y,0)*Math.max(.2,a.p.main.rate),0)*18);
  const hp=activity==="rescue"?baseHp*SESSION_RESCUE.bossHp:baseHp;
  const state={v:1,model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,mode,activity,rng:seed>>>0,tick:0,status:"active",actors:JSON.parse(JSON.stringify(actors)),events:[],objectives:{breaks:0,supports:0},
    boss:{hp,max:hp,series:(seed>>>0)%5,res:Object.fromEntries(ELEM.map(k=>[k,10])),def:100,ar:1000,cooldown:1,poison:0,poisonDmg:0,stun:0,stunImm:0,ward:0,wardPhase:0,wardUntil:0,breakers:[],
    phase:0,telegraphUntil:0,enraged:false}};
  if(activity==="siege"){
    // Siege-only state: party/dungeon states keep their exact historical shape.
    state.objectives.captured=0;state.objectives.points=SESSION_SIEGE.points.map(id=>({id,need:SESSION_SIEGE.need,progress:0,owned:false,touched:0}));
    state.boss.gate=1;for(const a of state.actors){a.contribution.capture=0;a.contribution.logistics=0;a.supplyUntil=0;}
  }
  if(activity==="challenge"){
    // Challenge-only state: same wave chain as the weekly trial, with the preset's HP scale; the rule comes from the challenge seed.
    state.trial={version:options.version,week:options.week,length:"standard",waves:options.waves,rule:sessionTrialRule(options.week).id,scale:options.scale};
    state.objectives.depth=0;sessionTrialWave(state);
  }
  if(activity==="trial"){
    // Trial-only state: the boss chain is absolute (not scaled to the party), so builds are compared on equal terms.
    const mutator=options.mutator||null;
    if(mutator&&!JX_CONTENT.trialMutators.mutators.some(m=>m.id===mutator))throw Error("Unknown trial mutator");
    state.trial={version:SESSION_TRIAL.version,week:options.week,length:options.length,waves:SESSION_TRIAL.lengths[options.length],rule:sessionTrialRule(options.week).id,mutator};
    state.objectives.depth=0;sessionTrialWave(state);
  }
  if(activity==="rescue"){
    // Rescue-only state: other activities keep their exact historical shape.
    for(const a of state.actors){a.contribution.rescue=0;a.downedUntil=0;a.rescued=0;}
  }
  return state;
}
function sessionTrialWave(state){
  const w=state.objectives.depth,rule=sessionTrialRule(state.trial.week),mut=trialMutatorOf(state);
  const mhp=mut?.hp||1,mdef=mut?.def||1,mint=mut?.interval||1,mtaken=mut?.taken||1;
  const hp=Math.round(SESSION_TRIAL.baseHp*Math.pow(SESSION_TRIAL.growth,w)*(rule.hp||1)*mhp*(state.trial.scale||1)),b=state.boss;
  b.hp=b.max=hp;b.series=(state.trial.week+w)%5;b.def=100*(rule.def||1)*mdef;b.cooldown=(rule.interval||1)*mint;b.interval=(rule.interval||1)*mint;b.dmgMul=(1+SESSION_TRIAL.damageGrowth*w)*(rule.taken||1)*mtaken;
  b.poison=0;b.poisonDmg=0;b.poisonShares={};b.stun=0;b.stunImm=0;
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
  if(state.activity==="siege"&&command.kind==="capture"){
    const point=state.objectives.points.find(x=>x.id===command.target);if(!point||point.owned)return;
    point.progress=Math.min(point.need,point.progress+1+(actor.supplyUntil>=state.tick?SESSION_SIEGE.supplyBoost:0));point.touched=state.tick;actor.contribution.capture++;
    if(point.progress>=point.need){
      point.owned=true;state.objectives.captured++;sessionEvent(state,"objective",{targetId:point.id,reason:"siege_point_captured",count:state.objectives.captured});
      if(state.objectives.captured>=state.objectives.points.length){state.boss.gate=0;sessionEvent(state,"objective",{targetId:"boss",reason:"siege_gate_open"});}
    }
    return;
  }
  if(state.activity==="siege"&&command.kind==="supply"&&actor.utilityCooldown<=0&&actor.mp>=SESSION_SIEGE.supplyCost){
    const target=state.actors.find(a=>a.id===command.target&&a.hp>0&&a.id!==actor.id);if(!target)return;
    const capacity=target.p.mana-target.mp,raw=target.p.mana*SESSION_SIEGE.supplyRestore;if(capacity<=0)return;
    const restored=Math.min(raw,capacity);target.mp+=restored;actor.mp-=SESSION_SIEGE.supplyCost;actor.utilityCooldown=SESSION_SIEGE.supplyCooldown;
    target.supplyUntil=state.tick+SESSION_SIEGE.supplyTicks;actor.contribution.logistics+=restored;
    sessionEvent(state,"heal",{sourceId:actor.id,targetId:target.id,raw,capacity,reason:"siege_supply"});
    return;
  }
  if(state.activity==="rescue"&&command.kind==="rescue"){
    const target=state.actors.find(a=>a.id===command.target);
    // Only a downed, un-withdrawn ally inside the window can be rescued, once per actor; the rescuer pays HP and MP and must stay standing.
    if(!target||target.id===actor.id||target.hp>0||target.withdrawn||!target.downedUntil||target.downedUntil<state.tick||target.rescued>=SESSION_RESCUE.perActor)return;
    const hpCost=actor.p.life*SESSION_RESCUE.hpCost;if(actor.hp<=hpCost+1||actor.mp<SESSION_RESCUE.mpCost)return;
    actor.hp-=hpCost;actor.mp-=SESSION_RESCUE.mpCost;
    target.hp=target.p.life*SESSION_RESCUE.reviveHp;target.mp=Math.max(target.mp,target.p.mana*.2);target.rescued++;target.downedUntil=0;actor.contribution.rescue++;
    sessionEvent(state,"heal",{sourceId:actor.id,targetId:target.id,raw:target.hp,capacity:target.p.life,reason:"party_rescue"});
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
  if(counters(a.series,b.series))raw+=p.series5;if(p.bossDmg>1)raw*=p.bossDmg;if(state.activity==="dungeon"&&b.ward>0)raw*=.2;if(state.activity==="siege"&&b.gate)raw*=SESSION_SIEGE.gateDamage;raw=Math.max(1,raw);
  const floor=state.activity==="siege"&&b.gate?1:0,useful=Math.min(raw,Math.max(0,b.hp-floor));b.hp=Math.max(floor,b.hp-raw);actor.contribution.damage+=useful;
  sessionEvent(state,"damage",{sourceId:actor.id,targetId:"boss",skillId:a.id,raw,capacity:b.hp+useful,reason:"party_attack"});
  if(b.hp>0&&a.stun&&b.stunImm<=0&&sessionRandom(state)*100<a.stun){b.stun=.5;b.stunImm=STUN_IMM_BOSS;actor.contribution.control+=.5;sessionEvent(state,"control",{sourceId:actor.id,targetId:"boss",duration:.5,reason:"party_native_stun"});}
  if(p.leech){const amount=raw*p.leech/100,cap=p.life-actor.hp;actor.hp=Math.min(p.life,actor.hp+amount);actor.contribution.heal+=Math.min(amount,cap);sessionEvent(state,"heal",{sourceId:actor.id,targetId:actor.id,raw:amount,capacity:cap,reason:"party_leech"});}
  if(p.manaLeech)actor.mp=Math.min(p.mana,actor.mp+raw*p.manaLeech/100);
}
function sessionBossDmgMul(state){
  const b=state.boss,PH=SESSION_BOSS_PHASES;
  return PH.phaseDmgMul[b.phase]||1*(b.enraged?PH.enrageMul:1);
}
function sessionCombatBossHit(state,target,mul=1){
  const p=target.p,b=state.boss;
  if(sessionRandom(state)*100>=hitPercent(b.ar*(1-p.curseAR),p.def)||sessionRandom(state)*100<p.block)return;
  const el=ELEM[b.series]||"phys",before=target.hp;
  let raw=applyPart(p.life*.045*(.8+sessionRandom(state)*.4),el,b.series,p.series,p.res,PLAYER_RES_MAX,10)*sessionBossDmgMul(state)*mul;
  if(state.activity==="rescue")raw*=SESSION_RESCUE.bossDamage;
  if(sessionWaves(state))raw*=b.dmgMul;
  if(p.res5&&!counters(b.series,p.series))raw=Math.max(1,raw-p.res5);
  if(p.statusRes[el])raw=Math.max(1,raw*(1-p.statusRes[el]/100));if(p.absorb)raw=Math.max(1,raw*(1-p.absorb));
  if(p.curseDR)raw*=1-p.curseDR;if(p.flatDR)raw=Math.max(1,raw-p.flatDR);
  if(p.manaShield>0&&target.mp>0){const absorbed=Math.min(target.mp,raw*p.manaShield/100);target.mp-=absorbed;raw-=absorbed;target.contribution.prevented+=absorbed;}
  if(target.guardUntil>=state.tick){target.contribution.prevented+=raw*.5;raw*=.5;}
  raw=Math.max(0,raw);target.hp=Math.max(0,target.hp-raw);
  if(state.activity==="rescue"&&target.hp<=0&&!target.rescued)target.downedUntil=state.tick+SESSION_RESCUE.window;
  sessionEvent(state,"damage",{sourceId:"boss",targetId:target.id,raw,capacity:before,element:el,reason:target.hp<=0?"party_fatal":"party_boss"});
}
function sessionCombatStep(input,commands=[],connectedIds=[]){
  const state=JSON.parse(JSON.stringify(input));if(state.status!=="active")return state;
  if(state.v!==1||state.model!==COMBAT_MODEL_VERSION||state.rules!==SESSION_COMBAT.version||!Number.isInteger(state.tick)||state.tick<0||state.tick>=480)throw Error("Session model/step unsupported");
  state.tick++;const dt=.25,b=state.boss;
  if(state.activity==="dungeon"&&b.ward&&b.wardUntil<state.tick){b.ward=0;sessionEvent(state,"objective",{targetId:"boss",reason:"dungeon_formation_expired",phase:b.wardPhase});}
  const dot=tickEnemyStatuses(b,dt);
  if(dot.useful)for(const actor of state.actors){const weight=(b.poisonShares?.[actor.id]||0)/Math.max(1e-12,b.poisonDmg);if(weight>0){actor.contribution.damage+=dot.useful*weight;sessionEvent(state,"damage",{sourceId:actor.id,targetId:"boss",raw:dot.raw*weight,capacity:dot.useful*weight,element:"poison",reason:"party_dot"});}}
  b.hp=Math.max(state.activity==="siege"&&b.gate?1:0,b.hp);b.stunImm=Math.max(0,b.stunImm-dt);
  for(const actor of state.actors){
    if(actor.hp<=0)continue;actor.hp=Math.min(actor.p.life,actor.hp+actor.p.regen*dt);actor.mp=Math.min(actor.p.mana,actor.mp+actor.p.manaRegen*dt);
    actor.cooldown=Math.max(0,actor.cooldown-dt);actor.utilityCooldown=Math.max(0,actor.utilityCooldown-dt);
    if(!connectedIds.includes(actor.id))continue;
    sessionCombatUtility(state,actor,commands.find(c=>c.actor===actor.id));
    if(b.hp>0&&actor.cooldown<=0)sessionCombatHit(state,actor);
  }
  if(state.activity==="rescue")for(const a of state.actors)if(a.hp<=0&&a.downedUntil&&a.downedUntil<state.tick){a.downedUntil=0;sessionEvent(state,"objective",{targetId:a.id,reason:"party_lost"});}
  if(state.activity==="siege")for(const point of state.objectives.points)if(!point.owned&&point.touched!==state.tick)point.progress=Math.max(0,point.progress-SESSION_SIEGE.decay);
  if(state.activity==="dungeon"&&b.hp>0){const ratio=b.hp/b.max,phase=ratio<=.33?2:ratio<=.66?1:0;if(phase>b.wardPhase){b.wardPhase=phase;b.ward=1;b.wardUntil=state.tick+32;b.breakers=[];sessionEvent(state,"objective",{targetId:"boss",reason:"dungeon_formation_started",phase});}}
  if(state.activity==="trial"&&b.hp>0){
    const PH=SESSION_BOSS_PHASES,ratio=b.hp/b.max;
    const phase=ratio<=PH.thresholds[1]?2:ratio<=PH.thresholds[0]?1:0;
    if(phase>b.phase){b.phase=phase;sessionEvent(state,"objective",{targetId:"boss",reason:"boss_phase",phase});}
    if(!b.enraged&&state.tick>=PH.enrageTick){b.enraged=true;sessionEvent(state,"objective",{targetId:"boss",reason:"boss_enrage"});}
    if(b.telegraphUntil>0&&state.tick>=b.telegraphUntil){
      b.telegraphUntil=0;
      const live=state.actors.filter(a=>a.hp>0);
      if(live.length){const t=live[Math.floor(sessionRandom(state)*live.length)];sessionCombatBossHit(state,t,PH.ultimateMul);sessionEvent(state,"objective",{targetId:"boss",reason:"boss_ultimate",targetId2:t.id});}
    }else if(b.telegraphUntil===0&&state.tick>0&&state.tick%PH.telegraphEvery===0){
      b.telegraphUntil=state.tick+PH.telegraphTicks;sessionEvent(state,"objective",{targetId:"boss",reason:"boss_telegraph",until:b.telegraphUntil});
    }
  }
  if(b.hp<=0){
    if(sessionWaves(state)){
      state.objectives.depth++;sessionEvent(state,"objective",{targetId:"boss",reason:"trial_wave_cleared",count:state.objectives.depth});
      if(state.objectives.depth>=state.trial.waves){state.status="completed";return state;}
      sessionTrialWave(state);
    }else{state.status="completed";return state;}
  }
  if(b.stun>0)b.stun=Math.max(0,b.stun-dt);
  else{b.cooldown-=dt;if(b.cooldown<=0){b.cooldown=b.interval||1;const live=state.actors.filter(a=>a.hp>0);if(live.length)sessionCombatBossHit(state,live[Math.max(0,Math.floor(state.tick/4)-1)%live.length]);}}
  if(state.actors.every(a=>a.hp<=0)||state.tick>=480)state.status="aborted";
  return state;
}
