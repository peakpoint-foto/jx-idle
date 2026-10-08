import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanFeedback,feedback,adminFeedbackMetrics,purgeFeedback,FB_RETENTION_MS} from '../src/feedback.js';
import {localD1} from './helpers/d1.js';
const diagnostic={v:1,mode:'phlt',fac:'shaolin',version:'jx-combat-v2',events:[{kind:'damage',at:1,raw:4,useful:4,excess:0,token:'secret',sourceId:'private'}]};
test('server diagnostics requires consent and redacts text/unknown context independently of client',()=>{
 const body={text:'skill bị lỗi token=secret foo@example.com',ctx:{mode:'phlt',token:'secret'},diagnostics:diagnostic};
 assert.equal('diagnostics' in cleanFeedback(body).ctx,false);body.diagnosticConsent=true;const clean=cleanFeedback(body);
 assert.equal(JSON.stringify(clean).includes('secret'),false);assert.equal(clean.ctx.diagnostics.events.length,1);
 assert.throws(()=>cleanFeedback({...body,diagnostics:{...diagnostic,events:Array(33).fill(diagnostic.events[0])}}),{code:'bad_diagnostics'});
});
test('local D1 feedback has feature/rate guards, mode metrics and retention cleanup',async t=>{
 const DB=await localD1();t.after(()=>DB.close());const env={DB,ADMIN_KEY:'local-test-admin-key-123',FEATURE_FLAGS:{feedback_diagnostics:true}};
 const req=new Request('https://game.test/api/feedback',{headers:{'cf-connecting-ip':'192.0.2.1'}}),url=new URL(req.url);
 const body={text:'Lỗi kỹ năng có mô tả',cat:'bug',diagnosticConsent:true,diagnostics:diagnostic};
 await assert.rejects(()=>feedback(req,{...env,FEATURE_FLAGS:{}},body,url),{code:'feature_disabled'});
 await DB.prepare("INSERT INTO feedback(at,cat,text,ctx,status) VALUES(?1,'bug','old','{}','open')").bind(Date.now()-FB_RETENTION_MS-1000).run();
 for(let i=0;i<5;i++)assert.equal((await feedback(req,env,body,url)).ok,true);
 await assert.rejects(()=>feedback(req,env,body,url),{code:'rate'});
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM feedback').first()).n,5);
 const adminReq=new Request('https://game.test/api/admin/feedback/metrics',{headers:{'x-admin-key':'local-test-admin-key-123'}});
 const metrics=await adminFeedbackMetrics(adminReq,env);assert.equal(metrics.rows[0].mode,'phlt');assert.equal(metrics.rows[0].reports,5);assert.equal(metrics.self_reported,true);
 await assert.rejects(()=>adminFeedbackMetrics(req,env),{code:'forbidden'});
 await purgeFeedback(DB,Date.now()+FB_RETENTION_MS+1000);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM feedback').first()).n,0);
});
