import test from "node:test";
import assert from "node:assert/strict";
import { auditSkillGraph, loadSkillData } from "../scripts/skill-audit.mjs";
import { game } from "./helpers/game.mjs";

test("skill audit classifies real data without silently remapping missing or child IDs", () => {
  const { data } = loadSkillData(), report = auditSkillGraph(data);
  assert.deepEqual([report.total, report.learnable, report.existingOutside, report.missing, report.malformed.length], [106, 76, 15, 15, 0]);
  assert.deepEqual(report.links.filter(x => x.status === "missing").map(x => [x.source, x.target]).sort((a,b) => a[0]-b[0] || a[1]-b[1]),
    [[71,354],[82,331],[105,382],[111,338],[113,338],[148,363],[158,162],[176,373],[249,340],[271,1055],[271,1083],[337,1065],[337,1093],[384,383],[385,329]]);
  const child = report.links.find(x => x.source === 29 && x.target === 408);
  assert.equal(child.status, "existing_outside_faction");
  assert.ok(child.childOf.includes(325));
  assert.equal(report.links.find(x => x.source === 249 && x.target === 340).targetName, null);
});

test("audit rejects inconsistent rank destinations and survives cyclic child chains", () => {
  const data = { factions: [{ key: "test", skills: [1] }], skills: {
    1: { id: 1, child: 2, attr: { addskilldamage1: [[3,0,1],[4,0,2]], addskilldamage2: [[5,0,1]] } },
    2: { id: 2, child: 1 }, 5: { id: 5 },
  }};
  const report = auditSkillGraph(data);
  assert.equal(report.malformed.length, 1);
  assert.equal(report.links.length, 1);
  assert.deepEqual(report.links[0].childOf, []);
});

for (const mode of ["ctc", "phlt", "g2"]) {
  test(`${mode}: every learnable support link increases target damage and unlearning removes it`, () => {
    const { data } = loadSkillData(), g = game();
    for (const link of auditSkillGraph(data).links.filter(x => x.status === "learnable")) {
      g.run(`fixture('${mode}',100);S.fac='${link.faction}';S.sk={${link.target}:1};S.main=${link.target};var baseline=calc();S.sk[${link.source}]=Math.min(10,SK[${link.source}].max);var supported=calc()`);
      assert.ok(g.run(`supported.skillBonus[${link.target}]>0`), `${link.source} -> ${link.target}: bonus`);
      assert.ok(g.run(`supported.actives.find(s=>s.id===${link.target}).tot>baseline.actives.find(s=>s.id===${link.target}).tot`), `${link.source} -> ${link.target}: damage`);
      g.run(`delete S.sk[${link.source}];var restored=calc()`);
      assert.equal(g.run(`restored.actives.find(s=>s.id===${link.target}).tot`), g.run(`baseline.actives.find(s=>s.id===${link.target}).tot`));
    }
  });

  test(`${mode}: production graph displays actual bonus, inactive targets and unsupported IDs`, () => {
    const g=game();g.run(`fixture('${mode}',100);S.sk={10:10,319:1,271:1};recalc()`);
    const link=g.json("skillSupportLinks(10,skillLv(10),S).find(x=>x.target===319)");
    assert.equal(link.active,true);
    assert.equal(link.percent,g.run("R.P.skillBonus[319]"));
    const html=g.run("skillGraphHTML()");
    assert.ok(html.includes("Hoành Tảo Thiên Quân"));
    assert.ok(html.includes("ID 1083"));
    assert.ok(html.includes("chưa được hỗ trợ"));
    assert.ok(g.run("skillEffectLines(SK[10],10).some(x=>x.includes('Hoành Tảo Thiên Quân'))"));
    g.run("delete S.sk[319];recalc()");
    assert.equal(g.run("skillSupportLinks(10,skillLv(10),S).find(x=>x.target===319).active"),false);
    assert.equal(g.run("skillSupportLinks(271,1,S).find(x=>x.target===1083).active"),false);
    g.run("S.fac='tangmen'");
    assert.equal(g.run("skillSupportLinks(10,10,S).find(x=>x.target===319).active"),false);
  });
}

test("passive descriptions report weapon mismatch instead of claiming every effect is active", () => {
  const g=game();g.run("fixture();S.sk[4]=1;S.eq={};recalc()");
  assert.ok(g.run("skillEffectLines(SK[4],1).some(x=>x.includes('đúng loại vũ khí'))"));
  g.run("S.eq.weapon=makeItem(0,2,1,2);recalc()");
  assert.equal(g.run("skillEffectLines(SK[4],1).some(x=>x.includes('đúng loại vũ khí'))"),false);
});

test("support levels respect the granted-level cap and child rows do not double the parent bonus",()=>{
  const g=game();
  for(const mode of ["ctc","phlt","g2"]) {
    g.run(`fixture('${mode}',100);S.sk={29:10,325:1};recalc()`);
    assert.equal(g.run("R.P.skillBonus[325]"),g.run("skillSupportLinks(29,skillLv(29),S).find(x=>x.target===325).percent"));
    const child=g.json("skillSupportLinks(29,skillLv(29),S).find(x=>x.target===408)");
    assert.equal(child.status,"child");assert.equal(child.active,false);
    g.run("S.sk={10:SK[10].max,319:1};recalc();R.P.plusSkill=999");
    assert.equal(g.run("skillLv(10)"),g.run("SK[10].max+SKILL_LV_MAX"));
    assert.equal(g.run("factionSkillGraph(S.fac).find(x=>x.source===10 && x.target===319).percent"),
      g.run("skVal(SK[10],'addskilldamage2',skillLv(10))[2]"));
  }
});
