import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {localD1} from '../worker/test/helpers/d1.js';
import {sessionFixture} from '../worker/test/helpers/session-fixture.js';
import worker from '../worker/src/index.js';
import {GAME} from '../worker/gen/game.js';
import {sha256Hex} from '../worker/src/http.js';
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
  // C07 siege: leave the dungeon, then play a real siege through the API with two isolated browsers.
  for(const c of clients)await evaluate(c,"partyWrite('leave')");
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session'),null);
  assert.equal(await evaluate(clients[0],"!!document.querySelector('#onlineSessionPanel [data-party=\"siege\"]')"),false,'siege entry stays hidden while its flag is off');
  f.env.FEATURE_FLAGS.party_siege=true;
  for(const c of clients)await evaluate(c,`setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});partyRender()`);
  assert.ok(await evaluate(clients[0],"!!document.querySelector('#onlineSessionPanel [data-party=\"siege\"]')"),'siege entry appears with its flag');
  await evaluate(clients[0],"partyWrite('siege')");
  const siege=await evaluate(clients[0],'({session:PARTY_CLIENT.session,error:PARTY_CLIENT.error})');assert.equal(siege.session?.activity,'siege',JSON.stringify(siege));
  const siegeId=siege.session.id;await evaluate(clients[1],'partyPoll(true)');assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.id'),siegeId);
  {const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(siegeId).first(),st=JSON.parse(row.state);
    for(const a of st.actors){a.cooldown=1e6;a.p.life=1e9;a.hp=1e9;}
    await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(siegeId,JSON.stringify(st)).run();}
  for(const c of clients)await evaluate(c,'partyPoll(true)');
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlineSessionPanel').textContent.includes('Công thành CTC · Chiếm điểm')&&!!document.querySelector('[data-party=\"capture\"][data-target=\"p1\"]')"));
  const siegeTouch=await evaluate(clients[0],"[...document.querySelectorAll('#onlineSessionPanel button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))");
  assert.ok(siegeTouch.some(b=>b.text==='Chiếm')&&siegeTouch.some(b=>b.text==='Tiếp tế')&&siegeTouch.every(b=>b.height>=44),JSON.stringify(siegeTouch));
  for(let n=0;n<80;n++){
    clock+=500;for(const c of clients)await evaluate(c,'partyPoll(true)');
    const view=await evaluate(clients[0],'PARTY_CLIENT.session');if(view.objectives.captured>=3)break;
    const point=view.objectives.points.find(x=>!x.owned).id;
    for(const c of clients)await evaluate(c,`partyWrite('capture',${JSON.stringify(point)})`);
  }
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.objectives.captured'),3);assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.boss.gate'),0);
  assert.ok((await evaluate(clients[1],'PARTY_CLIENT.session.actors')).every(a=>a.contribution.capture>0),'both browsers contributed captures');
  {const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(siegeId).first(),st=JSON.parse(row.state);
    st.boss.hp=Math.min(st.boss.hp,1);st.boss.def=0;for(const a of st.actors)a.cooldown=0;
    await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(siegeId,JSON.stringify(st)).run();}
  for(let n=0;n<120;n++){const s=await evaluate(clients[0],'PARTY_CLIENT.session');if(s.status!=='active')break;clock+=1000;for(const c of clients)await evaluate(c,'partyPoll(true)');}
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.status'),'completed','Siege boss must fall once the gate is open');
  for(const c of clients){await evaluate(c,"partyWrite('claim')");await evaluate(c,"partyWrite('claim')");}
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM resource_ledger WHERE source='siege_completion' AND request_id=?1").bind('party:'+siegeId).first()).n,2);
  for(const c of clients)await evaluate(c,"document.querySelector('[data-party=\"dismiss\"]')?.click();true");
  // C08: the ranked-season panel reads the real /api/season route in both viewports.
  f.env.FEATURE_FLAGS.ranked_seasons=true;
  for(const c of clients){
    await evaluate(c,`setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});renderMore();(async()=>{for(let i=0;i<60&&!document.querySelector('#seasonPanel')?.textContent.includes('Của bạn');i++)await new Promise(r=>setTimeout(r,50))})()`);
    await evaluate(c,"new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('#seasonPanel')?.textContent.includes('Của bạn')){clearInterval(t);r(true)}},50);setTimeout(()=>{clearInterval(t);r(false)},4000)})");
  }
  const seasonPanels=[];
  for(const c of clients){const panel=await evaluate(c,"({text:document.querySelector('#seasonPanel')?.textContent||'',buttons:[...document.querySelectorAll('#seasonPanel button')].map(b=>b.getBoundingClientRect().height),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})");
    assert.match(panel.text,/Mùa xếp hạng CTC · mùa \d+/,JSON.stringify(panel));assert.match(panel.text,/Của bạn/);assert.match(panel.text,/giờ VN/);assert.ok(panel.buttons.length>0&&panel.buttons.every(h=>h>=44),JSON.stringify(panel));assert.equal(panel.overflow,false,'season panel must not overflow the viewport');seasonPanels.push(panel);}
  // P05: the same two isolated browsers play a PHLT co-op rescue run through the real Worker.
  f.env.FEATURE_FLAGS.coop_rescue=true;f.env.FEATURE_FLAGS.online_account_phlt=true;
  const coop=[];
  for(let i=0;i<2;i++){
    const id='coop'+i,token='local-coop-smoke-token-'+i,fac=['shaolin','emei'][i];
    const main=GAME.FAC[fac].skills.find(k=>GAME.SK[k]?.req<=60&&GAME.SK[k]?.kind!=='passive')||GAME.FAC[fac].skills[0];
    const state={...GAME.newSave(),cid:'c_local_coop_smoke_'+i,mode:'phlt',fac,lvl:60,attrPts:295,skPts:58,main,sk:{[main]:1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id,await sha256Hex(token),'Coop'+i,Date.now()),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status,mode) VALUES(?1,?2,?3,?4,60,100,?5,'verified','phlt')").bind(id,state.cid,JSON.stringify(state),fac,Date.now())]);
    coop.push({id,token,state});
  }
  for(const [i,c] of clients.entries()){
    const p=coop[i];
    await evaluate(c,`S=${JSON.stringify(p.state)};onlSet(${JSON.stringify({id:p.id,token:p.token,name:'Coop'+i})});ONL.lastSync=Date.now();setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});recalc();partyReset();(async()=>{await onlRefreshMe();document.querySelector('#tabs [data-t="more"]').click();renderMore()})();true`);
  }
  const coopRoom=await evaluate(clients[0],"(async()=>{const d=await onlApi('/room',{body:{action:'create'}});return d.room.id})()");
  await evaluate(clients[1],`onlApi('/room',{body:{action:'join',room_id:${JSON.stringify(coopRoom)}}}).then(()=>true)`);
  for(const c of clients)await evaluate(c,"onlApi('/room',{body:{action:'ready',ready:true}}).then(()=>true)");
  await evaluate(clients[0],"onlRenderRoom(true).then(()=>true)");
  const lobbyText=await evaluate(clients[0],"document.querySelector('#onlRoomPanel')?.textContent||''");
  assert.match(lobbyText,/Giải cứu/);assert.match(lobbyText,/Mã phòng/);assert.doesNotMatch(lobbyText,/Bạn bè và lời mời|Chat phòng/,'PHLT lobby has no CTC friends, invites or chat');
  assert.equal(await evaluate(clients[0],"onlApi('/friends').then(()=>'open',e=>e.error||e.code||'denied')"),'different_mode','friends stay CTC-only');
  await evaluate(clients[0],"partyWrite('rescueStart')");
  const coopRun=await evaluate(clients[0],'({session:PARTY_CLIENT.session,error:PARTY_CLIENT.error})');assert.equal(coopRun.session?.activity,'rescue',JSON.stringify(coopRun));
  const coopId=coopRun.session.id;await evaluate(clients[1],'partyPoll(true)');assert.equal(await evaluate(clients[1],'PARTY_CLIENT.session.id'),coopId);
  {const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(coopId).first(),st=JSON.parse(row.state);
    for(const a of st.actors)a.cooldown=1e6;st.boss.cooldown=1e6;const down=st.actors.find(a=>a.id==='coop1');down.hp=0;down.downedUntil=st.tick+24;
    await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(coopId,JSON.stringify(st)).run();}
  for(const c of clients)await evaluate(c,'partyPoll(true)');
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlineSessionPanel').textContent.includes('Đang ngã')&&!!document.querySelector('[data-party=\"rescue\"][data-target=\"coop1\"]')"));
  await evaluate(clients[0],"document.querySelector('#tabs [data-t=more]').click();true");
  const coopTouch=await evaluate(clients[0],"[...document.querySelectorAll('#onlineSessionPanel button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))");
  assert.ok(coopTouch.some(b=>b.text==='Cứu')&&coopTouch.every(b=>b.height>=44),JSON.stringify(coopTouch));
  clock+=500;await evaluate(clients[0],"partyWrite('rescue','coop1')");clock+=250;for(const c of clients)await evaluate(c,'partyPoll(true)');
  const rescued=await evaluate(clients[1],'PARTY_CLIENT.session.actors');
  assert.ok(rescued.find(a=>a.id==='coop1').hp>0&&rescued.find(a=>a.id==='coop1').rescued===1&&rescued.find(a=>a.id==='coop0').contribution.rescue===1,JSON.stringify(rescued));
  {const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(coopId).first(),st=JSON.parse(row.state);
    st.boss.hp=Math.min(st.boss.hp,1);st.boss.def=0;for(const a of st.actors){a.cooldown=0;a.contribution.damage=Math.max(a.contribution.damage,1);}
    await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(coopId,JSON.stringify(st)).run();}
  for(let n=0;n<120;n++){const v=await evaluate(clients[0],'PARTY_CLIENT.session');if(v.status!=='active')break;clock+=1000;for(const c of clients)await evaluate(c,'partyPoll(true)');}
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.status'),'completed','the PHLT rescue boss must fall');
  for(const c of clients){await evaluate(c,"partyWrite('claim')");await evaluate(c,"partyWrite('claim')");}
  const marks=(await DB.prepare("SELECT account_id,mode,asset,source,delta FROM resource_ledger WHERE request_id=?1 ORDER BY account_id").bind('party:'+coopId).all()).results.map(r=>({...r}));
  assert.deepEqual(marks,[{account_id:'coop0',mode:'phlt',asset:'rescue_mark',source:'rescue_completion',delta:2},{account_id:'coop1',mode:'phlt',asset:'rescue_mark',source:'rescue_completion',delta:1}]);
  assert.ok(await evaluate(clients[0],"document.querySelector('#onlineSessionPanel').textContent.includes('điểm cứu viện')"));
  for(const c of clients)await evaluate(c,"document.querySelector('[data-party=\"dismiss\"]')?.click();true");
  // P06: the weekly trial is simulated by the server and lands on a board both browsers read.
  f.env.FEATURE_FLAGS.weekly_trial=true;
  for(const c of clients)await evaluate(c,`setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});document.querySelector('#tabs [data-t=more]').click();renderMore();true`);
  await evaluate(clients[1],"onlApi('/room',{body:{action:'leave'}}).then(()=>true)");
  await evaluate(clients[0],"trialStart('short').then(()=>true)");
  const trialRun=await evaluate(clients[0],'({session:PARTY_CLIENT.session,error:PARTY_CLIENT.error,trialError:TRIAL_CLIENT.error})');
  assert.equal(trialRun.session?.activity,'trial',JSON.stringify(trialRun));
  const trialId=trialRun.session.id;
  {const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(trialId).first(),st=JSON.parse(row.state);
    st.actors[0].cooldown=1e6;st.actors[0].hp=0.001;st.objectives.depth=2;
    await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(trialId,JSON.stringify(st)).run();}
  for(let n=0;n<120;n++){const v=await evaluate(clients[0],'PARTY_CLIENT.session');if(v.status!=='active')break;clock+=1000;await evaluate(clients[0],'partyPoll(true)');}
  assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.status'),'aborted');assert.equal(await evaluate(clients[0],'PARTY_CLIENT.session.objectives.depth'),2);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM trial_results WHERE session_id=?1 AND depth=2").bind(trialId).first()).n,1,'the server recorded the finished run once');
  for(const c of clients)await evaluate(c,'trialLoad(true).then(()=>true)');
  for(const c of clients){const text=await evaluate(c,"document.querySelector('#trialPanel')?.textContent||''");assert.match(text,/Thử thách tuần PHLT/);assert.match(text,/Coop0/);assert.match(text,/chặng 2/);assert.match(text,/Không có thưởng/);}
  await evaluate(clients[0],"document.querySelector('#tabs [data-t=more]').click();true");
  const trialTouch=await evaluate(clients[0],"[...document.querySelectorAll('#trialPanel button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))");
  assert.ok(trialTouch.length>=3&&trialTouch.every(b=>b.height>=44),JSON.stringify(trialTouch));
  assert.equal(await evaluate(clients[0],"document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true,'the trial panel must not overflow the viewport');
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM resource_ledger WHERE request_id=?1").bind('party:'+trialId).first()).n,0,'the trial pays nothing');
  // G04: 2.0 community challenge. One player publishes a build; both browsers run the identical server-simulated fight and read one board.
  f.env.FEATURE_FLAGS.community_challenge=true;f.env.FEATURE_FLAGS.online_account_g2=true;
  const chal=[];
  for(let i=0;i<2;i++){
    const id='gtwo'+i,token='local-gtwo-smoke-token-'+i,fac=['shaolin','emei'][i];
    const main=GAME.FAC[fac].skills.find(k=>GAME.SK[k]?.req<=40&&GAME.SK[k]?.kind!=='passive')||GAME.FAC[fac].skills[0];
    const state={...GAME.newSave(),cid:'c_local_gtwo_smoke_'+i,mode:'g2',fac,lvl:60,attrPts:295,skPts:58,main,sk:{[main]:1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id,await sha256Hex(token),'Gtwo'+i,Date.now()),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status,mode) VALUES(?1,?2,?3,?4,60,100,?5,'verified','g2')").bind(id,state.cid,JSON.stringify(state),fac,Date.now())]);
    chal.push({id,token,state});
  }
  for(const [i,c] of clients.entries()){
    const p=chal[i];
    await evaluate(c,`S=${JSON.stringify(p.state)};onlSet(${JSON.stringify({id:p.id,token:p.token,name:'Gtwo'+i})});ONL.lastSync=Date.now();setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});recalc();partyReset();PARTY_CLIENT.identity=null;CHALLENGE_CLIENT.identity=null;CHALLENGE_CLIENT.data=null;document.querySelector('#tabs [data-t="more"]').click();renderMore();challengeLoad(true).then(()=>true)`);
    await evaluate(c,"new Promise(r=>{const t=setInterval(()=>{if(CHALLENGE_CLIENT.data){clearInterval(t);r(true)}},50);setTimeout(()=>{clearInterval(t);r(false)},4000)})");
  }
  assert.match(await evaluate(clients[0],"document.querySelector('#challengePanel')?.textContent||''"),/Thử thách cộng đồng 2\.0/);
  assert.equal(await evaluate(clients[0],"!!document.querySelector('#onlineSessionPanel')"),false,'2.0 has no room/party panel before a session exists');
  await evaluate(clients[0],"challengePublish('std40').then(()=>true)");
  const code=await evaluate(clients[0],'CHALLENGE_CLIENT.data?.mine[0]?.code');assert.match(code,/^CH-[A-HJ-NP-Z2-9]{8}$/,String(await evaluate(clients[0],'CHALLENGE_CLIENT.error')));
  await evaluate(clients[1],'challengeLoad(true).then(()=>true)');
  assert.equal(await evaluate(clients[1],'CHALLENGE_CLIENT.data.recent[0].code'),code,'the other player sees the published challenge');
  const challengeIds=[];
  for(const [i,c] of clients.entries()){
    await evaluate(c,`challengeStart(${JSON.stringify(code)}).then(()=>true)`);
    const run=await evaluate(c,'({session:PARTY_CLIENT.session,error:PARTY_CLIENT.error,challengeError:CHALLENGE_CLIENT.error})');
    assert.equal(run.session?.activity,'challenge',JSON.stringify(run));assert.equal(run.session.challenge.code,code);challengeIds.push(run.session.id);
    const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(run.session.id).first(),st=JSON.parse(row.state);
    st.actors[0].cooldown=1e6;st.actors[0].hp=0.001;st.objectives.depth=2+i;
    await DB.prepare('UPDATE combat_sessions SET state=?2,revision=revision+1 WHERE id=?1').bind(run.session.id,JSON.stringify(st)).run();
    for(let n=0;n<120;n++){const v=await evaluate(c,'PARTY_CLIENT.session');if(v.status!=='active')break;clock+=1000;await evaluate(c,'partyPoll(true)');}
    assert.equal(await evaluate(c,'PARTY_CLIENT.session.status'),'aborted');
  }
  assert.equal(challengeIds[0]===challengeIds[1],false);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM challenge_results WHERE challenge_id=?1").bind(code).first()).n,2,'the server recorded both finished runs once');
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM resource_ledger WHERE request_id IN (?1,?2)").bind('party:'+challengeIds[0],'party:'+challengeIds[1]).first()).n,0,'challenges pay nothing');
  for(const c of clients){await evaluate(c,"document.querySelector('[data-party=\"dismiss\"]')?.click();true");await evaluate(c,`challengeBoard(${JSON.stringify(code)}).then(()=>true)`);
    await evaluate(c,"document.querySelector('#tabs [data-t=more]').click();true");
    const text=await evaluate(c,"document.querySelector('#challengePanel')?.textContent||''");
    assert.match(text,/#1 Gtwo1/);assert.match(text,/#2 Gtwo0/);assert.match(text,/chặng 3/);assert.match(text,/chặng 2/);assert.match(text,/Không có thưởng/);}
  const challengeTouch=await evaluate(clients[0],"[...document.querySelectorAll('#challengePanel button,#challengePanel input')].map(b=>({text:b.textContent||b.placeholder,height:b.getBoundingClientRect().height}))");
  assert.ok(challengeTouch.length>=8&&challengeTouch.every(b=>b.height>=44),JSON.stringify(challengeTouch));
  assert.equal(await evaluate(clients[0],"document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true,'the challenge panel must not overflow the viewport');
  f.env.FEATURE_FLAGS.community_challenge=false;for(const c of clients)await evaluate(c,`setFeatureFlags(${JSON.stringify(f.env.FEATURE_FLAGS)});renderMore();true`);
  assert.equal(await evaluate(clients[0],"!!document.querySelector('#challengePanel')"),false,'flag off removes the challenge panel');
  const touch=await evaluate(clients[0],"[...document.querySelectorAll('#onlineSessionPanel button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))");assert.ok(touch.every(b=>b.height>=44),JSON.stringify(touch));
  console.log(JSON.stringify({runtime:process.env.JX_D1_RUNTIME==='1'?'D1 local':'SQLite local',clients:2,isolatedContexts:true,viewports:[360,1280],sharedState:true,ackLossRetry:true,reloadReconnect:true,realBossCompletion:true,receiptsOnce:true,dungeonFormation:true,dungeonFlagOff:true,siegeCapture:true,siegeGateOpenAfterAllPointsCaptured:true,siegeReceiptsOnce:true,siegeTouch:siegeTouch.every(b=>b.height>=44),rankedSeasonPanel:seasonPanels.length===2,phltCoopLobby:true,phltCoopRescue:true,phltRescueMarksOnce:true,phltTouch:coopTouch.every(b=>b.height>=44),phltWeeklyTrial:true,g2CommunityChallenge:true,challengeBoardShared:true,challengeTouch:challengeTouch.every(b=>b.height>=44),trialBoardShared:true,trialTouch:trialTouch.every(b=>b.height>=44),activityReceiptOfflineRetry:true,moderationUI:true,muteReportServerRoundtrip:true,roomAndGuildChat:true,touch:touch.every(b=>b.height>=44)},null,2));
}finally{
  for(const c of clients)c.close();if(browser){for(const id of contexts)await browser.command('Target.disposeBrowserContext',{browserContextId:id}).catch(()=>{});browser.close();}
  if(server)await new Promise(r=>server.close(r));while(inFlight)await new Promise(r=>setTimeout(r,20));Date.now=realNow;await DB.close();
}
