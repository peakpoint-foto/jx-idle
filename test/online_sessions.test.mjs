import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
function ready(){const g=game();g.run("fixture('ctc',60);setFeatureFlags({party_combat:true});onlSet({id:'me',token:'local-test-party-token'});partyRender=()=>{};PARTY_CLIENT.identity=partyIdentity();var snapshot={id:'session123456',mode:'ctc',model:COMBAT_MODEL_VERSION,rules:SESSION_COMBAT.version,status:'active',revision:1,tick:0,next_seq:1,boss:{hp:100,max:100},actors:[],events:[]};partyAccept({session:snapshot},partyIdentity())");return g;}
test('lost command acknowledgement retries exact payload after poll; stale revisions and changed identities cannot overwrite',async()=>{
  const g=ready();g.run("var bodies=[],attempt=0;onlApi=async(path,opt)=>{bodies.push(JSON.parse(JSON.stringify(opt.body)));if(attempt++===0)throw Error('offline');return {session:{...snapshot,revision:3,next_seq:2}}}");
  await g.run("partyWrite('guard')");assert.ok(g.run('!!PARTY_CLIENT.pending'));
  g.run('partyAccept({session:{...snapshot,revision:2,tick:4,next_seq:2}},partyIdentity())');await g.run('partyWrite()');
  assert.deepEqual(g.json('bodies[0]'),g.json('bodies[1]'));assert.equal(g.run('PARTY_CLIENT.pending'),null);
  g.run('partyAccept({session:snapshot},partyIdentity())');assert.equal(g.run('PARTY_CLIENT.session.revision'),3);
  g.run("var oldIdentity=partyIdentity();onlSet({id:'other',token:'other-token'});partyAccept({session:snapshot},oldIdentity)");assert.equal(g.run('PARTY_CLIENT.session.revision'),3);
});
test('server rejection releases pending request; mode/flag/sandbox guards make no request and active session pauses local combat',async()=>{
  const g=ready();g.run("onlApi=async()=>{throw {error:'command_window',msg:'late'}}");await g.run("partyWrite('guard')");assert.equal(g.run('PARTY_CLIENT.pending'),null);
  g.run('var life=R.life,saveBefore=JSON.stringify(S);tick(1)');assert.equal(g.run('R.life'),g.run('life'));assert.equal(g.run('JSON.stringify(S)'),g.run('saveBefore'));
  g.run("var calls=0;onlApi=async()=>{calls++;return {session:null}};setFeatureFlags({party_combat:false})");await g.run('partyPoll()');await g.run("partyWrite('create')");assert.equal(g.run('calls'),0);assert.equal(g.run('R.onlineSession'),null);
  g.run("setFeatureFlags({party_combat:true});S.mode='phlt'");await g.run("partyWrite('create')");assert.equal(g.run('calls'),0);
  g.run("S.mode='ctc';ADMV.sandbox=true");await g.run("partyWrite('create')");assert.equal(g.run('calls'),0);
});
test('an older in-flight empty poll cannot erase a newly acknowledged session',async()=>{
  const g=ready();g.run("var releaseRead;onlApi=async(path,opt)=>opt?.body?{session:{...snapshot,revision:4}}:new Promise(r=>releaseRead=r);var read=partyPoll(true)");
  await g.run("partyWrite('guard')");g.run('releaseRead({session:null})');await g.run('read');
  assert.equal(g.run('PARTY_CLIENT.session.revision'),4);assert.equal(g.run('R.onlineSession.id'),'session123456');
});
