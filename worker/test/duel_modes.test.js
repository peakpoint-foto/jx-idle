import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {duels} from '../src/social.js';
import {duelProfile,duelOutcome,duelFactor} from '../src/duel_rules.js';

async function fixture(t){
  const DB=await localD1();t.after(()=>DB.close());
  const env={DB,FEATURE_FLAGS:{duel_modes:true}},players=[];
  for(let i=0;i<3;i++){
    const id='p'+i,token='duel-test-token-0123456789-'+i,now=Date.now();
    const state=Object.assign(GAME.newSave(),{mode:'ctc',fac:'shaolin',lvl:60,attrPts:295,skPts:60,cid:'c_duel_character_'+i});
    const profile=duelProfile({snapshot:JSON.stringify(state),fac:state.fac,lvl:state.lvl,play_sec:1e7});
    await DB.batch([
      DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)").bind(id,await sha256Hex(token),'Player'+i,now),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,lvl,fac,updated_at,power,bracket,validation_status) VALUES(?1,?2,?3,60,'shaolin',?4,?5,'so','verified')").bind(id,state.cid,JSON.stringify(state),now,profile.power)
    ]);
    players.push({id,state,req:(method='POST')=>new Request('https://game.test/api/duels',{method,headers:{authorization:'Bearer '+token}})});
  }
  return {env,DB,players};
}
const offer=(p,env,kind='ranked',opponent='Player1')=>duels(p.req(),env,{action:'challenge',kind,opponent});
const accept=(p,env,id)=>duels(p.req(),env,{action:'accept',id});

test('duel v2: friendly never scores; ranked concurrent acceptance scores once and explains frozen estimate',async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  const friendly=await offer(p,env,'friendly');
  await Promise.all([accept(q,env,friendly.duel.id),accept(q,env,friendly.duel.id)]);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM duel_scores').first()).n,0);
  const ranked=await offer(p,env);
  await Promise.all([accept(q,env,ranked.duel.id),accept(q,env,ranked.duel.id)]);
  const resolved=await DB.prepare('SELECT d.*,m.rules_version FROM duels d JOIN duel_meta m ON m.duel_id=d.id WHERE d.id=?1').bind(ranked.duel.id).first();
  const score=await DB.prepare('SELECT SUM(points) AS points,COUNT(*) AS n FROM duel_scores').first();
  assert.equal(score.n,2);assert.equal(score.points,duelOutcome(resolved).tie?2:4);
  const list=await duels(p.req('GET'),env);
  const row=list.duels.find(d=>d.id===ranked.duel.id);
  assert.equal(row.rules_version,'power-v2');assert.equal(row.combat_version,GAME.COMBAT_MODEL_VERSION);
  assert.equal(row.explanation.algorithm,'power_estimate');assert.equal(row.explanation.ranked,true);
  assert.equal(list.matches.length,2);assert.equal(list.ranked_ready,true);
  assert.ok(list.season_end>list.season_start);
});

test('duel v2: declined/expired offers count toward atomic daily pair cap; self and invalid kinds fail',async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  await assert.rejects(()=>offer(p,env,'ranked','Player0'),{code:'self_duel'});
  await assert.rejects(()=>offer(p,env,'anything'),{code:'bad_duel_kind'});
  for(let i=0;i<2;i++){
    const d=await offer(p,env);
    await duels(q.req(),env,{action:'decline',id:d.duel.id});
    await duels(q.req(),env,{action:'decline',id:d.duel.id});
  }
  const results=await Promise.allSettled([offer(p,env),offer(q,env,'ranked','Player0')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await DB.prepare("UPDATE duels SET expires_at=0 WHERE status='pending'").run();
  await duels(q.req('GET'),env);
  await assert.rejects(()=>offer(p,env),{code:'duel_unavailable'});
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM duel_meta').first()).n,3);
  await offer(p,env,'friendly'); // no ranked points/cap consumed
});

test('duel v2: power/bracket matching recomputes validated state; mode, stale and malformed snapshots denied',async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  const weak={...q.state,attr:{str:0,dex:0,vit:0,eng:0}},strong={...p.state,attr:{str:500,dex:0,vit:0,eng:0},attrPts:0};
  await DB.prepare('UPDATE chars SET snapshot=?1 WHERE account_id=?2').bind(JSON.stringify(strong),p.id).run();
  await DB.prepare('UPDATE chars SET snapshot=?1 WHERE account_id=?2').bind(JSON.stringify(weak),q.id).run();
  await assert.rejects(()=>offer(p,env),{code:'power_mismatch'});
  await offer(p,env,'friendly');
  await DB.prepare("UPDATE duels SET status='declined'").run();
  for(const snapshot of ['null','{',JSON.stringify({...q.state,mode:'phlt'}),JSON.stringify({...q.state,skPts:999999})]){
    await DB.prepare('UPDATE chars SET snapshot=?1 WHERE account_id=?2').bind(snapshot,q.id).run();
    await assert.rejects(()=>offer(p,env,'friendly'),{code:'snapshot_invalid'});
  }
  await DB.prepare('UPDATE chars SET snapshot=?1,updated_at=1 WHERE account_id=?2').bind(JSON.stringify(q.state),q.id).run();
  await assert.rejects(()=>offer(p,env,'friendly'),{code:'ranked_locked'});
});

test('duel v2: frozen build, model, flagged/pending eligibility, TTL and season guards',async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  const d=await offer(p,env);
  for(const status of ['pending_verification','flagged']){
    await DB.prepare('UPDATE chars SET validation_status=?1 WHERE account_id=?2').bind(status,p.id).run();
    await assert.rejects(()=>accept(q,env,d.duel.id),{code:'ranked_locked'});
  }
  await DB.prepare("UPDATE chars SET validation_status='verified'").run();
  await DB.prepare("UPDATE duel_meta SET combat_version='old'").run();
  await assert.rejects(()=>accept(q,env,d.duel.id),{code:'combat_version_changed'});
  await DB.prepare('UPDATE duel_meta SET combat_version=?1').bind(GAME.COMBAT_MODEL_VERSION).run();
  await DB.prepare("UPDATE duels SET season='old'").run();
  await accept(q,env,d.duel.id);
  assert.equal((await DB.prepare('SELECT status FROM duels').first()).status,'expired');
  const f=await offer(p,env,'friendly');
  await DB.prepare("UPDATE duels SET season='old',expires_at=0 WHERE id=?1").bind(f.duel.id).run();
  await accept(q,env,f.duel.id);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM duel_scores').first()).n,0);
  const frozen=await offer(p,env,'friendly');
  await DB.prepare('UPDATE chars SET snapshot=?1,sync_rev=sync_rev+1 WHERE account_id=?2').bind(JSON.stringify({...p.state,attr:{str:100,dex:0,vit:0,eng:0},attrPts:195}),p.id).run();
  await accept(q,env,frozen.duel.id);
  const row=await DB.prepare('SELECT * FROM duels WHERE id=?1').bind(frozen.duel.id).first();
  assert.equal(row.challenger_score,row.challenger_power*duelFactor(row.id,'c'));
});

test('duel v2: tie has one point each and no win/loss; recovery and flag rollback preserve legacy',async t=>{
  const {env,DB,players:[p,q]}=await fixture(t);
  const d=await offer(p,env);const id=d.duel.id;
  // Equal factors are required for an exact tie with the same frozen power.
  let tieId='tie0';for(let i=0;duelFactor(tieId,'c')!==duelFactor(tieId,'d');i++)tieId='tie'+i;
  await DB.batch([DB.prepare('UPDATE duels SET id=?2 WHERE id=?1').bind(id,tieId),DB.prepare('UPDATE duel_meta SET duel_id=?2 WHERE duel_id=?1').bind(id,tieId)]);
  assert.equal(duelOutcome({id:tieId,challenger_power:100,defender_power:100,rules_version:'power-v2'}).tie,true);
  let fail=true;
  const unstable={...env,DB:{prepare:DB.prepare.bind(DB),async batch(s){if(fail){fail=false;throw new Error('timeout')}return DB.batch(s)}}};
  await assert.rejects(()=>accept(q,unstable,tieId),/timeout/);
  await Promise.all([accept(q,env,tieId),accept(q,env,tieId)]);
  assert.deepEqual({...await DB.prepare('SELECT SUM(points) AS points,SUM(wins) AS wins,SUM(losses) AS losses FROM duel_scores').first()},{points:2,wins:0,losses:0});
  assert.equal((await duels(q.req('GET'),env)).score.draws,1);
  await assert.rejects(()=>offer(p,{...env,FEATURE_FLAGS:{}},'friendly'),{code:'feature_disabled'});
  const legacy=await offer(p,{...env,FEATURE_FLAGS:{}});
  assert.equal(legacy.duel.rules_version,'legacy-power-v1');
});
