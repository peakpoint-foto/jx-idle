import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(mode='ctc',level=20){const g=game();g.run(`fixture('${mode}',${level});setFeatureFlags({context_guide:true,build_advice:true,loot_codex:true,combat_policy:true,training_lab:true,build_library:true})`);return g;}
test('new and returning guides are mode specific, flag gated and read-only',()=>{
 const ids={ctc:['build','register'],phlt:['gear','mana','supplies'],g2:['train','library','combo']};
 for(const mode of Object.keys(ids)){const g=ready(mode),before=g.json('S'),hints=g.json('contextGuide()');for(const id of ids[mode])assert.ok(hints.some(h=>h.id===id));assert.deepEqual(g.json('S'),before);
  g.run('setFeatureFlags({context_guide:true})');assert.deepEqual(g.json('contextGuide().map(h=>h.id)'),mode==='ctc'?['skills','register']:['skills']);
  g.run('setFeatureFlags({})');assert.equal(g.run('contextGuide().length'),0);
 }
});
test('completion persists separately, is bounded, survives reload and does not transfer modes',()=>{
 const g=ready(),tut=g.run('S.tut');assert.equal(g.run("contextGuideComplete('skills').ok"),true);assert.equal(g.run("contextGuide().some(h=>h.id==='skills')"),false);
 assert.equal(g.run('S.tut'),tut);assert.equal(g.run("contextGuideComplete('skills').ok"),false);g.run('load();recalc()');assert.equal(g.run("contextGuide().some(h=>h.id==='skills')"),false);
 g.run("S.mode='g2'");assert.equal(g.run("contextGuide().some(h=>h.id==='skills')"),true);g.run("S.mode='ctc';S.fac='wudu'");assert.equal(g.run("contextGuide().some(h=>h.id==='skills')"),true);
});
test('ineligible activity/account and ongoing combat do not advertise unavailable actions',()=>{
 const g=ready('ctc',100);assert.equal(g.run("contextGuide().some(h=>h.id==='register'||h.id==='guild')"),false);
 g.run("S.rw.siege={week:weekKey(),used:1}");assert.equal(g.run("contextGuide().some(h=>h.id==='activity')"),false);
 g.run("S.siege={};setFeatureFlags({context_guide:true,build_advice:true,combat_reports:true})");assert.deepEqual(g.json('contextGuide().map(h=>h.id)'),['skills','report']);
});
test('storage failure, sandbox and future namespace do not overwrite progress',()=>{
 const g=ready(),before=g.json('S');g.failWrites(true);assert.equal(g.run("contextGuideComplete('skills').ok"),false);assert.deepEqual(g.json('S'),before);
 g.failWrites(false);g.run('ADMV.sandbox=true');assert.equal(g.run("contextGuideComplete('skills').ok"),false);
 g.run('ADMV.sandbox=false;S.extensions.contextGuide={v:2}');assert.equal(g.run("contextGuideComplete('skills').ok"),false);
});
