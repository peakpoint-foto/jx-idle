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
