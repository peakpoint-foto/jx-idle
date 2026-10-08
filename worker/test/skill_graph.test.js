import test from "node:test";
import assert from "node:assert/strict";
import { GAME } from "../gen/game.js";
import { game } from "../../test/helpers/game.mjs";

test("Worker and client interpret support graph identically for every faction and mode", () => {
  const client=game();
  for (const mode of ["ctc","phlt","g2"]) for (const faction of Object.values(GAME.FAC)) {
    client.run(`fixture('${mode}',100);S.fac='${faction.key}';S.sk=Object.fromEntries(FAC[S.fac].skills.map(id=>[id,Math.min(10,SK[id].max)]));recalc()`);
    const state=client.json("S");
    GAME.setS(state);
    const server=GAME.calc();
    GAME.R.P=server;
    for (const id of faction.skills) {
      const rank=state.sk[id];
      assert.deepEqual(JSON.parse(JSON.stringify(GAME.skillSupportLinks(id,rank,state))),client.json(`skillSupportLinks(${id},${rank},S)`));
    }
    assert.deepEqual(JSON.parse(JSON.stringify(server.skillBonus)),client.json("R.P.skillBonus"));
    assert.deepEqual(JSON.parse(JSON.stringify(GAME.factionSkillGraph(faction.key,state))),client.json("factionSkillGraph(S.fac,S)"));
  }
});
