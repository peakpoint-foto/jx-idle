// Requires a local Chromium with --remote-debugging-port and a static dev server.
// Uses Node's built-in WebSocket; no browser package or external service needed.
const origin = process.env.JX_TEST_ORIGIN || "http://127.0.0.1:8088";
const debuggerOrigin = process.env.JX_DEBUG_ORIGIN || "http://127.0.0.1:9229";
// Start blank so readiness can never come from an old document being reloaded.
const response = await fetch(`${debuggerOrigin}/json/new?about:blank`, { method: "PUT" });
if (!response.ok) throw new Error("Cannot create local browser page");
const page = await response.json();
const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map();
let next = 0;
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
ws.addEventListener("message", event => {
  const message = JSON.parse(event.data), entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id); clearTimeout(entry.timer);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});
function command(method, params = {}) {
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Network.enable");
  await command("Network.setCacheDisabled",{cacheDisabled:true});
  const navigation = await command("Page.navigate",{url:origin});
  if (navigation.errorText) throw new Error("Cannot navigate to game: " + navigation.errorText);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate(`location.origin===${JSON.stringify(new URL(origin).origin)} && document.readyState==='complete' && typeof closeModal==='function' && typeof skillGraphHTML==='function' && typeof buildCandidate==='function' && typeof trainingPanelHTML==='function' && typeof combatReportsModal==='function' && typeof expeditionModal==='function' && typeof onlEconomyModal==='function' && typeof R!=='undefined' && !!document.getElementById('t-skill')`);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Game scripts did not load");
  await evaluate("document.fonts.ready.then(()=>true)");
  await command("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  const motion=await evaluate("(() => {const b=document.getElementById('giftBtn');b.classList.add('on');const animation=getComputedStyle(b,'::after').animationName;b.classList.remove('on');return animation})()");
  if(motion!=='none')throw new Error('Reduced-motion preference not respected: '+motion);
  const results = [];
  for (const viewport of [{width:360,height:800,orientation:"portrait",mobile:true},{width:800,height:360,orientation:"landscape",mobile:true},{width:1280,height:800,orientation:"desktop",mobile:false}]) {
    const {width,height}=viewport;
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: viewport.mobile });
    for (const mode of ["ctc", "phlt", "g2"]) {
      const result = await evaluate(`(() => {
        closeModal(true);S=Object.assign(newSave(),{fac:'shaolin',mode:'${mode}',lvl:100,sexSet:1,sk:{10:10,319:1,271:1},skPts:50});
        R.tower=null;R.tk=null;SV.on=false;R.dirty=true;recalc();
        if(window.jxClosePanel)jxClosePanel();
        const nav=document.querySelector('#tabs [data-t="skill"]');if(!nav)throw Error('Missing skill navigation');nav.click();renderSkill();
        const graph=document.getElementById('skillGraph');if(!graph)throw Error('Missing skill graph');
        graph.open=true;graph.scrollIntoView({block:'center'});
        const text=graph.textContent;
        if(!text.includes('ID 1083')||!text.includes('chưa được hỗ trợ')||!text.includes('Hoành Tảo Thiên Quân'))throw Error('Wrong graph text');
        const button=graph.querySelector('[data-graph-skill="10"]');if(!button)throw Error('Missing skill link');button.click();
        if(!document.getElementById('mBody').textContent.includes('Bổ trợ Hoành Tảo Thiên Quân'))throw Error('Missing support modal');
        closeModal(true);const rect=graph.getBoundingClientRect();
        showTab('more');renderMore();const search=document.getElementById('fieldSearchInput');if(!search)throw Error('Field search missing');
        search.value='Hoành Tảo';search.dispatchEvent(new Event('input',{bubbles:true}));
        const searchButton=document.querySelector('#fieldSearchResults button');if(!searchButton||!searchButton.textContent.includes('Hoành Tảo'))throw Error('Skill search result missing');
        if(search.getBoundingClientRect().height<43.9||searchButton.getBoundingClientRect().height<43.9)throw Error('Field search touch target '+search.getBoundingClientRect().height+'/'+searchButton.getBoundingClientRect().height+' '+S.mode+'/'+innerWidth);
        searchButton.click();if(curTab!=='skill')throw Error('Skill search navigation failed');
        showTab('more');setFeatureFlags(${mode==='phlt'?'{expedition:true}':mode==='g2'?'{skill_mutators:true,training_lab:true}':'{resource_summary:true}'});renderMore();
        const search2=document.getElementById('fieldSearchInput'),itemName=J.items[0].list[0].n;search2.value=itemName;search2.dispatchEvent(new Event('input',{bubbles:true}));
        if(!document.querySelector('#fieldSearchResults button')?.textContent.includes(itemName))throw Error('Item search result missing');
        document.querySelector('#fieldSearchResults button').click();if(curTab!=='inv'||lootFilter().kw!==itemName.slice(0,20))throw Error('Item search navigation/filter failed');
        showTab('more');renderMore();
        const search3=document.getElementById('fieldSearchInput');${mode==='ctc'?`search3.value='Công thành';search3.dispatchEvent(new Event('input',{bubbles:true}));const activity=document.querySelector('#fieldSearchResults button');if(!activity?.textContent.includes('Công thành'))throw Error('CTC activity search result missing');activity.click();if(!document.getElementById('giftTabs'))throw Error('CTC activity route failed '+typeof giftModal+' '+giftTab);closeModal(true);`:`search3.value=${mode==='phlt'?"'Hành trình'":"'Bí cảnh'"};search3.dispatchEvent(new Event('input',{bubbles:true}));if(!document.querySelector('#fieldSearchResults button')?.textContent.includes(${mode==='phlt'?"'Hành trình'":"'Bí cảnh'"}))throw Error('Activity search result missing ${mode} '+modeId()+' button:'+!!document.getElementById('${mode==='phlt'?'expeditionOpen':'riftOpen'}'));`}
        showTab('skill');
        showTab('skill');document.dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true}));
        if(curTab!=='more'||document.activeElement!==document.getElementById('fieldSearchInput'))throw Error('Global search keyboard shortcut failed');
        setUiPref({hand:'left'});if(!document.body.classList.contains('jxleft'))throw Error('Left-hand preference failed');setUiPref({hand:'right'});
        showTab('more');renderMore();const weekly=document.getElementById('weeklyTaskCard');if(!weekly)throw Error('Weekly task panel missing '+S.mode);
        const firstTask=WEEKLY_TASKS[S.mode][0],choose=weekly.querySelector('[data-week-select="'+firstTask.id+'"]');if(!choose||choose.getBoundingClientRect().height<43.9)throw Error('Weekly task touch target missing');
        choose.click();weeklyRecord(firstTask.event,firstTask.need);weeklyRenderCard();const weeklyClaimButton=document.querySelector('#weeklyTaskCard [data-week-claim]');
        if(!weeklyClaimButton)throw Error('Weekly claim unavailable '+S.mode);weeklyClaimButton.click();if(weeklyRead().claims.length!==1)throw Error('Weekly receipt missing '+S.mode);
        showTab('skill');
        return {mode:S.mode,width:${width},height:${height},orientation:${JSON.stringify(viewport.orientation)},graphWidth:Math.round(rect.width),linkedModal:true,unsupportedVisible:true,fieldSearch:true,weeklyTask:true};
      })()`);
      if (result.graphWidth <= 0) throw new Error("Graph is not laid out: " + JSON.stringify(result));
      results.push(result);
      const factions=await evaluate("Object.keys(FAC)");
      for(const faction of factions) {
        const check=await evaluate(`(() => {
          closeModal(true);S=Object.assign(newSave(),{fac:'${faction}',mode:'${mode}',lvl:100,sexSet:1});
          S.sk=Object.fromEntries(FAC[S.fac].skills.map(id=>[id,1]));recalc();renderSkill();
          const graph=document.getElementById('skillGraph'),expected=factionSkillGraph(S.fac);
          if(expected.length && !graph)throw Error('Missing faction graph');
          if(!expected.length)return {faction:S.fac,links:0};
          graph.open=true;
          for(const link of expected)if(!graph.textContent.includes(link.sourceName)||!graph.textContent.includes(String(link.percent)+'%'))throw Error('Missing graph row');
          const button=graph.querySelector('[data-graph-skill]');button.click();
          if(!document.getElementById('mBody').textContent.includes('Bổ trợ'))throw Error('Missing faction support modal');
          closeModal(true);if(graph.getBoundingClientRect().width<=0)throw Error('Hidden graph');
          return {faction:S.fac,links:expected.length};
        })()`);
        if(check.faction!==faction)throw new Error('Faction mismatch');
      }
      result.factionsVerified=factions.length;
      const buildCheck=await evaluate(`(() => {
        closeModal(true);setFeatureFlags({build_profiles:true});
        S=Object.assign(newSave(),{fac:'shaolin',mode:'${mode}',lvl:100,sexSet:1,sk:{10:10,319:1},main:319,mainLock:true,skPts:50});
        S.eq.weapon=makeItem(0,2,1,2);S.eq.weapon.req=[];S.slots=[319,0,0,0];
        R.tower=null;R.tk=null;SV.on=false;recalc();renderSkill();
        const saveButton=document.querySelector('#t-skill [data-bsave="0"]');saveButton.click();
        if(!S.builds?.[0]?.equipment?.weapon)throw Error('Build save button did not capture gear');
        document.querySelector('#t-skill [data-bpreview="0"]').click();
        if(!document.getElementById('mBody').textContent.includes('DPS ước tính'))throw Error('Missing build preview');
        closeModal(true);respecAttrs();respecSkills();recalc();renderSkill();
        const loadButton=document.querySelector('#t-skill [data-bload="0"]');loadButton.click();
        if(S.sk[10]!==10||S.main!==319)throw Error('Build load button did not restore skills');
        const rows=[...document.querySelectorAll('.build-profile-row')];
        if(!rows.length||rows.some(row=>row.scrollWidth>row.clientWidth+2))throw Error('Build row overflows');
        const rect=document.querySelector('#t-skill [data-bload="0"]').getBoundingClientRect();if(rect.width<44||rect.height<44)throw Error('Build action too small: '+rect.width+'x'+rect.height);
        setFeatureFlags({});return {saved:true,preview:true,loaded:true,rows:rows.length};
      })()`);
      result.buildProfiles=buildCheck;
      const adviceCheck=await evaluate(`(() => {
        setFeatureFlags({build_advice:true,build_profiles:true});
        const item=makeItem(2,0,10,0);item.req=[];
        const hp=J.affix.filter(a=>a.pre===1&&canonAttr(attrName(a.a))==='lifemax_v'&&(a.w[2]||0)>0).sort((a,b)=>b.p[0][1]-a.p[0][1])[0];
        if(!hp)throw Error('Missing HP fixture affix');
        item.mag=[{a:hp.a,p:hp.p.map(r=>Math.max(...r)),pre:1,n:hp.n}];item.r=1;S.inv.push(item);renderSkill();
        const goal=S.mode==='g2'?'mana':'survival';
        document.querySelector('[data-advice-goal="'+goal+'"]').click();
        if(!document.getElementById('mBody').textContent.includes('Điểm mục tiêu'))throw Error('Missing advice explanation');
        const state=JSON.stringify(S);buildAdvice(goal);if(JSON.stringify(S)!==state)throw Error('Advice mutated save');
        if(S.mode!=='g2'){
          const apply=document.querySelector('[data-advice-apply]');if(!apply)throw Error('Missing owned-gear recommendation');apply.click();
          if(S.eq.armor?.uid!==item.uid)throw Error('Explicit recommendation apply failed');
        }
        closeModal(true);setFeatureFlags({});renderSkill();if(document.getElementById('buildAdvicePanel'))throw Error('Advice flag off failed');
        return {explanation:true,previewPure:true,explicitApply:S.mode!=='g2',flagOff:true};
      })()`);
      result.buildAdvice=adviceCheck;
      const policyCheck=await evaluate(`(() => {
        setFeatureFlags({combat_policy:true});renderSkill();
        const profile={ctc:'objective',phlt:'conserve',g2:'rotation'}[S.mode];
        document.getElementById('combatPolicyPanel').open=true;
        document.getElementById('combatPolicyProfile').value=profile;document.getElementById('combatPolicyControl').checked=true;
        document.getElementById('combatPolicySave').click();
        if(S.extensions.combatPolicy.profile!==profile||!S.extensions.combatPolicy.reserveControl)throw Error('Policy save UI failed');
        if(!document.getElementById('combatPolicyPanel').textContent.includes('Buff/nội tại'))throw Error('Missing buff explanation');
        setFeatureFlags({});renderSkill();if(document.getElementById('combatPolicyPanel'))throw Error('Policy flag off failed');
        return {saved:true,buffExplanation:true,flagOff:true};
      })()`);
      result.combatPolicy=policyCheck;
      const libraryCheck=await evaluate(`(() => {
        setFeatureFlags({build_library:true,training_lab:true});renderSkill();
        if(S.mode!=='g2'){if(document.getElementById('buildLibraryOpen'))throw Error('Library escaped mode');return {denied:true};}
        document.getElementById('buildLibraryOpen').click();document.getElementById('buildShareExport').click();
        const code=document.getElementById('buildShareCode').value;if(!code.startsWith('JXB1:'))throw Error('Missing share export');
        document.getElementById('buildSharePreview').click();if(document.getElementById('buildShareSave').disabled)throw Error('Share preview rejected exported code');
        document.getElementById('buildShareSave').click();if(buildLibraryEntries().length!==1)throw Error('Library UI add failed');
        const before=JSON.stringify([S.eq,S.gold,S.xp]);document.querySelector('[data-library-measure="0"]').click();
        if(buildLibraryEntries()[0].measurements.length!==1)throw Error('Library UI measure failed');
        if(JSON.stringify([S.eq,S.gold,S.xp])!==before)throw Error('Library imported rewards/equipment');
        document.querySelector('[data-library-apply="0"]').click();document.querySelector('[data-library-remove="0"]').click();
        if(buildLibraryEntries().length)throw Error('Library remove failed');closeModal(true);setFeatureFlags({});renderSkill();
        if(document.getElementById('buildLibraryOpen'))throw Error('Library flag off failed');return {export:true,preview:true,add:true,measure:true,apply:true,remove:true};
      })()`);
      result.buildLibrary=libraryCheck;
      const codexCheck=await evaluate(`(() => {
        setFeatureFlags({loot_codex:true});renderSkill();document.getElementById('lootCodexOpen').click();
        const body=document.getElementById('mBody');if(!body.textContent.includes('Wishlist theo thuộc tính'))throw Error('Missing wishlist');
        if(S.mode==='ctc'&&body.textContent.includes('Hoàng Kim'))throw Error('CTC codex advertised forbidden rarity');
        if(S.mode==='phlt'&&body.textContent.includes('Bạch Kim'))throw Error('PHLT codex advertised forbidden rarity');
        document.getElementById('wishlistPreview').click();if(!document.getElementById('wishlistSummary').textContent.includes('Khớp'))throw Error('Wishlist preview failed');
        document.getElementById('wishlistSave').click();document.getElementById('wishlistApply').click();if(!S.extensions.lootWishlist||!S.lootF.rules.length)throw Error('Wishlist apply failed');
        closeModal(true);setFeatureFlags({});renderSkill();if(document.getElementById('lootCodexOpen'))throw Error('Codex flag off failed');return {sources:true,wishlist:true,modeRarity:true};
      })()`);
      result.lootCodex=codexCheck;
      const guideCheck=await evaluate(`(() => {
        setFeatureFlags({context_guide:true,loot_codex:true,build_advice:true,training_lab:true});renderSkill();
        const panel=document.querySelector('#t-skill .context-guide');panel.open=true;
        const action={ctc:'build',phlt:'gear',g2:'train'}[S.mode];
        panel.querySelector('[data-guide-open="'+action+'"]').click();
        if(S.mode==='g2'){if(!document.getElementById('trainingPanel').open)throw Error('Guide training route failed');}
        else if(!document.getElementById('mBody').textContent.includes(S.mode==='ctc'?'Gợi ý':'Wishlist'))throw Error('Guide modal route failed');
        closeModal(true);renderSkill();document.querySelector('#t-skill [data-guide-done="skills"]').click();
        if(contextGuide().some(h=>h.id==='skills'))throw Error('Guide completion failed');
        setFeatureFlags({});renderSkill();if(document.querySelector('#t-skill .context-guide'))throw Error('Guide flag off failed');return {route:true,completion:true,flagOff:true};
      })()`);
      result.contextGuide=guideCheck;
      const feedbackCheck=await evaluate(`(async () => {
        localStorage.removeItem('jxidle_fb_draft');setFeatureFlags({feedback_diagnostics:true});fbModal();
        if(document.getElementById('fbCtx').checked||document.getElementById('fbDiagnostic').checked)throw Error('Feedback consent preselected');
        document.getElementById('fbText').value='Lỗi kỹ năng token=secret foo@example.com';document.getElementById('fbText').dispatchEvent(new Event('input'));
        const original=window.fetch,sent=[];window.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));throw Error('offline test')};
        try{
          await document.getElementById('fbSend').onclick();if(sent.length!==1||sent[0].diagnostics||sent[0].ctx)throw Error('Feedback sent context without consent');
          if(document.getElementById('fbErr').hidden||document.getElementById('fbSend').disabled)throw Error('Feedback offline retry UI failed');
          document.getElementById('fbCtx').checked=true;document.getElementById('fbDiagnostic').checked=true;document.getElementById('fbDiagnostic').onchange();
          if(document.getElementById('fbDiagnosticPreview').hidden)throw Error('Diagnostic preview hidden');
          await document.getElementById('fbSend').onclick();if(sent.length!==2||!sent[1].diagnosticConsent||!sent[1].diagnostics)throw Error('Explicit retry/consent failed');
          if(JSON.stringify(sent).includes('secret')||JSON.stringify(sent).includes('foo@example.com'))throw Error('Feedback redaction failed');
        }finally{window.fetch=original;closeModal(true);setFeatureFlags({});localStorage.removeItem('jxidle_fb_draft');}
        return {optIn:true,preview:true,offline:true,explicitRetry:true,redacted:true};
      })()`);
      result.feedbackDiagnostics=feedbackCheck;
      const phaseCheck=await evaluate(`(() => {
        setFeatureFlags({phased_boss:true,combat_reports:true});
        if(S.mode!=='ctc'){if(phaseBossAllowed())throw Error('Phased boss escaped mode');return {denied:true};}
        if(window.jxClosePanel)jxClosePanel();R.phaseBossCurrent=null;R.town=null;R.tower=null;R.tk=null;S.siege=null;SV.on=false;R.deadT=0;
        const boss=makeEnemy(zoneOf(S.stage).boss,S.lvl,'boss',H.x+40,H.y);boss.max=boss.hp=1000;R.enemies=[boss];
        if(!phaseBossAttach(boss))throw Error('Boss attach failed');boss.hp=600;phaseBossTick(.05);boss.phaseBoss.next=0;phaseBossTick(.05);phaseBossHudRefresh();
        const hud=document.getElementById('phaseBossHud');if(!hud||!hud.textContent.includes('nguy hiểm'))throw Error('Boss telegraph text missing');
        const rect=hud.getBoundingClientRect();if(rect.width<=0||rect.width>window.innerWidth)throw Error('Boss HUD mobile layout failed');
        let rings=0;const arc=CX.arc;CX.arc=function(x,y,r,...rest){if(r===PHASE_BOSS_RULES.radius)rings++;return arc.call(this,x,y,r,...rest);};
        try{draw(0);}finally{CX.arc=arc;}if(!rings)throw Error('Danger circle was not drawn');
        document.getElementById('phaseBossAbort').click();if(R.phaseBossResult.outcome!=='aborted'||R.enemies.length)throw Error('Boss abort failed');
        jrModal();document.getElementById('phaseBossReport').click();if(!document.getElementById('mBody').textContent.includes('CC quan sát'))throw Error('Boss contribution report missing');
        closeModal(true);setFeatureFlags({});return {mobileHud:true,warningCircle:true,abort:true,contribution:true};
      })()`);
      result.phasedBoss=phaseCheck;
      const guildCheck=await evaluate(`(async () => {
        setFeatureFlags({guild_management:true});if(S.mode!=='ctc'){if(featureEnabled('guild_management'))throw Error('Guild management escaped mode');return {denied:true};}
        const api=onlApi,account=onlGet(),oldMe=ONL.me,calls=[];
        const data={guild:{id:'local-guild',name:'Test Guild',role:'owner',level:1,xp:0,boss_hp:100,boss_max_hp:100,contrib:0,attack_count:0},members:[{account_id:'local-owner',name:'Owner',role:'owner',power:100,weekly_damage:0},{account_id:'local-member',name:'Member',role:'member',power:100,weekly_damage:0}],logs:[],calendar:[{id:'local-event',title:'<script>literal title</script>',activity:'siege',starts_at:Date.now()+3600000}]};
        onlSet({id:'local-owner',name:'Owner',token:'local-browser-test-token-12345'});
        ONL.me={id:'local-owner',name:'Owner',char:{power:100}};
        onlApi=async(path,opt={})=>{if(path.startsWith('/config'))return {feature_flags:{guild_management:true}};if(path==='/guild'){if(opt.body){calls.push(opt.body);if(opt.body.action==='promote')data.members[1].role='officer';}return data;}if(path==='/me')return {id:'local-owner',name:'Owner',char:{power:100}};if(path==='/room')return {room:null};return {rows:[]};};
        try{
          document.querySelector('#tabs [data-t="more"]').click();renderMore();await onlRenderGuild();
          const box=document.getElementById('onlGuildPanel');if(box.querySelector('script'))throw Error('Calendar title was interpreted as HTML');
          const promote=box.querySelector('[data-gm-action="promote"]');if(!promote)throw Error('Owner controls missing');const rect=promote.getBoundingClientRect();if(rect.height<44)throw Error('Guild touch target too small');
          await promote.onclick();if(calls[0].action!=='promote'||calls[0].target_id!=='local-member'||!calls[0].request_id)throw Error('Guild management payload wrong');
          box.querySelector('details').open=true;document.getElementById('gmEventTitle').value='Hẹn đánh boss';document.getElementById('gmEventTime').value='2026-10-09T12:00';await document.getElementById('gmEventSave').onclick();
          const scheduled=calls.find(c=>c.action==='schedule');if(scheduled.starts_at!==Date.parse('2026-10-09T05:00:00Z'))throw Error('Vietnam calendar timezone wrong');
          if(box.scrollWidth>box.clientWidth+2)throw Error('Guild controls overflow');
          data.guild.role='member';await onlRenderGuild();if(document.getElementById('onlGuildPanel').querySelector('[data-gm-action="promote"]')||document.getElementById('onlGuildPanel').querySelector('#gmEventSave'))throw Error('Member received manager UI');
        }finally{onlApi=api;onlSet(account);ONL.me=oldMe;setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();}
        return {roles:true,calendar:true,timezone:true,escaped:true,touch:true};
      })()`);
      result.guildManagement=guildCheck;
      result.duelModes=await evaluate(`(async()=>{
        setFeatureFlags({duel_modes:true});
        if(S.mode!=='ctc'){if(featureEnabled('duel_modes'))throw Error('Duel mode escaped');setFeatureFlags({});return {denied:true};}
        const api=onlApi,account=onlGet(),oldMe=ONL.me,calls=[];
        const data={season:'1',season_start:604800000,season_end:1209600000,pair_daily_cap:3,ranked_ready:true,score:{points:2,wins:0,losses:0,draws:1},matches:[{name:'Other',lvl:60,power:100}],
          duels:[{id:'local-duel',kind:'friendly',direction:'outgoing',opponent:'<script>bad</script>',status:'resolved',winner:null,challenger_power:100,defender_power:100,challenger_score:100,defender_score:100,rules_version:'power-v2',combat_version:'jx-combat-v2',explanation:{challenger_factor:1,defender_factor:1}}]};
        onlSet({token:'local-test-token',name:'Owner',cid:S.cid});ONL.me={id:'local-owner',name:'Owner',char:{power:100}};
        onlApi=async(path,opt={})=>{if(path.startsWith('/config'))return {feature_flags:{duel_modes:true}};if(path==='/duels')return data;if(path==='/duel'){calls.push(opt.body);return {ok:true};}if(path==='/me')return ONL.me;if(path==='/guild')return {guild:null,suggestions:[]};if(path==='/room')return {room:null};return {rows:[]};};
        try{
          document.querySelector('#tabs [data-t="more"]').click();renderMore();await onlRenderDuels();
          const box=document.getElementById('onlDuelList');
          if(!box.textContent.includes('Ước lượng')||!box.textContent.includes('Giao hữu')||!box.textContent.includes('hòa 1')||box.querySelector('script'))throw Error('Duel explanation/privacy absent');
          const match=box.querySelector('[data-match]');if(match.getBoundingClientRect().height<44)throw Error('Duel touch target too small');match.click();
          document.getElementById('onlDuelKind').value='friendly';await onlChallenge();
          if(calls[0].kind!=='friendly'||calls[0].opponent!=='Other')throw Error('Friendly selection payload wrong');
          if(box.scrollWidth>box.clientWidth+2)throw Error('Duel panel overflow');
        }finally{onlApi=api;onlSet(account);ONL.me=oldMe;setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();}
        return {friendly:true,matching:true,history:true,tie:true,touch:true,escaped:true};
      })()`);
      result.partyLobby=await evaluate(`(async()=>{
        setFeatureFlags({party_lobby:true});
        if(S.mode!=='ctc'){if(featureEnabled('party_lobby'))throw Error('Lobby escaped mode');setFeatureFlags({});return {denied:true};}
        const api=onlApi,account=onlGet(),oldMe=ONL.me,oldRoom=ONL.room,calls=[];
        let lobby={id:'local-room',owner_id:'local-owner',objective:'boss',lobby_only:true,all_ready:false,members:[{account_id:'local-owner',name:'Owner',online:true,ready:false,role:'damage',power:100},{account_id:'local-other',name:'<script>bad</script>',online:false,ready:false,role:'control',power:90}]};
        const people={friends:[{account_id:'local-other',name:'Other',status:'accepted',online:false}],invites:[{id:'local-invite',room_id:'another-room',sender:'Other',expires_at:Date.now()+10000}]};
        onlSet({token:'local-test-token',name:'Owner',cid:S.cid});ONL.me={id:'local-owner',name:'Owner',char:{power:100}};
        onlApi=async(path,opt={})=>{if(path.startsWith('/config'))return {feature_flags:{party_lobby:true}};if(path==='/room'){if(opt.body){calls.push(opt.body);if(opt.body.action==='ready')lobby.members[0].ready=opt.body.ready;if(opt.body.action==='role')lobby.members[0].role=opt.body.role;}return {room:lobby};}if(path==='/friends'){if(opt.body)calls.push(opt.body);return people;}if(path==='/me')return ONL.me;if(path==='/guild')return {guild:null,suggestions:[]};if(path==='/duels')return {duels:[],score:{}};return {rows:[]};};
        try{
          document.querySelector('#tabs [data-t="more"]').click();renderMore();await onlRenderRoom(true);
          const box=()=>document.getElementById('onlRoomPanel');
          if(!box().textContent.includes('Mất kết nối')||!box().textContent.includes('không bắt đầu combat')||box().querySelector('script'))throw Error('Lobby status/escaping missing');
          const ready=box().querySelector('[data-lobby="ready"]');if(ready.getBoundingClientRect().height<44)throw Error('Lobby touch too small');await ready.onclick();
          if(!calls.some(c=>c.action==='ready'&&c.ready===true))throw Error('Ready payload wrong');
          box().querySelector('#lobbyRole').value='support';await box().querySelector('[data-lobby="role"]').onclick();
          if(!calls.some(c=>c.action==='role'&&c.role==='support'))throw Error('Role payload wrong');
          const details=box().querySelector('.lobby-friends');details.open=true;
          const field=box().querySelector('#lobbyFriendName');field.value='Player';
          for(let el=field.parentElement;el;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;
          field.scrollIntoView({block:'center'});field.focus();
          const focused=document.activeElement?.id,wasConnected=field.isConnected;
          await onlRenderRoom();if(!field.isConnected||field.value!=='Player')throw Error('Polling replaced active input: '+focused+'/'+wasConnected+'/'+document.activeElement?.id);
          await box().querySelector('[data-friend="request"]').onclick();if(!calls.some(c=>c.action==='request'&&c.name==='Player'))throw Error('Friend payload wrong');
          if(box().scrollWidth>box().clientWidth+2)throw Error('Lobby overflow');
          lobby.owner_id='local-other';await onlRenderRoom(true);if(box().querySelector('#lobbyObjective')||box().querySelector('[data-lobby="kick"]'))throw Error('Member manager controls exposed');
        }finally{onlApi=api;onlSet(account);ONL.me=oldMe;ONL.room=oldRoom;setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();}
        return {roles:true,ready:true,offline:true,friends:true,pollInput:true,touch:true,escaped:true};
      })()`);
      result.expedition=await evaluate(`(()=>{
        setFeatureFlags({expedition:true,combat_reports:true});renderMore();
        if(S.mode!=='phlt'){if(document.getElementById('expeditionOpen'))throw Error('Expedition escaped mode');setFeatureFlags({});return {denied:true};}
        const before=JSON.stringify([S.eq,S.inv,S.mats,S.gold,S.xp,S.stage,S.wave,S.cid]);
        document.querySelector('#tabs [data-t="more"]').click();document.getElementById('expeditionOpen').click();document.getElementById('expPrepare').click();
        if(expeditionState()?.phase!=='prepare'||!document.getElementById('expDepart'))throw Error('Preparation UI missing');
        document.getElementById('expDepart').click();
        if(expeditionState().phase!=='segment'||R.enemies.length!==3)throw Error('Segment did not start');
        const stocks=JSON.stringify(S.potStock),gold=S.gold;drinkNow('life');goTown();
        if(JSON.stringify(S.potStock)!==stocks||S.gold!==gold||R.town)throw Error('World pot/town escaped expedition guard');
        const elapsed=expeditionState().elapsed;tick(.1);if(expeditionState().elapsed!==elapsed)throw Error('Manage modal did not pause encounter');
        document.getElementById('expBack').click();draw(.01);
        const hud=document.getElementById('expeditionHud');if(!hud||hud.querySelector('summary').getBoundingClientRect().height<44)throw Error('Expedition HUD/touch missing');
        for(const enemy of R.enemies)enemy.hp=0;killCheck();draw(.01);
        if(expeditionState().phase!=='rest')throw Error('Rest did not follow clear');
        hud.open=true;document.getElementById('expeditionManage').click();document.getElementById('expWithdraw').click();
        if(expeditionState().outcome!=='withdrawn')throw Error('Withdraw UI failed');
        if(JSON.stringify([S.eq,S.inv,S.mats,S.gold,S.xp,S.stage,S.wave,S.cid])!==before)throw Error('Expedition mutated persistent assets');
        closeModal(true);setFeatureFlags({});draw(.01);if(document.getElementById('expeditionHud'))throw Error('Expedition HUD survived exit');
        if(window.jxClosePanel)jxClosePanel();return {prepare:true,segment:true,paused:true,rest:true,withdraw:true,assets:true,touch:true};
      })()`);
      result.expeditionTravel=await evaluate(`(()=>{
        setFeatureFlags({expedition:true,expedition_travel:true,combat_reports:true});renderMore();
        if(S.mode!=='phlt'){if(featureEnabled('expedition_travel'))throw Error('Travel escaped mode');setFeatureFlags({});return {denied:true};}
        S.gold=1000000;const gold=S.gold,assets=JSON.stringify([S.eq,S.mats,S.cid,S.stage,S.wave]),oldInventory=JSON.stringify(S.inv),oldCount=S.inv.length;
        expeditionModal();if(!document.getElementById('mBody').textContent.includes('Phí chuẩn bị'))throw Error('Missing fee preview');
        document.getElementById('expPrepare').click();const fee=expeditionState().travel.cost;if(S.gold!==gold-fee)throw Error('Fee charged incorrectly');
        document.getElementById('expDepart').click();R.life=1;document.getElementById('expLife').click();
        if(expeditionState().supplies.life!==1||R.life<=1)throw Error('Session medicine failed');
        for(const e of R.enemies)e.hp=0;killCheck();expeditionModal();document.getElementById('expRest').click();
        if(expeditionState().travel.rested.length!==1)throw Error('Rest UI failed');
        document.getElementById('expDepart').click();document.getElementById('expWithdraw').click();
        if(expeditionState().phase!=='retreat')throw Error('Retreat did not begin');
        document.getElementById('expBack').click();
        const state=expeditionState();state.travel.hazard={x:H.x,y:H.y,r:72,kind:'fire',warnUntil:state.elapsed+1.5,until:state.elapsed+5,fired:false};
        let circles=0;const arc=CX.arc;CX.arc=function(){circles++;return arc.apply(this,arguments);};try{draw(.01);}finally{CX.arc=arc;}
        if(circles<2)throw Error('Escape/hazard circles missing');
        R.enemies=[];state.travel.pursuitAt=null;H.x=state.travel.escape.x;H.y=state.travel.escape.y;
        const ctrl=S.ctrl;S.ctrl='manual';try{for(let i=0;i<61&&expeditionActive();i++)tick(.05);}finally{S.ctrl=ctrl;}
        if(expeditionState().outcome!=='withdrawn'||S.gold!==gold-fee+Math.floor(fee*.5))throw Error('Safe exit payout wrong');
        if(JSON.stringify([S.eq,S.mats,S.cid,S.stage,S.wave])!==assets||JSON.stringify(S.inv.slice(0,oldCount))!==oldInventory||!S.inv.slice(oldCount).every(it=>modeItemOk(it,'phlt')))throw Error('Travel changed preexisting assets');
        closeModal(true);setFeatureFlags({});draw(.01);if(window.jxClosePanel)jxClosePanel();
        return {fee:true,medicine:true,rest:true,retreat:true,canvas:true,rewardOnce:true,assets:true};
      })()`);
      result.expeditionRoutes=await evaluate(`(()=>{
        setFeatureFlags({expedition:true,expedition_travel:true,expedition_routes:true,build_advice:true});
        if(S.mode!=='phlt'){if(featureEnabled('expedition_routes'))throw Error('Route escaped mode');return {denied:true};}
        S.gold=1000000;expeditionModal();
        const route=document.getElementById('expRoute'),contract=document.getElementById('expContract');
        if(!route||!contract.disabled)throw Error('Safe route default missing');
        route.value='salvage';route.onchange();contract.checked=true;contract.onchange();
        if(!document.getElementById('expRoutePreview').textContent.includes('1.4375'))throw Error('Contract enemy preview missing');
        const before=S.gold,preview=expeditionRoutePreview('salvage',true);document.getElementById('expPrepare').click();
        if(S.gold!==before-preview.cost||!expeditionState().travel.route.contract||document.getElementById('expRoute'))throw Error('Route not frozen at fee');
        document.getElementById('expDepart').click();for(const e of R.enemies)e.hp=0;killCheck();expeditionModal();document.getElementById('expWithdraw').click();
        if(S.gold!==before-preview.cost+preview.goldPerSegment||!expeditionState().travel.claimed)throw Error('Route reward mismatch');
        closeModal(true);setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();return {preview:true,contract:true,immutable:true,payout:true};
      })()`);
      result.expeditionKnowledge=await evaluate(`(()=>{
        setFeatureFlags({expedition:true,expedition_travel:true,expedition_routes:true,expedition_knowledge:true});
        if(S.mode!=='phlt'){if(expeditionKnowledgeView()!==null)throw Error('Knowledge escaped mode');return {denied:true};}
        S.gold=1000000;expeditionModal();
        if(!document.getElementById('expKnowledge'))throw Error('Knowledge UI missing');
        document.getElementById('expPrepare').click();
        for(let n=0;n<3;n++){document.getElementById('expDepart').click();for(const enemy of R.enemies)enemy.hp=0;killCheck();expeditionModal();}
        document.getElementById('expComplete').click();
        const panel=document.getElementById('expKnowledge');panel.open=true;
        if(!panel.textContent.includes('3/6')||!panel.textContent.includes('Tra cứu Hợp Tím')||!panel.textContent.includes('mang về'))throw Error('Knowledge progress/resource report missing');
        if(panel.querySelector('summary').getBoundingClientRect().height<44)throw Error('Knowledge summary touch target');
        closeModal(true);setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();return {checkpoint:true,recipeReference:true,resourceJournal:true,touch:true};
      })()`);
      result.workbench=await evaluate(`(()=>{
        setFeatureFlags({safe_workbench:true});renderMore();
        if(S.mode==='ctc'){if(document.getElementById('wbOpen'))throw Error('Workbench escaped CTC');setFeatureFlags({});return {denied:true};}
        S.gold=1000000;const inventory=S.inv;S.inv=[makeItem(3,0,2,2),makeItem(4,0,2,2),makeItem(9,0,2,2)];
        const gold=S.gold;document.getElementById('wbOpen').click();
        const checks=[...document.querySelectorAll('#wbItems input')];if(checks.length!==3)throw Error('Workbench owned pool missing');checks.forEach(x=>x.checked=true);
        document.getElementById('wbPreview').click();const confirm=document.getElementById('wbConfirm');
        if(!confirm||S.gold!==gold||S.inv.length!==3)throw Error('Preview changed resources');
        if(confirm.getBoundingClientRect().height<44)throw Error('Workbench confirm touch target');
        confirm.click();if(S.inv.length!==0||S.gold!==gold-fuseCost()||S.extensions.workbench.receipts.length!==1)throw Error('Workbench atomic recycle failed');
        const paid=S.gold;confirm.click();if(S.gold!==paid)throw Error('Repeated confirmation paid twice');
        closeModal(true);S.inv=inventory;setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();return {preview:true,ownedPool:true,atomic:true,receipt:true,touch:true};
      })()`);
      result.resourceSummary=await evaluate(`(()=>{
        setFeatureFlags({resource_summary:true});save();S.gold++;save();renderMore();document.getElementById('resourceSummaryOpen').click();
        const body=document.getElementById('mBody');if(!body.textContent.includes('biến động ròng')&&!body.textContent.includes('biến động ròng giữa'))throw Error('Resource summary explanation missing');
        if(!resourceSummary().entries.length||resourceSummary().catalog.cap!==MC().rarMax)throw Error('Resource net/cap missing');
        closeModal(true);setFeatureFlags({});if(window.jxClosePanel)jxClosePanel();return {net:true,modeCap:true};
      })()`);
      result.onlineEconomy=await evaluate(`(async()=>{
        setFeatureFlags({online_economy:true});if(S.mode!=='ctc'){if(featureEnabled('online_economy'))throw Error('Economy escaped mode');return {denied:true};}
        const account=onlGet(),api=onlApi,guild=ONL.guildId;onlSet({id:'economy-player',token:'local-browser-fixture-token'});ONL.guildId='fixture-guild';
        const d={balance:3,earned_today:3,donated_today:0,entries:[]},calls=[],used=new Set();let fail=true;
        onlApi=async(path,opt={})=>{if(path!=='/economy')throw Error('Unexpected API');if(opt.body){calls.push(opt.body);if(opt.body.action==='donate'){if(!used.has(opt.body.request_id)){used.add(opt.body.request_id);d.balance-=opt.body.amount;d.donated_today+=opt.body.amount;}if(fail){fail=false;throw {msg:'Offline acknowledgement'};}}}return d;};
        try{
          await onlEconomyModal();document.getElementById('econDonate').click();await new Promise(r=>setTimeout(r,20));
          if(!document.getElementById('econStatus').textContent.includes('Offline'))throw Error('Retry status missing');
          document.getElementById('econDonate').click();await new Promise(r=>setTimeout(r,20));
          if(calls.length!==2||calls[0].request_id!==calls[1].request_id||d.balance!==2)throw Error('Donation retry nonce changed');
          if(document.getElementById('econDonate').getBoundingClientRect().height<44)throw Error('Economy touch target');
          return {wallet:true,nonceRetry:true,touch:true};
        }finally{closeModal(true);onlApi=api;onlSet(account);ONL.guildId=guild;setFeatureFlags({});ECONOMY_REQUEST=null;}
      })()`);
      result.rift=await evaluate(`(()=>{
        setFeatureFlags({skill_mutators:true,training_lab:true});document.querySelector('#tabs [data-t="more"]').click();renderMore();
        if(S.mode!=='g2'){if(document.getElementById('riftOpen'))throw Error('Rift escaped mode');setFeatureFlags({});return {denied:true};}
        const assets=JSON.stringify([S.sk,S.eq,S.inv,S.gold,S.xp,S.stage,S.wave]),skills=JSON.stringify(SK);
        document.getElementById('riftOpen').click();document.querySelector('[data-rift="start"]').click();
        if(document.querySelectorAll('[data-rift="choose"]').length!==3)throw Error('Rift choices missing');
        const button=document.querySelector('[data-rift="choose"]');if(button.getBoundingClientRect().height<44)throw Error('Rift touch target: '+button.getBoundingClientRect().height+' min:'+getComputedStyle(button).minHeight);button.click();
        if(riftState().phase!=='combat'||!R.riftRun)throw Error('Rift did not start native combat');
        document.querySelector('[data-rift="pause"]').click();const elapsed=R.riftRun.time;tick(.05);if(R.riftRun.time!==elapsed)throw Error('Rift pause failed');
        document.querySelector('[data-rift="pause"]').click();tick(.05);if(R.riftRun.time<=elapsed)throw Error('Rift resume failed');
        document.querySelector('[data-rift="exit"]').click();if(riftState().outcome!=='withdrawn'||R.riftRun)throw Error('Rift exit failed');
        if(JSON.stringify([S.sk,S.eq,S.inv,S.gold,S.xp,S.stage,S.wave])!==assets||JSON.stringify(SK)!==skills)throw Error('Rift mutated assets');
        closeModal(true);setFeatureFlags({});renderMore();if(document.getElementById('riftOpen'))throw Error('Rift flag-off UI survived');return {choices:true,nativeCombat:true,pause:true,resume:true,exit:true,assets:true,touch:true};
      })()`);
      result.buildProgression=await evaluate(`(()=>{
        setFeatureFlags({build_progression:true,skill_mutators:true,training_lab:true,build_library:true});renderMore();
        if(S.mode!=='g2'){if(document.getElementById('buildProgressionOpen'))throw Error('Build progression escaped mode');setFeatureFlags({});return {denied:true};}
        const assets=JSON.stringify([S.attr,S.sk,S.eq,S.inv,S.gold,S.xp]);
        document.getElementById('buildProgressionOpen').click();if(!document.getElementById('mBody').textContent.includes('9thành tựu hữu hạn'))throw Error('Build progression rules missing');
        for(const b of document.querySelectorAll('[data-build-ach]'))if(b.getBoundingClientRect().height<44)throw Error('Build progression touch target: '+b.getBoundingClientRect().height);
        const claims=JSON.stringify(buildProgressionState().claims);document.querySelector('[data-build-route="training"]').click();
        if(!document.getElementById('trainingPanel').open)throw Error('Build progress guide training route failed');
        if(JSON.stringify([S.attr,S.sk,S.eq,S.inv,S.gold,S.xp])!==assets||JSON.stringify(buildProgressionState().claims)!==claims)throw Error('Guide granted reward');
        setFeatureFlags({});renderMore();if(document.getElementById('buildProgressionOpen'))throw Error('Build progress flag off failed');return {finiteRules:true,touch:true,guide:true,noReward:true,flagOff:true};
      })()`);
      const labCheck=await evaluate(`(() => {
        setFeatureFlags({training_lab:true});renderSkill();
        if(S.mode!=='g2') {if(document.getElementById('trainingPanel'))throw Error('Lab escaped mode guard');return {denied:true};}
        const panel=document.getElementById('trainingPanel');if(!panel)throw Error('Missing training panel');panel.open=true;
        document.getElementById('trainingDuration').value=2;document.getElementById('trainingStart').click();
        document.getElementById('trainingPause').click();
        const before=trainingReport(TRAINING_SESSION).elapsed;trainingAdvance(TRAINING_SESSION,1);
        if(!TRAINING_SESSION.paused||trainingReport(TRAINING_SESSION).elapsed!==before)throw Error('Training pause failed');
        document.getElementById('trainingPause').click();trainingAdvance(TRAINING_SESSION,2);trainingRefreshResult();
        const original=JSON.stringify(trainingReport(TRAINING_SESSION));
        if(TRAINING_SESSION.status!=='completed'||!document.getElementById('trainingResult').textContent.includes('DPS hữu ích'))throw Error('Training result missing');
        S.sk[10]=1;recalc();document.getElementById('trainingRetry').click();trainingAdvance(TRAINING_SESSION,2);trainingRefreshResult();
        if(JSON.stringify(trainingReport(TRAINING_SESSION))!==original)throw Error('Retry did not preserve captured build');
        if(panel.scrollWidth>panel.clientWidth+2)throw Error('Training panel overflows');
        trainingStopTimer();setFeatureFlags({training_lab:true,build_profiles:true});
        document.getElementById('compareA').value=-1;document.getElementById('compareB').value=0;
        const live=JSON.stringify(S);document.getElementById('compareStart').click();
        const comparison=document.getElementById('compareResult');
        if(!comparison.textContent.includes('B − A')||!comparison.textContent.includes('Seed 42'))throw Error('Missing A/B conditions/result');
        if(JSON.stringify(S)!==live)throw Error('Comparison applied a build');
        document.getElementById('compareB').value=2;document.getElementById('compareStart').click();
        if(!comparison.textContent.includes('trống'))throw Error('Missing empty-build feedback');
        setFeatureFlags({});renderSkill();if(document.getElementById('trainingPanel'))throw Error('Training flag off failed');
        return {start:true,pause:true,retry:true,comparison:true,emptyBuild:true,flagOff:true};
      })()`);
      result.trainingLab=labCheck;
      const reportsCheck=await evaluate(`(() => {
        setFeatureFlags({combat_reports:true});R.combatTrace=null;
        combatRecord('damage',{sourceId:'npc_1',targetId:'player',raw:100,capacity:1,reason:'hit_fatal'});
        combatRecord('death',{targetId:'player'});combatFinish('defeated');
        jrModal();document.getElementById('combatReportsOpen').click();
        const body=document.getElementById('mBody'),label={ctc:'CTC ·',phlt:'PHLT ·',g2:'2.0 ·'}[S.mode];
        if(!body.textContent.includes(label))throw Error('Missing mode-specific report');
        body.querySelector('details').open=true;
        body.querySelector('[data-report-timeline="0"]').checked=true;body.querySelector('[data-report-export="0"]').click();
        const text=document.getElementById('mBody').querySelector('textarea').value,payload=JSON.parse(text);
        if(!payload.events?.length||'character' in payload||'name' in payload||'stats' in payload)throw Error('Diagnostic privacy/options failed');
        if(payload.deathReason?.sourceId!=='npc_1')throw Error('Missing lethal source');
        closeModal(true);setFeatureFlags({});return {modeSummary:true,journalEntry:true,selectedExport:true};
      })()`);
      result.combatReports=reportsCheck;
      const longSession=await evaluate(`(() => {
        closeModal(true);S=Object.assign(newSave(),{fac:'shaolin',mode:'${mode}',lvl:100,sexSet:1});
        R.tower=null;R.tk=null;R.logs=[];SV.on=false;R.dirty=true;recalc();
        const heap0=performance.memory?.usedJSHeapSize||0,started=performance.now();simulate(300,.25);const elapsed=performance.now()-started,heap1=performance.memory?.usedJSHeapSize||0;
        if(elapsed>15000)throw Error('20-minute simulated session too slow: '+Math.round(elapsed)+'ms '+S.mode+'/'+${width}+'x'+${height});
        if(R.logs.length>40)throw Error('Long session log is unbounded');
        return {elapsedMs:Math.round(elapsed),heapDelta:heap0&&heap1?heap1-heap0:null,logs:R.logs.length};
      })()`);
      result.longSession=longSession;
    }
  }
  console.log(JSON.stringify({ browser: "Chromium", results }, null, 2));
} finally {
  ws.close();
  await fetch(`${debuggerOrigin}/json/close/${page.id}`).catch(() => {});
}
