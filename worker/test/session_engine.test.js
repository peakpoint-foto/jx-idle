import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME} from '../gen/game.js';
import {game} from '../../test/helpers/game.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
test('party engine has browser/Worker parity and useful bounded events across all ten factions and party sizes',()=>{
  const g=game();
  for(const fac of Object.values(GAME.FAC))for(const count of [2,4]){
    g.run(`fixture('ctc',100);S.fac='${fac.key}';S.sk=Object.fromEntries(FAC[S.fac].skills.filter(id=>SK[id]).map(id=>[id,Math.min(5,SK[id].max)]));recalc()`);
    GAME.setS(g.json('S'));
    const actors=Array.from({length:count},(_,i)=>GAME.sessionActor('a'+i,'Player'+i,GAME.calc(),i?'support':'damage'));
    let state=GAME.sessionCombatNew('ctc',actors,123456);g.run(`var partyState=${JSON.stringify(state)}`);
    const initial=JSON.stringify(actors);
    for(let n=0;n<100&&state.status==='active';n++){
      const commands=[{actor:'a0',seq:n+1,kind:n%2?'support':'guard',target:'a1'}],connected=actors.map(a=>a.id),before=JSON.stringify(state);
      const next=GAME.sessionCombatStep(state,commands,connected);assert.equal(JSON.stringify(state),before,'Input mutated');state=next;
      g.run(`partyState=sessionCombatStep(partyState,${JSON.stringify(commands)},${JSON.stringify(connected)})`);
      assert.deepEqual(plain(state),g.json('partyState'),fac.key+'/'+count+'/'+n);
      assert.ok(state.events.length<=64);for(const a of state.actors){assert.ok(a.hp>=0&&a.hp<=a.p.life);assert.ok(a.mp>=0&&a.mp<=a.p.mana);for(const x of Object.values(a.contribution))assert.ok(Number.isFinite(x)&&x>=0);}
    }
    assert.equal(JSON.stringify(actors),initial,'Frozen profiles mutated');
    assert.deepEqual(plain(GAME.sessionCombatStep({...state,status:'completed'})),plain({...state,status:'completed'}));
  }
});
test('DOT ownership splits useful damage, idle actors cannot act, overheal spends nothing and guard clips prevention',()=>{
  const g=game();g.run("fixture('ctc',60);recalc()");GAME.setS(g.json('S'));
  const actors=['a','b'].map(id=>GAME.sessionActor(id,id,GAME.calc()));let state=GAME.sessionCombatNew('ctc',actors,42);
  state.boss.hp=3;state.boss.poison=1;state.boss.poisonDmg=100;state.boss.poisonShares={a:25,b:75};
  const next=GAME.sessionCombatStep(state,[],[]);assert.equal(next.status,'completed');assert.equal(next.actors[0].contribution.damage,.75);assert.equal(next.actors[1].contribution.damage,2.25);assert.equal(next.boss.hp,0);
  state=GAME.sessionCombatNew('ctc',actors,42);const mp=state.actors[0].mp;
  const noHeal=GAME.sessionCombatStep(state,[{actor:'a',seq:1,kind:'support',target:'b'}],['a']);assert.equal(noHeal.actors[0].utilityCooldown,0);assert.equal(noHeal.actors[0].contribution.heal,0);assert.ok(noHeal.actors[0].mp>=mp-noHeal.actors[0].p.main.cost);
  const idle=GAME.sessionCombatStep(state,[],[]);assert.equal(idle.actors[0].contribution.damage,0);assert.equal(idle.actors[1].contribution.damage,0);
  assert.throws(()=>GAME.sessionCombatNew('g2',actors,1));assert.throws(()=>GAME.sessionCombatStep({...state,rules:'future'}));
});
test('CTC dungeon formation needs two distinct guard actors and records bounded objectives',()=>{
  const g=game();g.run("fixture('ctc',60);recalc()");GAME.setS(g.json('S'));
  const actors=['a','b','c'].map(id=>GAME.sessionActor(id,id,GAME.calc()));
  let state=GAME.sessionCombatNew('ctc',actors,42,'dungeon');assert.equal(state.activity,'dungeon');
  state.boss.hp=state.boss.max*.65;for(const a of state.actors)a.cooldown=10;
  state=GAME.sessionCombatStep(state,[],[]);assert.equal(state.boss.ward,1);assert.equal(state.boss.wardPhase,1);
  state=GAME.sessionCombatStep(state,[{actor:'a',seq:1,kind:'guard'}],['a']);assert.equal(state.boss.ward,1);
  state=GAME.sessionCombatStep(state,[{actor:'a',seq:2,kind:'guard'}],['a']);assert.equal(state.boss.ward,1,'one player cannot satisfy the party objective twice');
  state=GAME.sessionCombatStep(state,[{actor:'b',seq:1,kind:'guard'}],['b']);assert.equal(state.boss.ward,0);
  assert.equal(state.objectives.breaks,1);assert.equal(state.actors[0].contribution.control,1);assert.equal(state.actors[1].contribution.control,1);
  assert.ok(state.events.some(e=>e.reason==='dungeon_formation_broken'));
  assert.throws(()=>GAME.sessionCombatNew('ctc',actors,1,'future'));
  for(const faction of Object.values(GAME.FAC))for(const count of [2,4]){
    g.run(`fixture('ctc',100);S.fac='${faction.key}';S.sk=Object.fromEntries(FAC[S.fac].skills.filter(id=>SK[id]).map(id=>[id,Math.min(5,SK[id].max)]));recalc()`);
    GAME.setS(g.json('S'));const team=Array.from({length:count},(_,i)=>GAME.sessionActor('x'+i,'X'+i,GAME.calc()));
    let encounter=GAME.sessionCombatNew('ctc',team,21,'dungeon');for(const a of encounter.actors)a.cooldown=10;
    encounter.boss.hp=encounter.boss.max*.65;encounter=GAME.sessionCombatStep(encounter,[],[]);
    encounter=GAME.sessionCombatStep(encounter,[{actor:'x0',seq:1,kind:'guard'}],['x0']);
    encounter=GAME.sessionCombatStep(encounter,[{actor:'x1',seq:1,kind:'guard'}],['x1']);
    assert.equal(encounter.objectives.breaks,1,faction.key+'/'+count);assert.equal(encounter.boss.ward,0);
  }
});
test('siege objectives: captured points open the gate, damage alone cannot win, supply speeds capture and logistics count',()=>{
  const g=game();g.run("fixture('ctc',60);recalc()");GAME.setS(g.json('S'));
  const actors=['a','b','c'].map(id=>GAME.sessionActor(id,id,GAME.calc()));
  let state=GAME.sessionCombatNew('ctc',actors,42,'siege');
  assert.equal(state.activity,'siege');assert.equal(state.boss.gate,1);assert.deepEqual(state.objectives.points.map(p=>p.id),['p1','p2','p3']);
  assert.equal(state.objectives.captured,0);for(const a of state.actors){assert.equal(a.contribution.capture,0);assert.equal(a.contribution.logistics,0);}
  // Existing activities keep their exact historical shape.
  for(const activity of ['party','dungeon']){const plainState=GAME.sessionCombatNew('ctc',actors,42,activity);assert.equal(plainState.objectives.points,undefined);assert.equal(plainState.boss.gate,undefined);assert.equal(plainState.actors[0].contribution.capture,undefined);}
  // Damage alone cannot win: gate closed floors the boss at 1 HP and cuts damage to 20%.
  state.boss.hp=3;let hit=GAME.sessionCombatStep(state,[],['a','b','c']);
  assert.equal(hit.status,'active');assert.ok(hit.boss.hp>=1);
  state.boss.hp=state.boss.max;const open=JSON.parse(JSON.stringify(state));for(const a of open.actors)a.cooldown=10;
  // Capture p1 with one actor: needs 12 progress, decays 0.25/tick when untouched.
  let s=open;for(let n=0;n<11;n++)s=GAME.sessionCombatStep(s,[{actor:'a',seq:n+1,kind:'capture',target:'p1'}],['a']);
  assert.equal(s.objectives.points[0].owned,false);assert.equal(s.objectives.points[0].progress,11);
  s=GAME.sessionCombatStep(s,[],['a']);assert.equal(s.objectives.points[0].progress,10.75,'untouched point decays');
  s=GAME.sessionCombatStep(s,[{actor:'a',seq:12,kind:'capture',target:'p1'}],['a']);s=GAME.sessionCombatStep(s,[{actor:'a',seq:13,kind:'capture',target:'p1'}],['a']);
  assert.equal(s.objectives.points[0].owned,true);assert.equal(s.objectives.captured,1);assert.equal(s.boss.gate,1);assert.equal(s.actors[0].contribution.capture,13);
  // Owned points ignore further capture; unknown or malformed targets do nothing.
  const before=JSON.stringify(s.objectives);s=GAME.sessionCombatStep(s,[{actor:'a',seq:14,kind:'capture',target:'p1'}],['a']);s=GAME.sessionCombatStep(s,[{actor:'a',seq:15,kind:'capture',target:'p9'}],['a']);
  assert.equal(JSON.stringify({...s.objectives,points:s.objectives.points.map(p=>({...p,touched:0,progress:Math.round(p.progress)}))}),JSON.stringify({...JSON.parse(before),points:JSON.parse(before).points.map(p=>({...p,touched:0,progress:Math.round(p.progress)}))}));
  // Supply: no self-supply, no overflow, boosts capture, logistics counts only restored mana.
  let t=GAME.sessionCombatNew('ctc',actors,7,'siege');for(const a of t.actors)a.cooldown=10;t.actors[1].mp=0;const mana=t.actors[1].p.mana;
  const self=GAME.sessionCombatStep(t,[{actor:'b',seq:1,kind:'supply',target:'b'}],['b']);assert.equal(self.actors[1].contribution.logistics,0);assert.equal(self.actors[1].utilityCooldown,0);
  const full=GAME.sessionCombatStep(t,[{actor:'a',seq:1,kind:'supply',target:'c'}],['a']);assert.equal(full.actors[0].contribution.logistics,0,'a full-mana target gives no credit or cooldown');
  const fed=GAME.sessionCombatStep(t,[{actor:'a',seq:1,kind:'supply',target:'b'}],['a']);
  assert.ok(Math.abs(fed.actors[1].mp-mana*.1)<=mana*.1,'restores 10% of capacity at most');assert.ok(fed.actors[0].contribution.logistics>0);assert.equal(fed.actors[0].utilityCooldown>0,true);assert.equal(fed.actors[1].supplyUntil,fed.tick+8);
  const boosted=GAME.sessionCombatStep(fed,[{actor:'b',seq:1,kind:'capture',target:'p2'}],['b']);assert.equal(boosted.objectives.points[1].progress,2,'supplied capturer adds 1+1');
  // Win requires all three points, then normal damage can finish the boss.
  let win=GAME.sessionCombatNew('ctc',actors,9,'siege');for(const a of win.actors)a.cooldown=10;
  for(const id of ['p1','p2','p3'])for(let n=0;n<12;n++)win=GAME.sessionCombatStep(win,[{actor:'a',seq:100+n,kind:'capture',target:id}],['a']);
  assert.equal(win.objectives.captured,3);assert.equal(win.boss.gate,0);assert.ok(win.events.some(e=>e.reason==='siege_gate_open'));
  win.boss.hp=1;for(const a of win.actors)a.cooldown=0;for(let n=0;n<20&&win.status==='active';n++)win=GAME.sessionCombatStep(win,[],['a','b','c']);assert.equal(win.status,'completed');assert.equal(win.boss.hp,0);
});
test('siege engine has browser/Worker parity and bounded contributions across all ten factions and party sizes',()=>{
  const g=game();
  for(const fac of Object.values(GAME.FAC))for(const count of [2,4]){
    g.run(`fixture('ctc',100);S.fac='${fac.key}';S.sk=Object.fromEntries(FAC[S.fac].skills.filter(id=>SK[id]).map(id=>[id,Math.min(5,SK[id].max)]));recalc()`);
    GAME.setS(g.json('S'));
    const actors=Array.from({length:count},(_,i)=>GAME.sessionActor('a'+i,'P'+i,GAME.calc(),i?'support':'damage'));
    let state=GAME.sessionCombatNew('ctc',actors,654321,'siege');g.run(`var siegeState=${JSON.stringify(state)}`);
    for(let n=0;n<120&&state.status==='active';n++){
      const kinds=['capture','supply','guard','support'],commands=actors.map((a,i)=>({actor:a.id,seq:n+1,kind:kinds[(n+i)%4],target:kinds[(n+i)%4]==='capture'?'p'+(1+(n%3)):kinds[(n+i)%4]==='guard'?'boss':actors[(i+1)%count].id})),connected=actors.map(a=>a.id),before=JSON.stringify(state);
      const next=GAME.sessionCombatStep(state,commands,connected);assert.equal(JSON.stringify(state),before,'Input mutated');state=next;
      g.run(`siegeState=sessionCombatStep(siegeState,${JSON.stringify(commands)},${JSON.stringify(connected)})`);
      assert.deepEqual(plain(state),g.json('siegeState'),fac.key+'/'+count+'/'+n);
      assert.ok(state.events.length<=64);assert.ok(state.boss.hp>=(state.boss.gate?1:0));
      for(const a of state.actors){assert.ok(a.hp>=0&&a.hp<=a.p.life);assert.ok(a.mp>=0&&a.mp<=a.p.mana);for(const x of Object.values(a.contribution))assert.ok(Number.isFinite(x)&&x>=0);}
      for(const p of state.objectives.points)assert.ok(p.progress>=0&&p.progress<=p.need);
    }
  }
});
function phltActors(ids=['a','b','c']){const g=game();g.run("fixture('phlt',100);recalc()");GAME.setS(g.json('S'));return ids.map(id=>GAME.sessionActor(id,id,GAME.calc()));}
test('rescue activity belongs to PHLT only and every activity keeps its own mode',()=>{
  const actors=phltActors();
  for(const mode of ['ctc','g2'])assert.throws(()=>GAME.sessionCombatNew(mode,actors,1,'rescue'),mode);
  for(const activity of ['party','dungeon','siege'])assert.throws(()=>GAME.sessionCombatNew('phlt',actors,1,activity),activity);
  assert.throws(()=>GAME.sessionCombatNew('phlt',actors.slice(0,1),1,'rescue'));assert.throws(()=>GAME.sessionCombatNew('phlt',phltActors(['a','b','c','d','e']),1,'rescue'));
  for(const activity of ['party','dungeon','siege'])assert.equal(GAME.sessionCombatNew('ctc',actors,1,activity).activity,activity);
  const state=GAME.sessionCombatNew('phlt',actors,42,'rescue'),plainBoss=GAME.sessionCombatNew('ctc',actors,42);
  assert.equal(state.activity,'rescue');assert.ok(Math.abs(state.boss.max/plainBoss.boss.max-GAME.SESSION_RESCUE.bossHp)<1e-9);
  for(const a of state.actors){assert.equal(a.contribution.rescue,0);assert.equal(a.downedUntil,0);assert.equal(a.rescued,0);}
  for(const activity of ['party','dungeon','siege']){const other=GAME.sessionCombatNew('ctc',actors,42,activity);assert.equal(other.actors[0].downedUntil,undefined);assert.equal(other.actors[0].contribution.rescue,undefined);}
});
test('rescue costs the rescuer, revives once inside the window, and resists races and abuse',()=>{
  const R=GAME.SESSION_RESCUE,step=(s,cmds,conn=['a','b','c'])=>GAME.sessionCombatStep(s,cmds,conn);
  let s=GAME.sessionCombatNew('phlt',phltActors(),42,'rescue');for(const a of s.actors)a.cooldown=1e6;s.boss.cooldown=1e6;
  const [A,B,C]=s.actors;
  const down=(st,id)=>{const x=st.actors.find(a=>a.id===id);x.hp=0;x.downedUntil=st.tick+R.window;return st;};
  s=down(s,'b');const aLife=A.p.life,aHp0=s.actors[0].hp,aMp0=s.actors[0].mp;
  // Two rescuers in one tick: the first pays and revives, the second pays nothing.
  const raced=step(s,[{actor:'a',seq:1,kind:'rescue',target:'b'},{actor:'c',seq:1,kind:'rescue',target:'b'}]);
  assert.ok(raced.actors[1].hp>0&&Math.abs(raced.actors[1].hp-B.p.life*R.reviveHp)<B.p.life*0.01);assert.equal(raced.actors[1].rescued,1);assert.equal(raced.actors[1].downedUntil,0);
  assert.equal(raced.actors[0].contribution.rescue,1);assert.equal(raced.actors[2].contribution.rescue,0);
  assert.ok(Math.abs((aHp0-raced.actors[0].hp)-aLife*R.hpCost)<aLife*0.01+raced.actors[0].p.regen,'rescuer pays ~20% of max HP');
  assert.ok(raced.actors[0].mp<=aMp0-R.mpCost+raced.actors[0].p.manaRegen*0.25+1e-6);
  assert.ok(Math.abs(raced.actors[2].hp-C.p.life)<1e-6||raced.actors[2].hp===s.actors[2].hp,'the second rescuer is not charged');
  assert.ok(raced.events.some(e=>e.reason==='party_rescue'));
  // A second fall is final: each actor can be rescued once.
  const again=down(raced,'b');again.actors[1].downedUntil=again.tick+R.window;const second=step(again,[{actor:'a',seq:2,kind:'rescue',target:'b'}]);
  assert.equal(second.actors[1].hp,0,'rescued once already');assert.equal(second.actors[0].hp>=again.actors[0].hp-1e-6,true,'no cost for a refused rescue');
  // Window expiry, self, alive target, withdrawn target, broke rescuer.
  let late=down(GAME.sessionCombatNew('phlt',phltActors(),7,'rescue'),'b');for(const a of late.actors)a.cooldown=1e6;late.boss.cooldown=1e6;late.tick=5;late.actors[1].downedUntil=3;
  late=step(late,[{actor:'a',seq:1,kind:'rescue',target:'b'}]);assert.equal(late.actors[1].hp,0);assert.ok(late.events.some(e=>e.reason==='party_lost'));assert.equal(late.actors[1].downedUntil,0);
  const base=()=>{const x=down(GAME.sessionCombatNew('phlt',phltActors(),9,'rescue'),'b');for(const a of x.actors)a.cooldown=1e6;x.boss.cooldown=1e6;return x;};
  assert.equal(step(base(),[{actor:'a',seq:1,kind:'rescue',target:'a'}]).actors[1].hp,0,'no self rescue');
  const alive=base();alive.actors[1].hp=alive.actors[1].p.life;alive.actors[1].downedUntil=0;
  assert.equal(step(alive,[{actor:'a',seq:1,kind:'rescue',target:'b'}]).actors[0].contribution.rescue,0,'an alive ally cannot be rescued');
  const gone=base();gone.actors[1].withdrawn=true;assert.equal(step(gone,[{actor:'a',seq:1,kind:'rescue',target:'b'}]).actors[1].hp,0,'a player who left cannot be rescued');
  const weak=base();weak.actors[0].hp=weak.actors[0].p.life*R.hpCost*0.9;const weakAfter=step(weak,[{actor:'a',seq:1,kind:'rescue',target:'b'}]);
  assert.equal(weakAfter.actors[1].hp,0,'a rescuer must stay standing');assert.ok(weakAfter.actors[0].hp>0);
  const dry=base();dry.actors[0].mp=0;dry.actors[0].p.manaRegen=0;assert.equal(step(dry,[{actor:'a',seq:1,kind:'rescue',target:'b'}]).actors[1].hp,0,'no MP, no rescue');
  const dead=base();dead.actors[0].hp=0;assert.equal(step(dead,[{actor:'a',seq:1,kind:'rescue',target:'b'}]).actors[1].hp,0,'a downed player cannot rescue');
  const wrongKind=GAME.sessionCombatNew('ctc',phltActors(),3,'party');assert.doesNotThrow(()=>step(wrongKind,[{actor:'a',seq:1,kind:'rescue',target:'b'}]));
  // Everyone down ends the run without a reward.
  const wipe=base();for(const a of wipe.actors)a.hp=0;assert.equal(step(wipe,[]).status,'aborted');
});
test('boss hits really put a character down once, with a window, in the rescue activity',()=>{
  let s=GAME.sessionCombatNew('phlt',phltActors(['a','b']),11,'rescue');for(const a of s.actors){a.cooldown=1e6;a.hp=1;}s.boss.cooldown=.01;s.boss.ar=1e9;
  let downed=null;for(let n=0;n<40&&!downed;n++){s=GAME.sessionCombatStep(s,[],['a','b']);downed=s.actors.find(a=>a.hp<=0&&a.downedUntil>0);}
  assert.ok(downed,'a lethal boss hit sets the rescue window');assert.equal(downed.downedUntil>s.tick-1,true);
  const plain=GAME.sessionCombatNew('ctc',phltActors(['a','b']),11);for(const a of plain.actors){a.cooldown=1e6;a.hp=1;}plain.boss.cooldown=.01;plain.boss.ar=1e9;
  let p=plain;for(let n=0;n<40;n++)p=GAME.sessionCombatStep(p,[],['a','b']);assert.ok(p.actors.every(a=>a.downedUntil===undefined),'other activities have no downed window');
});
test('rescue engine has browser/Worker parity across all ten factions and party sizes',()=>{
  const g=game();
  for(const fac of Object.values(GAME.FAC))for(const count of [2,4]){
    g.run(`fixture('phlt',100);S.fac='${fac.key}';S.sk=Object.fromEntries(FAC[S.fac].skills.filter(id=>SK[id]).map(id=>[id,Math.min(5,SK[id].max)]));recalc()`);
    GAME.setS(g.json('S'));
    const actors=Array.from({length:count},(_,i)=>GAME.sessionActor('a'+i,'P'+i,GAME.calc(),i?'support':'damage'));
    let state=GAME.sessionCombatNew('phlt',actors,246810,'rescue');for(const a of state.actors){a.hp=a.p.life*.15;}g.run(`var rescueState=${JSON.stringify(state)}`);
    let downs=0;
    for(let n=0;n<120&&state.status==='active';n++){
      const kinds=['rescue','attack','guard','support'],commands=actors.map((a,i)=>({actor:a.id,seq:n+1,kind:kinds[(n+i)%4],target:kinds[(n+i)%4]==='attack'||kinds[(n+i)%4]==='guard'?'boss':actors[(i+1)%count].id})),connected=actors.map(a=>a.id),before=JSON.stringify(state);
      const next=GAME.sessionCombatStep(state,commands,connected);assert.equal(JSON.stringify(state),before,'Input mutated');state=next;
      g.run(`rescueState=sessionCombatStep(rescueState,${JSON.stringify(commands)},${JSON.stringify(connected)})`);
      assert.deepEqual(plain(state),g.json('rescueState'),fac.key+'/'+count+'/'+n);
      downs+=state.actors.filter(a=>a.downedUntil>0).length;
      assert.ok(state.events.length<=64);
      for(const a of state.actors){assert.ok(a.hp>=0&&a.hp<=a.p.life);assert.ok(a.mp>=0&&a.mp<=a.p.mana);assert.ok(a.rescued>=0&&a.rescued<=GAME.SESSION_RESCUE.perActor);for(const x of Object.values(a.contribution))assert.ok(Number.isFinite(x)&&x>=0);}
    }
  }
});
test('weekly trial engine: solo PHLT only, absolute boss chain, versioned weekly rules, wave transitions',()=>{
  const T=GAME.SESSION_TRIAL,one=phltActors(['a']),week=2900;
  assert.throws(()=>GAME.sessionCombatNew('phlt',phltActors(['a','b']),1,'trial',{week,length:'short'}),'two actors');
  assert.throws(()=>GAME.sessionCombatNew('ctc',one,1,'trial',{week,length:'short'}),'CTC');assert.throws(()=>GAME.sessionCombatNew('phlt',one,1,'trial',{week,length:'forever'}));
  assert.throws(()=>GAME.sessionCombatNew('phlt',one,1,'trial',{length:'short'}),'week is required');assert.throws(()=>GAME.sessionCombatNew('phlt',one,1,'trial'));
  assert.deepEqual(Object.keys(T.lengths),['short','long']);assert.equal(T.rules.length,4);
  // The boss chain does not depend on who plays: the same week gives the same bosses for a weak and a strong actor.
  const weak=phltActors(['a']),strong=phltActors(['a']);strong[0].p.main.rate*=50;strong[0].p.life*=3;strong[0].hp=strong[0].p.life;
  const sw=GAME.sessionCombatNew('phlt',weak,7,'trial',{week,length:'long'}),ss=GAME.sessionCombatNew('phlt',strong,7,'trial',{week,length:'long'});
  assert.equal(sw.boss.max,ss.boss.max);assert.equal(sw.boss.series,ss.boss.series);assert.equal(sw.trial.waves,6);assert.equal(sw.objectives.depth,0);assert.equal(sw.trial.version,T.version);
  // Rules rotate with the week and change exactly what they promise.
  const rules=[0,1,2,3].map(i=>GAME.sessionCombatNew('phlt',phltActors(['a']),1,'trial',{week:week+i,length:'short'}));
  const base=Math.round(T.baseHp);assert.deepEqual(rules.map(s=>s.trial.rule),[0,1,2,3].map(i=>GAME.sessionTrialRule(week+i).id));assert.equal(new Set(rules.map(s=>s.trial.rule)).size,4);
  for(const s of rules){const rule=GAME.sessionTrialRule(s.trial.week);
    assert.equal(s.boss.max,Math.round(base*(rule.hp||1)));assert.equal(s.boss.def,100*(rule.def||1));assert.equal(s.boss.interval,rule.interval||1);assert.ok(Math.abs(s.boss.dmgMul-(rule.taken||1))<1e-12);}
  // A cleared wave moves to the next, harder boss, and the final wave completes the run.
  let s=GAME.sessionCombatNew('phlt',phltActors(['a']),7,'trial',{week,length:'short'});const rule=GAME.sessionTrialRule(week);
  for(let d=0;d<3;d++){
    assert.equal(s.objectives.depth,d);assert.equal(s.boss.max,Math.round(T.baseHp*Math.pow(T.growth,d)*(rule.hp||1)));assert.ok(Math.abs(s.boss.dmgMul-(1+T.damageGrowth*d)*(rule.taken||1))<1e-12);
    s.boss.hp=1;s.boss.def=0;s.actors[0].cooldown=0;s.boss.cooldown=1e6;
    for(let n=0;n<40&&s.objectives.depth===d&&s.status==='active';n++)s=GAME.sessionCombatStep(s,[],['a']);
    assert.equal(s.objectives.depth,d+1,'wave '+d+' cleared');assert.ok(s.events.some(e=>e.reason==='trial_wave_cleared'&&e.count===d+1));
  }
  assert.equal(s.status,'completed');
  // Other activities never carry trial state or a boss multiplier.
  for(const a of ['party','dungeon','siege']){const o=GAME.sessionCombatNew('ctc',phltActors(['a','b']),1,a);assert.equal(o.trial,undefined);assert.equal(o.boss.dmgMul,undefined);assert.equal(o.boss.interval,undefined);}
});
test('weekly trial engine has browser/Worker parity across all ten factions',()=>{
  const g=game();
  for(const fac of Object.values(GAME.FAC)){
    g.run(`fixture('phlt',100);S.fac='${fac.key}';S.sk=Object.fromEntries(FAC[S.fac].skills.filter(id=>SK[id]).slice(0,6).map(id=>[id,Math.min(3,SK[id].max)]));recalc()`);
    GAME.setS(g.json('S'));
    const actor=GAME.sessionActor('a0','P0',GAME.calc());
    let state=GAME.sessionCombatNew('phlt',[actor],135790,'trial',{week:2901,length:'long'});g.run(`var trialState=${JSON.stringify(state)}`);
    for(let n=0;n<160&&state.status==='active';n++){
      const commands=n%3===0?[{actor:'a0',seq:n+1,kind:n%2?'guard':'support',target:'a0'}]:[],connected=['a0'],before=JSON.stringify(state);
      const next=GAME.sessionCombatStep(state,commands,connected);assert.equal(JSON.stringify(state),before,'Input mutated');state=next;
      g.run(`trialState=sessionCombatStep(trialState,${JSON.stringify(commands)},${JSON.stringify(connected)})`);
      assert.deepEqual(plain(state),g.json('trialState'),fac.key+'/'+n);
      assert.ok(state.events.length<=64);assert.ok(state.objectives.depth>=0&&state.objectives.depth<=state.trial.waves);
      const a=state.actors[0];assert.ok(a.hp>=0&&a.hp<=a.p.life);assert.ok(a.mp>=0&&a.mp<=a.p.mana);
    }
  }
});
