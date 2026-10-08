"use strict";
const WEEKLY_TASKS = Object.freeze({
  ctc: [
    {id:"hunt",event:"kills",need:500,label:"Đóng góp chiến trường",detail:"Hạ 500 quái trong tuần"},
    {id:"boss",event:"bosses",need:5,label:"Săn trùm",detail:"Hạ 5 trùm trong tuần"},
    {id:"stages",event:"stages",need:10,label:"Mở đường",detail:"Vượt 10 ải trong tuần"},
  ],
  phlt: [
    {id:"journey",event:"journey",need:1,label:"Hoàn tất hành trình",detail:"Hoàn thành một chuyến đủ ba chặng"},
    {id:"checkpoints",event:"checkpoints",need:3,label:"Khám phá đường dài",detail:"Vượt ba checkpoint hành trình"},
    {id:"survive",event:"survive",need:250,label:"Sống sót nơi hiểm địa",detail:"Hạ 250 địch trong hành trình"},
  ],
  g2: [
    {id:"rift",event:"rift",need:1,label:"Chinh phục bí cảnh",detail:"Hoàn thành một bí cảnh đủ năm chặng"},
    {id:"builds",event:"builds",need:3,label:"Thử lối võ học",detail:"Hoàn tất ba phép đo build hợp lệ"},
    {id:"bosses",event:"bosses",need:8,label:"Thử sức với trùm",detail:"Hạ 8 trùm trong tuần"},
  ],
});
const WEEK_MS=7*864e5,RETURN_MS=7*864e5,WEEKLY_CLAIM_CAP=3;
function weeklyWeekId(at=Date.now()){return Math.floor((Math.floor(at/864e5)+3)/7);}
function weeklyMake(mode,week){return {v:1,week,mode,selected:"",claims:[],tasks:WEEKLY_TASKS[mode].map(t=>({id:t.id,have:0,claimed:false}))};}
function weeklyValid(p){
  if(!p||p.v!==1||!Number.isSafeInteger(p.week)||!Object.hasOwn(WEEKLY_TASKS,p.mode)||typeof p.selected!=="string"||!Array.isArray(p.claims)||!Array.isArray(p.tasks))return false;
  if(p.claims.length>WEEKLY_CLAIM_CAP||new Set(p.claims).size!==p.claims.length||p.claims.some(id=>!WEEKLY_TASKS[p.mode].some(t=>t.id===id)))return false;
  return p.tasks.length===WEEKLY_TASKS[p.mode].length&&p.tasks.every((x,i)=>x&&x.id===WEEKLY_TASKS[p.mode][i].id&&Number.isSafeInteger(x.have)&&x.have>=0&&x.have<=WEEKLY_TASKS[p.mode][i].need&&typeof x.claimed==="boolean");
}
function weeklyRead(){
  if(!S||!S.fac)return null;
  const ext=S.extensions?.weeklyTasks;
  if(ext!==undefined&&!weeklyValid(ext))return null;
  const week=weeklyWeekId();
  if(!ext)return weeklyMake(modeId(),week);
  if(week>ext.week)return weeklyMake(modeId(),week);
  return JSON.parse(JSON.stringify(ext));
}
function weeklyPersist(next){
  if(!S||!S.fac||ADMV.sandbox||SAVE_LOCK)return {ok:false,msg:"Tiến trình tuần chưa thể lưu"};
  const before=JSON.parse(JSON.stringify(S));
  try{S.extensions||={v:1};S.extensions.weeklyTasks=next;if(!save())throw Error("Không lưu được tiến trình tuần");return {ok:true};}
  catch(e){S=before;return {ok:false,msg:e.message};}
}
function weeklySync(){
  const p=weeklyRead();if(!p)return {ok:false,msg:"Dữ liệu nhiệm vụ tuần chưa được hỗ trợ"};
  const old=S.extensions?.weeklyTasks;
  if(!old||p.week!==old.week||p.mode!==old.mode)return weeklyPersist(p);
  return {ok:true};
}
function weeklyRecord(event,amount=1){
  if(!S||!S.fac||ADMV.sandbox||!Number.isSafeInteger(amount)||amount<1)return false;
  const p=weeklyRead();if(!p||weeklyWeekId()<p.week||p.mode!==modeId()||!p.selected)return false;
  const spec=WEEKLY_TASKS[p.mode].find(t=>t.id===p.selected),row=p.tasks.find(t=>t.id===p.selected);
  if(!spec||!row||row.claimed||spec.event!==event||row.have>=spec.need)return false;
  row.have=Math.min(spec.need,row.have+amount);
  S.extensions||={v:1};S.extensions.weeklyTasks=p;
  if(row.have===spec.need){weeklyPersist(p);if(typeof dotGift==="function")dotGift();}
  return true;
}
function weeklySelect(id){
  const p=weeklyRead();if(!p)return {ok:false,msg:"Dữ liệu nhiệm vụ tuần chưa được hỗ trợ"};
  if(weeklyWeekId()<p.week)return {ok:false,msg:"Đồng hồ đang lùi; nhiệm vụ tuần chưa thể làm mới"};
  if(p.mode!==modeId())return {ok:false,msg:"Nhiệm vụ tuần đã khóa theo chế độ đã chọn"};
  if(p.claims.length>=WEEKLY_CLAIM_CAP)return {ok:false,msg:"Đã nhận đủ ba thưởng tuần"};
  const task=p.tasks.find(x=>x.id===id);if(!task||task.claimed)return {ok:false,msg:"Nhiệm vụ không khả dụng"};
  p.selected=id;return weeklyPersist(p);
}
function weeklyClaim(){
  const p=weeklyRead();if(!p)return {ok:false,msg:"Dữ liệu nhiệm vụ tuần chưa được hỗ trợ"};
  if(weeklyWeekId()<p.week||p.mode!==modeId())return {ok:false,msg:"Nhiệm vụ tuần không khớp chế độ/thời gian"};
  const task=p.tasks.find(x=>x.id===p.selected),spec=WEEKLY_TASKS[p.mode].find(x=>x.id===p.selected);
  if(!task||!spec||task.claimed||task.have<spec.need||p.claims.length>=WEEKLY_CLAIM_CAP)return {ok:false,msg:"Nhiệm vụ chưa hoàn tất hoặc đã nhận"};
  const before=JSON.parse(JSON.stringify(S));task.claimed=true;p.claims.push(task.id);p.selected="";
  try{
    S.extensions||={v:1};S.extensions.weeklyTasks=p;
    // One save persists the claim receipt and its small mode-local reward.
    S.gold+=Math.round(750*(1+S.lvl/10));RW().fd+=5;
    if(!save())throw Error("Không lưu được thưởng tuần");
    toast("Đã nhận thưởng nhiệm vụ tuần: 750 lượng cơ bản và 5 Phúc Duyên");
    return {ok:true,claims:p.claims.length};
  }catch(e){S=before;return {ok:false,msg:e.message};}
}
function weeklyReturnRead(){
  const p=S?.extensions?.weeklyReturn;
  if(p===undefined)return {v:1,lastSeen:Math.max(0,Number(S?.last)||Date.now()),eligibleAt:0,claimedAt:0};
  if(!p||p.v!==1||![p.lastSeen,p.eligibleAt,p.claimedAt].every(Number.isSafeInteger)||p.lastSeen<0||p.eligibleAt<0||p.claimedAt<0)return null;
  return JSON.parse(JSON.stringify(p));
}
function weeklyObserveReturn(){
  if(!S||!S.fac||ADMV.sandbox||SAVE_LOCK)return;
  const p=weeklyReturnRead();if(!p)return;
  const now=Date.now(),safeNow=Math.max(p.lastSeen,now);
  if(!p.eligibleAt&&!p.claimedAt&&p.lastSeen>0&&now>=p.lastSeen&&now-p.lastSeen>=RETURN_MS)p.eligibleAt=p.lastSeen;
  if(safeNow-p.lastSeen>=6*3600e3)p.lastSeen=safeNow;
  if(JSON.stringify(p)!==JSON.stringify(S.extensions?.weeklyReturn)){S.extensions||={v:1};S.extensions.weeklyReturn=p;}
}
function weeklyReturnClaim(){
  const p=weeklyReturnRead();if(!p||!p.eligibleAt||p.claimedAt)return {ok:false,msg:"Chưa có thưởng quay lại"};
  const before=JSON.parse(JSON.stringify(S));p.claimedAt=p.eligibleAt;p.eligibleAt=0;p.lastSeen=Math.max(p.lastSeen,Date.now());
  try{S.extensions||={v:1};S.extensions.weeklyReturn=p;S.gold+=Math.round(1500*(1+S.lvl/10));RW().fd+=10;if(!save())throw Error("Không lưu được thưởng quay lại");toast("Chào mừng trở lại · đã nhận 1.500 lượng cơ bản và 10 Phúc Duyên");return {ok:true};}
  catch(e){S=before;return {ok:false,msg:e.message};}
}
function weeklyCardHTML(){
  const p=weeklyRead();if(!p)return `<section class="card" id="weeklyTaskCard"><b>Nhiệm vụ tuần</b><p class="bad">Dữ liệu tuần chưa hỗ trợ; bản lưu được giữ nguyên.</p></section>`;
  const current=modeId(),defs=WEEKLY_TASKS[p.mode],selected=p.tasks.find(x=>x.id===p.selected),spec=defs.find(x=>x.id===p.selected),rollback=weeklyWeekId()<p.week;
  const tasks=p.mode===current?defs.map(d=>{const t=p.tasks.find(x=>x.id===d.id);return `<div class="qrow"><span><b>${d.label}</b><small>${d.detail} · ${t.have}/${d.need}${t.claimed?" · đã nhận":""}</small></span><button class="btn sm" data-week-select="${d.id}" ${rollback||t.claimed||p.claims.length>=WEEKLY_CLAIM_CAP||p.selected===d.id?"disabled":""}>Chọn</button></div>`}).join(""):`<p>Đang khóa theo ${p.mode.toUpperCase()} đến hết tuần UTC.</p>`;
  const ret=weeklyReturnRead(),returnButton=ret?.eligibleAt&&ret.claimedAt<ret.eligibleAt?'<button class="btn" data-week-return>Nhận quà quay lại</button>':"";
  return `<section class="card weekly-task-card" id="weeklyTaskCard"><h4>Nhiệm vụ tuần · ${p.mode.toUpperCase()}</h4><p>Tuần UTC · đã nhận ${p.claims.length}/${WEEKLY_CLAIM_CAP}. Chọn một nhiệm vụ; tiến trình và thưởng khóa theo mode đến hết tuần để không farm bằng đổi mode.</p>${rollback?'<p class="bad">Phát hiện đồng hồ lùi; giữ nguyên tuần trước, chưa mở lượt mới.</p>':tasks}${selected&&spec?`<p class="dim">Đang làm: ${spec.label}. ${selected.have}/${spec.need}.</p>${selected.have>=spec.need&&!selected.claimed?'<button class="btn" data-week-claim>Nhận 750 lượng cơ bản + 5 Phúc Duyên</button>':""}`:""}<small class="dim">Thưởng tuần tối đa 3 lần, ngoài quota daily hiện có.</small>${returnButton}</section>`;
}
function weeklyRenderCard(){
  const host=document.getElementById("t-more");if(!host)return;
  const old=document.getElementById("weeklyTaskCard");if(old)old.remove();
  host.insertAdjacentHTML("beforeend",weeklyCardHTML());
  const card=document.getElementById("weeklyTaskCard");if(!card)return;
  card.querySelectorAll("[data-week-select]").forEach(b=>b.onclick=()=>{const r=weeklySelect(b.dataset.weekSelect);if(!r.ok)toast(r.msg);weeklyRenderCard();});
  card.querySelector("[data-week-claim]")?.addEventListener("click",()=>{const r=weeklyClaim();if(!r.ok)toast(r.msg);weeklyRenderCard();});
  card.querySelector("[data-week-return]")?.addEventListener("click",()=>{const r=weeklyReturnClaim();if(!r.ok)toast(r.msg);weeklyRenderCard();});
}
{
  const oldRenderMore=renderMore;renderMore=function(){const result=oldRenderMore.apply(this,arguments);weeklySync();weeklyObserveReturn();weeklyRenderCard();return result;};
  const oldSave=save;save=function(){weeklyObserveReturn();return oldSave.apply(this,arguments);};
  const oldQuestTick=questTick;questTick=function(kind,amount=1){const result=oldQuestTick.apply(this,arguments);if(S?.mode==="ctc")weeklyRecord(kind,amount);return result;};
  if(typeof expeditionFinish==="function"){const old=expeditionFinish;expeditionFinish=function(outcome){const run=expeditionState(),cleared=run?.cleared||0,kills=run?.kills||0,result=old.apply(this,arguments);if(S?.mode==="phlt"&&result?.ok){if(outcome==="completed")weeklyRecord("journey",1);if(cleared)weeklyRecord("checkpoints",cleared);if(kills)weeklyRecord("survive",kills);}return result;};}
  if(typeof riftFinish==="function"){const old=riftFinish;riftFinish=function(outcome){const result=old.apply(this,arguments);if(S?.mode==="g2"&&outcome==="completed"&&result?.ok)weeklyRecord("rift",1);return result;};}
  if(typeof buildLibraryMeasure==="function"){const old=buildLibraryMeasure;buildLibraryMeasure=function(){const result=old.apply(this,arguments);if(S?.mode==="g2"&&result?.ok&&result.measurement?.status==="completed")weeklyRecord("builds",1);return result;};}
}
