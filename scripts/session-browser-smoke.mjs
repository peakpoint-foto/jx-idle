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
  f.env.FEATURE_FLAGS.party_dungeon=true;
  f.env.FEATURE_FLAGS.party_siege=true;
  f.env.FEATURE_FLAGS.seasonal_challenge=true;
  await DB.prepare("UPDATE chars SET bracket='so' WHERE account_id IN (?1,?2)").bind(f.players[0].id,f.players[1].id).run();
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
  await DB.prepare("INSERT INTO friendships(a,b,requester,status,created_at,expires_at) VALUES(?1,?2,?1,'accepted',?3,?4)").bind(f.players[0].id,f.players[1].id,Date.now(),Date.now()+864e5).run();
  await DB.batch([
    DB.prepare("INSERT INTO guilds(id,name,owner_id,week,created_at,updated_at) VALUES('guildsmoke','Smoke guild',?1,'w1',?2,?2)").bind(f.players[0].id,Date.now()),
    DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES('guildsmoke',?1,'owner',?2,?2)").bind(f.players[0].id,Date.now()),
    DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES('guildsmoke',?1,'member',?2,?2)").bind(f.players[1].id,Date.now()),
  ]);
  for(const [i,c] of clients.entries()){
    const ui=await evaluate(c,`(async()=>{await onlRenderRoom(true);const b=document.querySelector('#onlRoomPanel [data-moderate="mute"]');return {admin:!!document.querySelector('#moderationAdminPanel input[type=password]'),selfService:!!b,safeText:!!b&&b.innerHTML===b.textContent}})()`);
    assert.ok(ui.admin&&ui.selfService&&ui.safeText,JSON.stringify({i,ui}));
  }
  await evaluate(clients[0],`(async()=>{await onlRenderGuild();const input=document.querySelector('#guildChatInput');if(!input)throw Error('guild chat UI missing');input.value='<b>safe chat</b>';document.querySelector('#guildChatSend').click();for(let i=0;i<30&&!document.querySelector('#guildChatMessages')?.textContent.includes('safe chat');i++)await new Promise(r=>setTimeout(r,50));if(!document.querySelector('#guildChatMessages')?.textContent.includes('safe chat'))throw Error('guild chat roundtrip failed')})()`);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM room_chat WHERE scope='guild' AND room_id='guildsmoke'").first()).n,1);
  await evaluate(clients[0],`(async()=>{await onlApi('/moderation',{body:{action:'mute',target_id:${JSON.stringify(f.players[1].id)},duration_ms:3600000}});await onlRenderRoom(true);if(!document.querySelector('#onlRoomPanel [data-moderate="unmute"]'))throw Error('mute state not reflected in lobby UI');await onlApi('/moderation',{body:{action:'unmute',target_id:${JSON.stringify(f.players[1].id)}}});await onlApi('/moderation',{body:{action:'report',target_id:${JSON.stringify(f.players[1].id)},reason:'spam',details:'browser moderation smoke'}})})()`);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM player_reports WHERE reporter_id=?1 AND target_id=?2").bind(f.players[0].id,f.players[1].id).first()).n,1);
  const queued=await evaluate(clients[0],`(async()=>{const realFetch=window.fetch;activityReceiptEnqueue({id:'tower-'+Date.now()+'-smoke1234',kind:'tower',stage:{floor:2},contribution:{kills:4,cleared:1}});window.fetch=async()=>{throw new TypeError('offline smoke')};const offlineSent=await activityRetryReceipts();const pending=activityReceiptRead().length;window.fetch=realFetch;const retried=await activityRetryReceipts();return {offlineSent,pending,retried,left:activityReceiptRead().length}})()`);
  assert.deepEqual(queued,{offlineSent:0,pending:1,retried:1,left:0});
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM activity_events WHERE account_id=?1 AND activity='tower'").bind(f.players[0].id).first()).n,1);
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
  const bossRow=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(id).first(),bossState=JSON.parse(bossRow.state);
  bossState.boss.hp=Math.min(bossState.boss.hp,bossState.boss.max*.25);bossState.boss.def=0;
  await DB.prepare('UPDATE combat_sessions SET state=?2 WHERE id=?1').bind(id,JSON.stringify(bossState)).run();
  for(let n=0;n<120;n++){const s=await evaluate(clients[0],'PARTY_CLIENT.session');if(s.status!=='active')break;clock+=1000;for(const c of clients)await evaluate(c,'partyPoll(true)');}
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.status'),'completed','Real boss must be defeated');
  for(const c of clients){await evaluate(c,"partyWrite('claim')");await evaluate(c,"partyWrite('claim')");}
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM session_rewards WHERE session_id=?1').bind(id).first()).n,2);
  const amounts=(await DB.prepare('SELECT amount FROM session_rewards WHERE session_id=?1').bind(id).all()).results;assert.ok(amounts.every(r=>r.amount===1));
  for(const c of clients)await evaluate(c,"document.querySelector('[data-party=\"dismiss\"]')?.click();true");
  await evaluate(clients[0],"partyWrite('dungeon')");
  const dungeon=await evaluate(clients[0],'({session:PARTY_CLIENT.session,error:PARTY_CLIENT.error,pending:PARTY_CLIENT.pending})');assert.equal(dungeon.session.activity,'dungeon',JSON.stringify(dungeon));
  const dungeonId=dungeon.session.id;
  await evaluate(clients[1],'partyPoll(true)');assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.activity'),'dungeon');
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlineSessionPanel').textContent.includes('Phụ bản CTC · Phá trận')"));
  const stateRow=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(dungeonId).first(),dungeonState=JSON.parse(stateRow.state);
  dungeonState.boss.hp=dungeonState.boss.max*.65;for(const a of dungeonState.actors)a.cooldown=10;
  await DB.prepare('UPDATE combat_sessions SET state=?2 WHERE id=?1').bind(dungeonId,JSON.stringify(dungeonState)).run();
  clock+=250;for(const c of clients)await evaluate(c,'partyPoll(true)');
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.boss.ward'),1);
  await evaluate(clients[0],"partyWrite('guard')");await evaluate(clients[1],"partyWrite('guard')");
  clock+=250;for(const c of clients)await evaluate(c,'partyPoll(true)');
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.objectives.breaks'),1);
  assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.boss.ward'),0);
  await evaluate(clients[0],"partyWrite('leave')");await evaluate(clients[1],"partyWrite('leave')");
  await evaluate(clients[0],"partyWrite('siege')");assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.activity'),'siege');
  await evaluate(clients[1],'partyPoll(true)');assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.activity'),'siege');
  const siegeActions=await evaluate(clients[0],"[...document.querySelectorAll('#onlineSessionPanel [data-party=\"capture\"],#onlineSessionPanel [data-party=\"resupply\"]')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))");
  assert.equal(siegeActions.length,2);assert.ok(siegeActions.every(b=>b.height>=44),JSON.stringify(siegeActions));
  await evaluate(clients[0],"partyWrite('capture','point')");await evaluate(clients[1],"partyWrite('capture','point')");
  clock+=250;for(const c of clients)await evaluate(c,'partyPoll(true)');assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.siege.point'),50);
  clock+=500;for(const c of clients)await evaluate(c,'partyPoll(true)');
  await evaluate(clients[0],"partyWrite('capture','point')");await evaluate(clients[1],"partyWrite('capture','point')");
  clock+=250;for(const c of clients)await evaluate(c,'partyPoll(true)');
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.status'),'completed');assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.siege.point'),100);
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlineSessionPanel').textContent.includes('Công thành · Mục tiêu')"));
  for(const c of clients)await evaluate(c,"partyWrite('claim')");
  await evaluate(clients[0],'onlRenderSeason()');
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlSeasonPanel').textContent.includes('Nhiệm vụ bang tuần')"));
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlSeasonPanel').textContent.includes('10/250')"));
  const touch=await evaluate(clients[0],"[...document.querySelectorAll('#onlineSessionPanel button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))");assert.ok(touch.every(b=>b.height>=44),JSON.stringify(touch));
  console.log(JSON.stringify({runtime:process.env.JX_D1_RUNTIME==='1'?'D1 local':'SQLite local',clients:2,isolatedContexts:true,viewports:[360,1280],sharedState:true,ackLossRetry:true,reloadReconnect:true,realBossCompletion:true,receiptsOnce:true,dungeonFormation:true,dungeonFlagOff:true,siegeCapture:true,siegeServerCompletion:true,seasonUI:true,guildWeeklyTask:true,activityReceiptOfflineRetry:true,moderationUI:true,muteReportServerRoundtrip:true,roomAndGuildChat:true,touch:touch.every(b=>b.height>=44)},null,2));
}finally{
  for(const c of clients)c.close();if(browser){for(const id of contexts)await browser.command('Target.disposeBrowserContext',{browserContextId:id}).catch(()=>{});browser.close();}
  if(server)await new Promise(r=>server.close(r));while(inFlight)await new Promise(r=>setTimeout(r,20));Date.now=realNow;await DB.close();
}
