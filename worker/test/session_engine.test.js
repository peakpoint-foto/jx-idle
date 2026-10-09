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
