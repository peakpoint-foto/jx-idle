import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

for (const mode of ["ctc", "phlt", "g2"]) {
  test(`${mode}: abort siege without contribution grants nothing`, () => {
    const g = game(); g.run(`fixture('${mode}'); siegeStart('kinh'); siegeExit(false,false);`);
    assert.equal(g.run("siegeTokens()"), 0);
  });
  test(`${mode}: cannot rebirth or transfer during any activity`, () => {
    const g = game();
    for (const activity of ["S.siege={city:'kinh',layer:2}", "R.tk={wave:1}", "R.tower={floor:1}", "SV.on=true"]) {
      g.run(`fixture('${mode}',180); ${activity}; doReborn();`);
      assert.equal(g.run("S.lvl"), 180);
      g.run("modeTransferDo()");
      assert.equal(g.run("S.mode"), mode);
    }
  });
  test(`${mode}: daily quests exclude pot use for nopot`, () => {
    const g = game(); g.run(`fixture('${mode}');S.chal='nopot'`);
    for (let i = 0; i < 40; i++) assert.equal(g.run("dailyQuests(true).list.some(q=>q.k==='pots')"), false);
  });
}

test("2.0 Tong Kim allows another entry", () => {
  const g = game(); g.run("fixture('g2');tkStart();tkExit(false);tkStart()");
  assert.ok(g.run("!!R.tk"));
});
test("survival cannot start while siege runs", () => {
  const g = game();g.run("fixture();S.siege={city:'kinh',layer:1};svStart()");
  assert.equal(g.run("SV.on"), false);
});
test("nopot survival potion changes neither HP nor cooldown", () => {
  const g = game();g.run("fixture();S.chal='nopot';Object.assign(SV,{on:true,paused:false,over:false,hp:10,maxhp:100,hpCd:0});svUseHp()");
  assert.deepEqual(g.json("[SV.hp,SV.hpCd]"), [10,0]);
});
test("aborted training does not complete the train quest", () => {
  const g = game();g.run("fixture();RW().yt={i:5,have:0,done:false};Object.assign(SV,{t:0,kills:0,spawned:0,autoT:0,gold:0,L0:60,bossKills:0});svRewards(false)");
  assert.equal(g.run("ytState().done"), false);
});
test("slot deletion also unlinks its online token and cached kill rate", () => {
  const g = game();g.run("fixture();localStorage.setItem(slotKey(0)+'_online','test');localStorage.setItem(slotKey(0)+'_kps','3');deleteSlot(0)");
  assert.equal(g.run("localStorage.getItem(slotKey(0)+'_online')"), null);
  assert.equal(g.run("localStorage.getItem(slotKey(0)+'_kps')"), null);
});
test("new saves have stable IDs and replacing a slot unlinks the old token", () => {
  const g=game();g.run("fixture();save();const old=S.cid;localStorage.setItem(slotKey(0)+'_online','test');const replacement=Object.assign(newSave(),{fac:'shaolin',mode:'ctc'});writeSlot(0,replacement);({old,newId:replacement.cid,token:localStorage.getItem(slotKey(0)+'_online')})");
  const result=g.json("({old:S.cid,newId:JSON.parse(localStorage.getItem(slotKey(0))).cid,token:localStorage.getItem(slotKey(0)+'_online')})");
  assert.notEqual(result.old,result.newId);assert.equal(result.token,null);
});
test("local API does not silently route to production", () => {
  const g = game();assert.equal(g.run("onlBase()"), "/api");
  g.run("window.JX_API='http://localhost:8787'");assert.equal(g.run("onlBase()"), "http://localhost:8787/api");
});
for (const [start, quota] of [["towerStart()","towerTries().n"],["tkStart()","tkState().used"],["siegeStart('kinh')","siegeState().used"]]) {
  test(`${start}: accepted entry persists quota immediately`, () => {
    const g = game();g.run(`fixture();save();${start}`);
    const memory = g.run(quota);
    g.run("S=unpack(localStorage.getItem(saveKey())).state");
    assert.equal(g.run(quota), memory);
  });
  test(`${start}: storage failure rolls back entry without losing the old battlefield`, () => {
    const g = game();g.run("fixture();save();R.enemies=[{id:'old'}]");g.failWrites(true);
    g.run(start);
    assert.equal(g.run("activityBusy()"), false);
    assert.equal(g.run(quota), 0);
    assert.equal(g.run("R.enemies[0].id"), "old");
  });
}

test("all activity starts reject an active siege without changing it", () => {
  const g = game();
  for (const start of ["towerStart()", "tkStart()", "siegeStart('kinh')", "svStart()"]){
    g.run("fixture();S.siege={city:'kinh',layer:2};R.enemies=[{id:'old'}]");g.run(start);
    assert.equal(g.run("S.siege.layer"),2);
    assert.equal(g.run("R.enemies[0].id"),"old");
  }
});
test("existing nopot daily quests migrate without re-opening claimed rewards", () => {
  const g=game();g.run("fixture();S.chal='nopot';RW().dq={day:today(),bonus:1,list:[{k:'pots',done:false,have:4,need:10},{k:'pots',done:true,have:10,need:10}]};dailyQuests()");
  assert.deepEqual(g.json("dailyQuests().list.map(q=>[q.k,q.done,q.have])"),[["kills",false,0],["pots",true,10]]);
  assert.equal(g.run("dailyQuests().bonus"),1);
  g.run("dailyQuests().list[0].have=20;dailyQuests()");assert.equal(g.run("dailyQuests().list[0].have"),20);
});
test("daily stage quests are replaced at the stage cap", () => {
  const g=game();g.run("fixture();S.stage=STAGE_CAP;RW().dq={day:today(),list:[{k:'stages',done:false,have:0,need:5}]};dailyQuests()");
  assert.equal(g.run("dailyQuests().list[0].k"),"kills");
  g.run("dailyQuests().list[0].done=true;dailyQuests()");
  assert.equal(g.run("dailyQuests().list[0].k"),"kills");
});
test("Tong Kim shop caps each stable item ID weekly", () => {
  const g=game();g.run("fixture('g2');RW().tkTok=1000;tkBuy(3)");
  const points=g.run("S.attrPts"),tokens=g.run("tkTokens()");g.run("tkBuy(3)");
  assert.equal(g.run("S.attrPts"),points);assert.equal(g.run("tkTokens()"),tokens);
  g.run("tkState().week='previous';tkBuy(3)");assert.equal(g.run("S.attrPts"),points+4);
});
test("mode transfer blocks an unclaimed completed quest", () => {
  const g=game();g.run("fixture();RW().yt={i:5,have:1,done:true};modeTransferDo()");
  assert.equal(g.run("S.mode"),"ctc");assert.equal(g.run("ytState().done"),true);
});
test("mode transfer resets incompatible quest and challenge explicitly", () => {
  const g=game();g.run("fixture();S.chal='nopot';RW().yt={i:5,have:0,done:false};modeTransferDo()");
  assert.equal(g.run("S.mode"),"g2");assert.deepEqual(g.json("RW().yt"),{i:0,have:0,done:false});
  assert.equal(g.run("S.chal"),"");
});
test("2.0 does not advertise nonexistent Hoang Kim pity", () => {
  const g=game();g.run("fixture('g2')");assert.equal(g.run("modeTabHTML().includes('Bảo hiểm Hoàng Kim')"),false);
  g.run("fixture('phlt')");assert.equal(g.run("modeTabHTML().includes('Bảo hiểm Hoàng Kim')"),true);
});
test("guaranteed CP rewards have six distinct legal max-value lines", () => {
  const g=game();
  for(const mode of ["ctc","phlt","g2"])for(const level of [1,39,60,80,180]){
    g.run(`fixture('${mode}',${level})`);
    for(let n=0;n<20;n++){
      g.run("var reward=svCpItem()");
      assert.ok(g.run("!!reward"),`${mode} ${level}`);
      assert.equal(g.run("reward.mag.length"),6);
      assert.equal(g.run("new Set(reward.mag.map(m=>m.a)).size"),6);
      assert.ok(g.run("modeItemOk(reward,S.mode)"));
      assert.ok(g.run("reward.mag.every(m=>J.affix.some(a=>a.a===m.a&&a.n===m.n&&a.pre===m.pre&&(a.s<0||a.s===reward.s)&&a.w[reward.d]>0))"));
    }
  }
});
