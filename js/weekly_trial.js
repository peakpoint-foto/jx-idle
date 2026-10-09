"use strict";
// P06 client: the server simulates every run and owns the board. This panel only starts a run and shows what the server recorded.
// Mô tả luật đọc từ content JSON (data-driven); text khớp bản hardcode cũ từng chữ.
const TRIAL_RULE_TEXT=Object.fromEntries(SESSION_TRIAL.rules.map(r=>[r.id,`${r.name}: ${r.desc}`]));
const TRIAL_ERRORS={trial_attempts_used:"Hết lượt thử hôm nay.",trial_solo_only:"Rời phòng nhóm trước: thử thách chỉ chạy một mình.",trial_locked:"Cần đồng bộ nhân vật hợp lệ gần đây.",feature_disabled:"Thử thách tuần chưa mở.",session_not_ready:"Phòng chưa sẵn sàng, thử lại."};
const TRIAL_CLIENT={data:null,busy:false,error:"",loadedAt:0,identity:null,generation:0};
function trialIdentity(){const a=onlGet();return a?.token&&S?.mode==="phlt"&&!ADMV.sandbox&&featureEnabled("weekly_trial")?[a.token,S.cid||"",S.mode].join(":"):null;}
// The server publishes UTC milliseconds; players read Vietnam time (UTC+7).
function trialTime(ms){const d=new Date(ms+7*3600e3),p=n=>String(n).padStart(2,"0");return p(d.getUTCDate())+"/"+p(d.getUTCMonth()+1)+" "+p(d.getUTCHours())+":"+p(d.getUTCMinutes())+" giờ VN";}
function trialScoreText(score,waves){const depth=Math.floor(score+1e-9),frac=Math.round((score-depth)*100);return depth>=waves?"hoàn thành "+waves+" chặng":"chặng "+depth+(frac?" (+"+frac+"%)":"");}
function trialBoardHTML(rows,waves){return rows&&rows.length?rows.map(r=>`<div class="qrow"><span>${r.me?"<b>":""}#${r.placement} ${esc(r.name)}${r.me?"</b>":""}<small>${esc(trialScoreText(r.score,waves))}</small></span></div>`).join(""):"<p>Chưa có kết quả.</p>";}
function trialPanelHTML(){
  const d=TRIAL_CLIENT.data,error=TRIAL_CLIENT.error?`<p class="bad" role="status">${esc(TRIAL_CLIENT.error)}</p>`:"";
  if(!d)return `<h4>Thử thách tuần PHLT</h4><p>${TRIAL_CLIENT.busy?"Đang tải…":"Chưa tải được thử thách."}</p>${error}<button class="btn" data-trial="refresh" ${TRIAL_CLIENT.busy?"disabled":""}>Tải lại</button>`;
  const L=d.rules.lengths,live=PARTY_CLIENT?.session?.status==="active",off=TRIAL_CLIENT.busy||live||d.attempts.left<=0?"disabled":"";
  const mine=len=>{const m=d.boards[len].mine;return m?`Tốt nhất của bạn: ${esc(trialScoreText(m.score,L[len]))}, hạng ${m.placement}`:"Bạn chưa có kết quả.";};
  const mut=d.week.mutator?` Biến thể tuần: <b>${esc(d.week.mutator.name)}</b> — ${esc(d.week.mutator.desc)}.`:"";
  return `<h4>Thử thách tuần PHLT</h4><small>Tuần ${d.week.id}: ${esc(trialTime(d.week.start))} → ${esc(trialTime(d.week.end))}. Luật tuần: ${esc(TRIAL_RULE_TEXT[d.week.rule]||d.week.rule)}.${mut}</small>
    <p>Mọi người đối đầu cùng chuỗi chủ tướng (HP cố định, không co theo sức bạn). Máy chủ chạy thật tối đa 120 giây, bạn chỉ điều khiển Phòng thủ và Hồi phục; kết quả tốt nhất mỗi chuyến được ghi vào bảng tuần. Không có thưởng. Còn ${d.attempts.left}/${d.rules.attempts_per_day} lượt hôm nay (ngày UTC).</p>
    <div class="btnrow"><button class="btn" data-trial="short" ${off}>Chạy ngắn (${L.short} chặng)</button><button class="btn" data-trial="long" ${off}>Chạy dài (${L.long} chặng)</button></div>
    <details open><summary>Bảng chuyến ngắn · ${esc(mine("short"))}</summary>${trialBoardHTML(d.boards.short.rows,L.short)}</details>
    <details><summary>Bảng chuyến dài · ${esc(mine("long"))}</summary>${trialBoardHTML(d.boards.long.rows,L.long)}</details>
    ${error}<button class="btn" data-trial="refresh" ${TRIAL_CLIENT.busy?"disabled":""}>Cập nhật</button>`;
}
function trialRender(){
  let box=document.getElementById("trialPanel");
  if(!trialIdentity()){if(box)box.remove();return;}
  const host=document.getElementById("t-more");if(!host)return;
  if(!box){box=document.createElement("section");box.id="trialPanel";box.className="card trial-panel";host.append(box);}
  const open=[...box.querySelectorAll("details")].map(x=>x.open);box.innerHTML=trialPanelHTML();box.querySelectorAll("details").forEach((x,i)=>{if(open[i]!==undefined)x.open=open[i];});
  box.querySelectorAll("[data-trial]").forEach(b=>{b.onclick=()=>b.dataset.trial==="refresh"?trialLoad(true):trialStart(b.dataset.trial);});
}
async function trialLoad(force=false){
  const identity=trialIdentity();
  if(!identity){TRIAL_CLIENT.data=null;return;}
  if(TRIAL_CLIENT.identity!==identity){TRIAL_CLIENT.identity=identity;TRIAL_CLIENT.data=null;TRIAL_CLIENT.error="";TRIAL_CLIENT.generation++;}
  if(TRIAL_CLIENT.busy||(!force&&TRIAL_CLIENT.data&&Date.now()-TRIAL_CLIENT.loadedAt<30000))return;
  const generation=++TRIAL_CLIENT.generation;TRIAL_CLIENT.busy=true;trialRender();
  try{const d=await onlApi("/trial");if(identity===trialIdentity()&&generation===TRIAL_CLIENT.generation){TRIAL_CLIENT.data=d;TRIAL_CLIENT.loadedAt=Date.now();TRIAL_CLIENT.error="";if(d&&d.rules&&contentVersionMismatch(SESSION_TRIAL.version,d.rules.version))contentReloadBanner("Thử thách tuần");}}
  catch(e){if(identity===trialIdentity()&&generation===TRIAL_CLIENT.generation)TRIAL_CLIENT.error=TRIAL_ERRORS[e.error||e.code]||e.msg||e.message||"Mất kết nối; thử lại sau";}
  finally{if(generation===TRIAL_CLIENT.generation){TRIAL_CLIENT.busy=false;trialRender();}}
}
// A run needs a private one-person room: reuse an empty one, create one if there is none, and refuse a group room.
async function trialStart(length){
  const identity=trialIdentity();if(!identity||TRIAL_CLIENT.busy||PARTY_CLIENT.busy||PARTY_CLIENT.session?.status==="active")return;
  if(length!=="short"&&length!=="long")return;
  const generation=++TRIAL_CLIENT.generation;TRIAL_CLIENT.busy=true;TRIAL_CLIENT.error="";trialRender();
  try{
    let r=await onlApi("/room");
    if(r.room&&r.room.members.length>1)throw {error:"trial_solo_only"};
    if(!r.room)r=await onlApi("/room",{body:{action:"create"}});
    await onlApi("/room",{body:{action:"ready",ready:true,room_id:r.room.id}});
  }catch(e){if(identity===trialIdentity())TRIAL_CLIENT.error=TRIAL_ERRORS[e.error||e.code]||e.msg||e.message||"Không chuẩn bị được phòng";TRIAL_CLIENT.busy=false;trialRender();return;}
  TRIAL_CLIENT.busy=false;
  await partyWrite("trialStart",length);
  if(PARTY_CLIENT.error)TRIAL_CLIENT.error=TRIAL_ERRORS[PARTY_CLIENT.errorCode]||PARTY_CLIENT.error;
  trialLoad(true);
}
{
  const original=renderMore;renderMore=function(){const r=original.apply(this,arguments);trialRender();trialLoad();return r;};
}
setInterval(()=>{if(trialIdentity()&&document.getElementById("trialPanel"))trialLoad(PARTY_CLIENT?.session&&PARTY_CLIENT.session.status!=="active"&&PARTY_CLIENT.session.activity==="trial"&&Date.now()-TRIAL_CLIENT.loadedAt>5000);},30000);
