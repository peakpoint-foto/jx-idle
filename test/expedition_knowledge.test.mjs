import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run(`fixture('phlt',80);S.gold=1e7;setFeatureFlags({expedition:true,expedition_travel:true,expedition_routes:true,expedition_knowledge:true});npcSfx=()=>{};`);return g;}
function start(g,route='shelter'){assert.equal(g.run(`expeditionPrepare({route:'${route}'}).ok`),true);}
function clear(g){g.run('expeditionDepart();for(const e of R.enemies)e.hp=0;killCheck()');assert.equal(g.run('expeditionState().phase'),'rest');}
test('completion unlocks bounded information/recipe references/cosmetics once without stat or material rewards',()=>{
  const g=ready(),stats=g.json('calc()'),mats=g.json('S.mats');
  for(const route of ['shelter','salvage','shelter']){
    start(g,route);for(let n=0;n<3;n++)clear(g);assert.equal(g.run('expeditionFinish("completed").ok'),true);
  }
  assert.equal(g.run('expeditionKnowledge().checkpoints.length'),6);assert.equal(g.run('expeditionKnowledge().completed.length'),2);
  assert.equal(g.run('expeditionKnowledgeView().recipes.length'),2);assert.equal(g.run('expeditionKnowledgeView().cosmetics.length'),6);
  assert.ok(g.run('expeditionKnowledgeView().enemies.length>0'));assert.deepEqual(g.json('calc()'),stats);assert.deepEqual(g.json('S.mats'),mats);
  const p=g.json('expeditionKnowledge()');assert.equal(g.run('expeditionFinish("completed").ok'),false);assert.deepEqual(g.json('expeditionKnowledge()'),p);
});
test('failure retains exactly first cleared checkpoint; early abort/withdraw/reload grants no progress and journal states losses',()=>{
  for(const outcome of ['failed','withdrawn','interrupted']){
    const g=ready();start(g);clear(g);clear(g);assert.equal(g.run(`expeditionFinish('${outcome}').ok`),true);
    assert.deepEqual(g.json('expeditionKnowledge().checkpoints'),outcome==='failed'?['shelter:1']:[]);
    assert.equal(g.run('expeditionKnowledge().completed.length'),0);
    const row=g.json('expeditionKnowledge().journal[0]');assert.equal(row.outcome,outcome);assert.equal(row.cleared,2);
    if(outcome==='withdrawn'){assert.ok(row.banked>0);assert.equal(row.lostGold,0);}else{assert.equal(row.banked,0);assert.ok(row.lostGold>0);}
  }
  const g=ready();for(let n=0;n<12;n++){start(g);assert.equal(g.run('expeditionFinish("withdrawn").ok'),true);}
  assert.equal(g.run('expeditionKnowledge().journal.length'),10);assert.equal(g.run('expeditionKnowledge().checkpoints.length'),0);
});
test('reward plus meta progress retry is one atomic save; migration and reload are idempotent',()=>{
  const g=ready();start(g);for(let n=0;n<3;n++)clear(g);const gold=g.run('S.gold');g.failWrites(true);
  assert.equal(g.run('expeditionFinish("completed").ok'),false);assert.equal(g.run('S.gold'),gold);assert.equal(g.run('expeditionKnowledge().journal.length'),0);
  g.failWrites(false);assert.equal(g.run('expeditionRetrySave().ok'),true);const p=g.json('expeditionKnowledge()'),paid=g.run('S.gold');
  g.run('save();var raw=localStorage.getItem(saveKey());S=migrate(unpack(raw).state);S=migrate(S);expeditionRecover()');
  assert.deepEqual(g.json('expeditionKnowledge()'),p);assert.equal(g.run('S.gold'),paid);
  g.run('delete S.extensions.expeditionKnowledge.enemies;var prior=JSON.stringify(S.extensions.expeditionKnowledge)');
  assert.deepEqual(g.json('expeditionKnowledge().enemies'),[]);assert.equal(g.run('JSON.stringify(S.extensions.expeditionKnowledge)===prior'),true);
});
test('future/malformed meta namespace is preserved; flags/mode cannot unlock or rewrite it',()=>{
  for(const value of ['{v:9,future:"keep"}','{v:1,mode:"phlt",character:S.cid,checkpoints:Array(7).fill("shelter:1"),completed:[],journal:[]}']){
    const g=ready();g.run(`S.extensions.expeditionKnowledge=${value};var prior=JSON.stringify(S.extensions.expeditionKnowledge)`);start(g);for(let n=0;n<3;n++)clear(g);
    assert.equal(g.run('expeditionFinish("completed").ok'),true);assert.equal(g.run('JSON.stringify(S.extensions.expeditionKnowledge)===prior'),true);assert.equal(g.run('expeditionKnowledgeView().unsupported'),true);
  }
  const g=ready();start(g);for(let n=0;n<3;n++)clear(g);g.run('setFeatureFlags({expedition:true,expedition_travel:true,expedition_routes:true})');g.run('expeditionFinish("completed")');assert.equal(g.run('S.extensions.expeditionKnowledge'),undefined);
  for(const mode of ['ctc','g2']){g.run(`S.mode='${mode}';setFeatureFlags({expedition_knowledge:true})`);assert.equal(g.run('expeditionKnowledgeView()'),null);}
});
