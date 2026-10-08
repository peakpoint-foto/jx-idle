import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {localD1} from '../worker/test/helpers/d1.js';
import {sessionFixture} from '../worker/test/helpers/session-fixture.js';
import worker from '../worker/src/index.js';
const debug=process.env.JX_DEBUG_ORIGIN||'http://127.0.0.1:9229',root=path.resolve(new URL('../',import.meta.url).pathname),DB=await localD1();
const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const contexts=[],clients=[];let server,browser,inFlight=0;
function socket(url){
  const ws=new WebSocket(url),pending=new Map();let next=0;
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});
  const ready=new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  return {ready,close:()=>ws.close(),command:async(method,params={})=>{await ready;const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};
}
async function evaluate(c,expression){const r=await c.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function navigate(c,url,game=false){
  const result=await c.command('Page.navigate',{url});if(result.errorText)throw Error(result.errorText);
  const href=new URL(url).href;
  for(let n=0;n<100;n++){
    const ready=await evaluate(c,`location.href===${JSON.stringify(href)}&&document.readyState==='complete'${game?"&&typeof partyPoll==='function'&&typeof closeModal==='function'&&typeof setFeatureFlags==='function'":''}`);
    if(ready)return;await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Browser document did not load '+url);
}
try{
  const f=await sessionFixture(DB,2);
  server=http.createServer(async(req,res)=>{inFlight++;try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname.startsWith('/api/')){const parts=[];for await(const chunk of req)parts.push(chunk);const body=Buffer.concat(parts);
      const r=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,body:body.length?body:undefined}),f.env,{});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;}
    const name=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!name.startsWith(root+path.sep))throw Error('Bad asset path');
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
    const body=await fs.readFile(name);res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream'});res.end(body);
  }catch(e){res.writeHead(404);res.end('Missing local asset');}finally{inFlight--;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const version=await (await fetch(debug+'/json/version')).json();browser=socket(version.webSocketDebuggerUrl);await browser.ready;
  for(let i=0;i<2;i++){
    const ctx=await browser.command('Target.createBrowserContext');contexts.push(ctx.browserContextId);
    const target=await browser.command('Target.createTarget',{url:'about:blank',browserContextId:ctx.browserContextId});
    const pages=await (await fetch(debug+'/json/list')).json(),p=pages.find(p=>p.id===target.targetId);const c=socket(p.webSocketDebuggerUrl);clients.push(c);await c.ready;
    await c.command('Page.enable');await c.command('Emulation.setDeviceMetricsOverride',{width:i?1280:360,height:800,deviceScaleFactor:1,mobile:!i});await c.command('Page.navigate',{url:origin});
    let ready=false;for(let n=0;n<100;n++){ready=await evaluate(c,"document.readyState==='complete'&&typeof partyPoll==='function'&&typeof closeModal==='function'");if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
    await evaluate(c,`closeModal(true);S=${JSON.stringify(f.players[i].state)};onlSet(${JSON.stringify({id:f.players[i].id,token:f.players[i].token,name:'Smoke'+i})});ONL.lastSync=Date.now();setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});recalc();document.querySelector('#tabs [data-t="more"]').click();renderMore();partyRender();partyPoll(true)`);
  }
  await evaluate(clients[0],"partyWrite('create')");const created=await evaluate(clients[0],'({session:PARTY_CLIENT.session,error:PARTY_CLIENT.error,pending:PARTY_CLIENT.pending?.body})');assert.ok(created.session,JSON.stringify(created));const id=created.session.id;await evaluate(clients[1],'partyPoll(true)');
  assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.id'),id);
  for(let n=0;n<6;n++){clock+=500;for(const c of clients)await evaluate(c,'partyPoll(true)');}
  const view=await evaluate(clients[0],'({tick:PARTY_CLIENT.session.tick,boss:PARTY_CLIENT.session.boss,actors:PARTY_CLIENT.session.actors})');
  assert.deepEqual(await evaluate(clients[1],'({tick:PARTY_CLIENT.session.tick,boss:PARTY_CLIENT.session.boss,actors:PARTY_CLIENT.session.actors})'),view);
  // Drop the response AFTER the real command commits, then retry the retained payload.
  await evaluate(clients[0],"var realApi=onlApi;onlApi=async(p,o)=>{const r=await realApi(p,o);if(o?.body?.action==='command'){onlApi=realApi;throw {code:'offline',msg:'lost ack fixture'};}return r;};partyWrite('guard')");
  assert.equal(await evaluate(clients[0],'!!PARTY_CLIENT.pending'),true);await evaluate(clients[0],'partyWrite()');
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM session_actions WHERE session_id=?1').bind(id).first()).n,1);
  // Reload an independent client: pointer and authenticated account reconnect to server state.
  await navigate(clients[1],'about:blank');await navigate(clients[1],origin,true);
  await evaluate(clients[1],`S=${JSON.stringify(f.players[1].state)};setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});recalc();document.querySelector('#tabs [data-t="more"]').click();renderMore();partyPoll(true)`);
  assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.id'),id);
  for(let n=0;n<120;n++){const s=await evaluate(clients[0],'PARTY_CLIENT.session');if(s.status!=='active')break;clock+=1000;for(const c of clients)await evaluate(c,'partyPoll(true)');}
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.status'),'completed','Real boss must be defeated');
  for(const c of clients){await evaluate(c,"partyWrite('claim')");await evaluate(c,"partyWrite('claim')");}
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM session_rewards WHERE session_id=?1').bind(id).first()).n,2);
  const amounts=(await DB.prepare('SELECT amount FROM session_rewards WHERE session_id=?1').bind(id).all()).results;assert.ok(amounts.every(r=>r.amount===1));
  const touch=await evaluate(clients[0],"[...document.querySelectorAll('#onlineSessionPanel button')].every(b=>b.getBoundingClientRect().height>=44)");assert.ok(touch);
  console.log(JSON.stringify({runtime:process.env.JX_D1_RUNTIME==='1'?'D1 local':'SQLite local',clients:2,isolatedContexts:true,viewports:[360,1280],sharedState:true,ackLossRetry:true,reloadReconnect:true,realBossCompletion:true,receiptsOnce:true,touch:true},null,2));
}finally{
  for(const c of clients)c.close();if(browser){for(const id of contexts)await browser.command('Target.disposeBrowserContext',{browserContextId:id}).catch(()=>{});browser.close();}
  if(server)await new Promise(r=>server.close(r));while(inFlight)await new Promise(r=>setTimeout(r,20));Date.now=realNow;await DB.close();
}
