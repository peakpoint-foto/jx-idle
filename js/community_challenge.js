"use strict";
// G04 client: a challenge is a build, not a save. The server rebuilds the fighter from the published build at a fixed level with reference
// gear and simulates every run; this panel only turns the current character into a valid build, lists challenges and shows server boards.
const CHALLENGE_ERRORS={challenge_attempts_used:"Hết lượt thử hôm nay.",challenge_publish_limit:"Hôm nay bạn đã đăng đủ thử thách.",challenge_open_limit:"Bạn đang có quá nhiều thử thách mở; gỡ bớt trước.",challenge_outdated:"Thử thách này thuộc phiên bản luật cũ.",challenge_not_found:"Không tìm thấy thử thách (có thể đã bị gỡ).",bad_challenge_code:"Mã thử thách không hợp lệ.",challenge_locked:"Cần đồng bộ nhân vật hợp lệ gần đây.",feature_disabled:"Thử thách cộng đồng chưa mở.",session_member_busy:"Bạn đang trong một phiên khác; kết thúc phiên đó trước."};
const CHALLENGE_CLIENT={data:null,detail:null,busy:false,error:"",loadedAt:0,identity:null,generation:0};
function challengeIdentity(){const a=onlGet();return a?.token&&S?.mode==="g2"&&!ADMV.sandbox&&featureEnabled("community_challenge")?[a.token,S.cid||"",S.mode].join(":"):null;}
// Fit the current character into a preset: attributes are scaled down to the budget, skills are filtered to the faction and level, main first.
function challengeSpecFromSave(save,presetId){
  const preset=CHALLENGE_PRESETS[presetId],budget=challengeBudgets(presetId);
  if(!preset||!budget||!save||!FAC[save.fac])return null;
  const raw=CHALLENGE_ATTR.map(k=>Math.max(0,Math.floor(+(save.attr||{})[k])||0)),total=raw.reduce((n,v)=>n+v,0),factor=total>budget.attr?budget.attr/total:1;
  const attr=Object.fromEntries(CHALLENGE_ATTR.map((k,i)=>[k,Math.min(CHALLENGE_LIMITS.attrEach,Math.floor(raw[i]*factor))]));
  const own=new Set(FAC[save.fac].skills.map(Number)),main=+save.main;
  const ids=Object.keys(save.sk||{}).map(Number).filter(id=>own.has(id)&&SK[id]&&(SK[id].req||1)<=preset.level&&(+save.sk[id]||0)>0)
    .sort((a,b)=>(b===main)-(a===main)||save.sk[b]-save.sk[a]||a-b).slice(0,CHALLENGE_LIMITS.skills);
  const sk={};let left=budget.skill;
  for(const id of ids){const lv=Math.min(Math.floor(+save.sk[id]),SK[id].max||20,left);if(lv<1)continue;sk[id]=lv;left-=lv;}
  const pickMain=Object.keys(sk).map(Number).includes(main)&&SK[main].kind!=="passive"?main:Object.keys(sk).map(Number).find(id=>SK[id].kind!=="passive");
  if(pickMain===undefined)return null;
  const checked=challengeSpecCheck({fac:save.fac,sex:save.sex===1?1:0,attr,sk,main:pickMain},presetId);
  return checked.ok?checked.spec:null;
}
function challengeLabel(c){const p=CHALLENGE_PRESETS[c.preset];return `${esc(p?p.label:c.preset)} · ${esc(FAC[c.spec.fac]?FAC[c.spec.fac].n:c.spec.fac)} · chiêu chính ${esc(SK[c.spec.main]?SK[c.spec.main].n:c.spec.main)}`;}
function challengeScoreText(score,waves){const depth=Math.floor(score+1e-9),frac=Math.round((score-depth)*100);return depth>=waves?"hoàn thành "+waves+" chặng":"chặng "+depth+(frac?" (+"+frac+"%)":"");}
function challengeRowHTML(c,mine){
  const live=PARTY_CLIENT?.session?.status==="active",off=CHALLENGE_CLIENT.busy||live||(CHALLENGE_CLIENT.data?.attempts.left<=0)||c.outdated?"disabled":"";
  return `<div class="qrow"><span><b>${esc(c.code)}</b> · ${challengeLabel(c)}<small>Tác giả ${esc(c.author)} · ${c.finishers} người đã chạy</small></span><span class="btnrow"><button class="btn" data-challenge="start" data-code="${esc(c.code)}" ${off}>Chạy</button><button class="btn" data-challenge="board" data-code="${esc(c.code)}">Bảng</button>${mine?`<button class="btn" data-challenge="retire" data-code="${esc(c.code)}">Gỡ</button>`:""}</span></div>`;
}
function challengePanelHTML(){
  const d=CHALLENGE_CLIENT.data,error=CHALLENGE_CLIENT.error?`<p class="bad" role="status">${esc(CHALLENGE_CLIENT.error)}</p>`:"";
  if(!d)return `<h4>Thử thách cộng đồng 2.0</h4><p>${CHALLENGE_CLIENT.busy?"Đang tải…":"Chưa tải được thử thách."}</p>${error}<button class="btn" data-challenge="refresh" ${CHALLENGE_CLIENT.busy?"disabled":""}>Tải lại</button>`;
  const off=CHALLENGE_CLIENT.busy?"disabled":"";
  const publish=d.presets.map(p=>{const spec=challengeSpecFromSave(S,p.id);return `<button class="btn" data-challenge="publish" data-preset="${esc(p.id)}" ${off||!spec?"disabled":""}>Đăng build của tôi · ${esc(p.label)}</button>`;}).join("");
  const det=CHALLENGE_CLIENT.detail,waves=det?CHALLENGE_PRESETS[det.challenge.preset]?.waves||6:6;
  return `<h4>Thử thách cộng đồng 2.0</h4>
    <p>Một thử thách là một build (phái, điểm tiềm năng, kỹ năng) ở cấp cố định với trang bị chuẩn của máy chủ: không dùng đồ hay cấp của bạn. Ai chạy cùng mã đều đối đầu đúng một chuỗi chủ tướng cố định; máy chủ mô phỏng thật và ghi kết quả tốt nhất. Không có thưởng. Còn ${d.attempts.left}/${d.rules.attempts_per_day} lượt hôm nay (ngày UTC).</p>
    <div class="btnrow">${publish}</div>
    <p><small>Build đăng được cắt cho vừa ngân sách của mốc cấp (điểm tiềm năng, điểm kỹ năng); nút xám nghĩa là build hiện tại không ghép được.</small></p>
    <div class="btnrow"><input id="challengeCode" type="text" maxlength="11" placeholder="CH-XXXXXXXX" aria-label="Mã thử thách" autocomplete="off"><button class="btn" data-challenge="byCode" ${off}>Chạy theo mã</button></div>
    <details open><summary>Của tôi (${d.mine.length})</summary>${d.mine.length?d.mine.map(c=>challengeRowHTML(c,true)).join(""):"<p>Bạn chưa đăng thử thách nào.</p>"}</details>
    <details><summary>Mới đăng (${d.recent.length})</summary>${d.recent.length?d.recent.map(c=>challengeRowHTML(c,false)).join(""):"<p>Chưa có thử thách nào.</p>"}</details>
    ${det?`<details open><summary>Bảng ${esc(det.challenge.code)}${det.board.mine?` · Tốt nhất của bạn: ${esc(challengeScoreText(det.board.mine.score,waves))}, hạng ${det.board.mine.placement}`:" · Bạn chưa có kết quả"}</summary>${det.board.rows.length?det.board.rows.map(r=>`<div class="qrow"><span>${r.me?"<b>":""}#${r.placement} ${esc(r.name)}${r.me?"</b>":""}<small>${esc(challengeScoreText(r.score,waves))}</small></span></div>`).join(""):"<p>Chưa có kết quả.</p>"}</details>`:""}
    ${error}<button class="btn" data-challenge="refresh" ${off}>Cập nhật</button>`;
}
function challengeRender(){
  let box=document.getElementById("challengePanel");
  if(!challengeIdentity()){if(box)box.remove();return;}
  const host=document.getElementById("t-more");if(!host)return;
  if(!box){box=document.createElement("section");box.id="challengePanel";box.className="card challenge-panel";host.append(box);}
  const keep=box.querySelector("#challengeCode")?.value||"",open=[...box.querySelectorAll("details")].map(x=>x.open);
  box.innerHTML=challengePanelHTML();box.querySelectorAll("details").forEach((x,i)=>{if(open[i]!==undefined)x.open=open[i];});
  const input=box.querySelector("#challengeCode");if(input)input.value=keep;
  box.querySelectorAll("[data-challenge]").forEach(b=>{b.onclick=()=>{
    const a=b.dataset.challenge,code=b.dataset.code||(a==="byCode"?String(input?.value||"").trim().toUpperCase():"");
    if(a==="refresh")return challengeLoad(true);
    if(a==="publish")return challengePublish(b.dataset.preset);
    if(a==="retire")return confirm("Gỡ thử thách này? Bảng kết quả vẫn được giữ.")?challengeRetire(code):undefined;
    if(a==="board")return challengeBoard(code);
    return challengeStart(code);
  };});
}
const challengeFail=(identity,e,fallback)=>{if(identity===challengeIdentity())CHALLENGE_CLIENT.error=CHALLENGE_ERRORS[e.error||e.code]||e.msg||e.message||fallback;};
async function challengeLoad(force=false){
  const identity=challengeIdentity();
  if(!identity){CHALLENGE_CLIENT.data=null;return;}
  if(CHALLENGE_CLIENT.identity!==identity){CHALLENGE_CLIENT.identity=identity;CHALLENGE_CLIENT.data=null;CHALLENGE_CLIENT.detail=null;CHALLENGE_CLIENT.error="";CHALLENGE_CLIENT.generation++;}
  if(CHALLENGE_CLIENT.busy||(!force&&CHALLENGE_CLIENT.data&&Date.now()-CHALLENGE_CLIENT.loadedAt<30000))return;
  const generation=++CHALLENGE_CLIENT.generation;CHALLENGE_CLIENT.busy=true;challengeRender();
  try{const d=await onlApi("/challenge");if(identity===challengeIdentity()&&generation===CHALLENGE_CLIENT.generation){CHALLENGE_CLIENT.data=d;CHALLENGE_CLIENT.loadedAt=Date.now();CHALLENGE_CLIENT.error="";}}
  catch(e){if(generation===CHALLENGE_CLIENT.generation)challengeFail(identity,e,"Mất kết nối; thử lại sau");}
  finally{if(generation===CHALLENGE_CLIENT.generation){CHALLENGE_CLIENT.busy=false;challengeRender();}}
}
async function challengeWrite(body,after){
  const identity=challengeIdentity();if(!identity||CHALLENGE_CLIENT.busy)return null;
  const generation=++CHALLENGE_CLIENT.generation;CHALLENGE_CLIENT.busy=true;CHALLENGE_CLIENT.error="";challengeRender();
  try{const d=await onlApi("/challenge",{body});if(identity!==challengeIdentity())return null;if(after)await after(d);return d;}
  catch(e){challengeFail(identity,e,"Chưa xác nhận; thử lại sau");return null;}
  finally{CHALLENGE_CLIENT.generation=Math.max(CHALLENGE_CLIENT.generation,generation);CHALLENGE_CLIENT.busy=false;challengeRender();}
}
async function challengePublish(presetId){
  const spec=challengeSpecFromSave(S,presetId);
  if(!spec){CHALLENGE_CLIENT.error="Build hiện tại không ghép được vào mốc này.";challengeRender();return;}
  const d=await challengeWrite({action:"publish",preset:presetId,spec});
  if(d){CHALLENGE_CLIENT.data={...CHALLENGE_CLIENT.data,...d};CHALLENGE_CLIENT.loadedAt=Date.now();toast("Đã đăng thử thách "+d.code);challengeRender();}
}
async function challengeRetire(code){
  const d=await challengeWrite({action:"retire",code});
  if(d){CHALLENGE_CLIENT.data={...CHALLENGE_CLIENT.data,...d};if(CHALLENGE_CLIENT.detail?.challenge.code===code)CHALLENGE_CLIENT.detail=null;challengeRender();}
}
async function challengeBoard(code){
  const identity=challengeIdentity();if(!identity||CHALLENGE_CLIENT.busy||!/^CH-[A-HJ-NP-Z2-9]{8}$/.test(code||""))return;
  CHALLENGE_CLIENT.busy=true;CHALLENGE_CLIENT.error="";challengeRender();
  try{const d=await onlApi("/challenge?code="+encodeURIComponent(code));if(identity===challengeIdentity())CHALLENGE_CLIENT.detail=d;}
  catch(e){challengeFail(identity,e,"Không tải được bảng");}
  finally{CHALLENGE_CLIENT.busy=false;challengeRender();}
}
// Starting is idempotent on the client id: a lost reply retried with the same id returns the same run.
async function challengeStart(code){
  if(!/^CH-[A-HJ-NP-Z2-9]{8}$/.test(code||"")){CHALLENGE_CLIENT.error=CHALLENGE_ERRORS.bad_challenge_code;challengeRender();return;}
  if(PARTY_CLIENT.busy||PARTY_CLIENT.session?.status==="active")return;
  const id=crypto.randomUUID().replaceAll("-","");
  const d=await challengeWrite({action:"start",code,id},async r=>{partyPointer(r.session_id);await partyPoll(true);});
  if(d){challengeBoard(code);challengeLoad(true);}
}
{
  const original=renderMore;renderMore=function(){const r=original.apply(this,arguments);challengeRender();challengeLoad();return r;};
}
setInterval(()=>{if(challengeIdentity()&&document.getElementById("challengePanel")){const finished=PARTY_CLIENT?.session&&PARTY_CLIENT.session.activity==="challenge"&&PARTY_CLIENT.session.status!=="active";challengeLoad(!!finished&&Date.now()-CHALLENGE_CLIENT.loadedAt>5000);}},30000);
