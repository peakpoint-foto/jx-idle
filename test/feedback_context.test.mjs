import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
test('diagnostics is opt-in, strips private fields and is bounded in both modes and events',()=>{
 const g=game();g.run("fixture('g2',100);setFeatureFlags({feedback_diagnostics:true});var privateEvent={kind:'damage',at:1,raw:10,useful:8,excess:2,skillId:10,sourceId:'private-id',reason:'token=SECRET',token:'SECRET'};var diagnostic={v:1,mode:'g2',fac:'shaolin',version:'jx-combat-v2',buildId:'b_12345678',activity:'farm',token:'SECRET',events:[privateEvent]};var form={text:'Lỗi kỹ năng',cat:'bug',contact:''}");
 const normal=g.json('feedbackPayload(form,{mode:"g2"},diagnostic)');assert.equal('ctx'in normal,false);assert.equal('diagnostics'in normal,false);
 g.run('form.includeContext=true;form.includeDiagnostics=true');const included=g.json('feedbackPayload(form,{mode:"g2",token:"SECRET"},diagnostic)');assert.equal(JSON.stringify(included).includes('SECRET'),false);assert.equal(included.diagnostics.events.length,1);
 g.run('diagnostic.events=Array(33).fill(privateEvent)');assert.throws(()=>g.run('cleanFeedbackDiagnostics(diagnostic)'),/Timeline/);
});
test('context preview captures snapshot without save/token and text redacts labelled secrets/contact',()=>{
 const g=game();g.run("fixture('ctc',100);setFeatureFlags({feedback_diagnostics:true,combat_reports:true});combatRecord('damage',{sourceId:'player',targetId:'npc',raw:20,capacity:10,skillId:10});combatFinish('won')");
 const before=g.json('S'),snapshot=g.json('feedbackDiagnosticsSnapshot()');assert.match(snapshot.buildId,/^b_[a-f0-9]{8}$/);assert.equal(snapshot.events.length,1);assert.deepEqual(g.json('S'),before);
 const clean=g.run("redactFeedbackText('token=secret Bearer abcdef alice@example.com 0912345678')");for(const text of ['secret','abcdef','alice@example.com','0912345678'])assert.equal(clean.includes(text),false);
 assert.equal(g.requests.length,0);g.run('setFeatureFlags({})');assert.throws(()=>g.run('feedbackDiagnosticsSnapshot()'),/chưa mở/);
});
