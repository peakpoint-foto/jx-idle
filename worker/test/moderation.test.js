import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {sha256Hex} from '../src/http.js';
import {moderation,adminModeration} from '../src/moderation.js';
import {friends} from '../src/lobby.js';

async function fixture(t){
  const DB=await localD1();t.after(()=>DB.close());const env={DB,ADMIN_KEY:'moderation-local-test-secret-012345'};
  for(const [id,name] of [['reporter','Reporter'],['target','Target']]){
    const token='moderation-local-test-token-0123456789-'+id;
    await DB.batch([
      DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,last_hb) VALUES(?1,?2,?3,?4,?4)').bind(id,await sha256Hex(token),name,Date.now()),
      DB.prepare('INSERT INTO chars(account_id,snapshot,lvl,fac,updated_at,power) VALUES(?1,?2,60,\'shaolin\',?3,100)').bind(id,JSON.stringify({v:2,mode:'ctc',fac:'shaolin',lvl:60}),Date.now())
    ]);
  }
  const req=(id,method='POST',adminKey)=>new Request('https://game.test/api/moderation',{method,headers:{authorization:'Bearer moderation-local-test-token-0123456789-'+id,'content-type':'application/json',...(adminKey?{'x-admin-key':adminKey}:{})}});
  return {DB,env,req};
}

test('moderation: bounded report, duplicate collapse, block removes friend access and admin action is audited',async t=>{
  const {DB,env,req}=await fixture(t);
  const report={action:'report',target_id:'target',reason:'spam',details:'repeat message'};
  const first=await moderation(req('reporter'),env,report),again=await moderation(req('reporter'),env,report);
  assert.equal(first.report_id,again.report_id);assert.equal(again.duplicate,true);
  await moderation(req('reporter'),env,{action:'block',target_id:'target'});
  assert.deepEqual((await moderation(req('reporter','GET'),env)).blocks.map(x=>x.target_id),['target']);
  await assert.rejects(()=>friends(req('reporter'),env,{action:'request',target_id:'target'}),{code:'player_blocked'});
  const adminReq=req('reporter','GET',env.ADMIN_KEY),rows=await adminModeration(adminReq,env,null,new URL('https://game.test/api/admin/moderation'));
  assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].details,'repeat message');
  await adminModeration(req('reporter','POST',env.ADMIN_KEY),env,{report_id:first.report_id,status:'closed'},new URL('https://game.test/api/admin/moderation'));
  assert.equal((await DB.prepare('SELECT action FROM admin_audit').first()).action,'report_closed');
  for(let n=0;n<4;n++){
    const next=await moderation(req('reporter'),env,{...report,reason:'other',details:'report '+n});
    await adminModeration(req('reporter','POST',env.ADMIN_KEY),env,{report_id:next.report_id,status:'closed'},new URL('https://game.test/api/admin/moderation'));
  }
  await assert.rejects(()=>moderation(req('reporter'),env,{...report,reason:'other'}),{code:'report_limit'});
  await assert.rejects(()=>adminModeration(req('reporter','GET','wrong'),env,null,new URL('https://game.test/api/admin/moderation')),{code:'forbidden'});
});
