import test from "node:test";
import assert from "node:assert/strict";
import { GAME } from "../gen/game.js";
import { game } from "../../test/helpers/game.mjs";

const plain = value => JSON.parse(JSON.stringify(value));
test("DOT partial and overkill ticks match Worker and client",()=>{
  const g=game();
  for(const state of [{hp:5,max:5,poison:.03,poisonDmg:100},{hp:1,max:5,poison:1,poisonDmg:100},{hp:0,max:5,poison:1,poisonDmg:100}]) {
    const enemy={...state};g.run(`var enemy=${JSON.stringify(state)}`);
    assert.deepEqual(plain(GAME.tickEnemyStatuses(enemy,.05)),g.json("tickEnemyStatuses(enemy,.05)"));
    assert.deepEqual(enemy,g.json("enemy"));
  }
});
test("mitigation, attack rating and mana shield match the browser in every mode",()=>{
  const g=game();
  for(const mode of ["ctc","phlt","g2"]) {
    g.run(`fixture('${mode}');R.P={curseDR:.2,flatDR:10,manaShield:50};R.mana=20`);
    GAME.R.P={curseDR:.2,flatDR:10,manaShield:50};GAME.R.mana=20;
    assert.equal(GAME.heroGuard(100),g.run("heroGuard(100)"));
    assert.equal(GAME.R.mana,g.run("R.mana"));assert.equal(GAME.R.mana,0);
    for(const element of ["phys","poison","fire","cold","light"]) {
      for(const resistance of [-100,0,60,200]) {
        const res={[element]:resistance};
        const args=[100,element,0,0,res,75,10];
        assert.equal(GAME.applyPart(...args),g.run(`applyPart(...${JSON.stringify(args)})`));
      }
    }
    for(const args of [[0,0,0],[100,100,0],[100,100,100],[1,100000,0]])
      assert.equal(GAME.hitPercent(...args),g.run(`hitPercent(...${JSON.stringify(args)})`));
    const tick=GAME.combatEvent("damage",{mode,at:1,raw:20,capacity:5,element:"poison"});
    assert.equal(tick.useful,5);assert.equal(tick.excess,15);
  }
});
test("combat descriptor/events are shared and diagnostic payloads exclude unrelated private fields", () => {
  const g=game();
  assert.deepEqual(plain(GAME.combatModelDescriptor()),g.json("combatModelDescriptor()"));
  const input={mode:"ctc",at:1,raw:300,capacity:100,sourceId:"player",token:"secret",save:"private"};
  const event=GAME.combatEvent("damage",input);
  assert.deepEqual(plain(event),g.json(`combatEvent('damage',${JSON.stringify(input)})`));
  assert.deepEqual([event.raw,event.useful,event.excess],[300,100,200]);
  assert.equal("token" in event,false);assert.equal("save" in event,false);
  assert.throws(()=>GAME.combatEvent("damage",{...input,raw:NaN}),/amount/);
  assert.throws(()=>GAME.combatEvent("damage",{...input,mode:"unknown"}),/Invalid combat event/);
  assert.throws(()=>GAME.combatEvent("control",{mode:"ctc",at:0,duration:-1}),/duration/);
});

test("full derived combat stats and attack parts match between Worker and browser across all modes/factions", () => {
  const g=game();
  for (const mode of ["ctc","phlt","g2"]) for (const fac of Object.values(GAME.FAC)) {
    g.run(`fixture('${mode}',100);S.fac='${fac.key}';S.attr={str:50,dex:20,vit:20,eng:30};S.sk=Object.fromEntries(FAC[S.fac].skills.map(id=>[id,Math.min(10,SK[id].max)]));recalc()`);
    GAME.setS(g.json("S"));const server=GAME.calc();
    for (const key of ["life","mana","manaRegen","aspd","res","crit","skillBonus","actives","basic"]) {
      assert.deepEqual(plain(server[key]),g.json(`R.P.${key}`),`${mode}/${fac.key}/${key}`);
    }
  }
});
