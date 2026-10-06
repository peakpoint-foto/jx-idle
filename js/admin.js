"use strict";/* Bảng điều khiển phiên (chỉ chế độ 2.0): mọi thay đổi chỉ sống trong phiên, từ lúc bật tiến trình không được lưu. */const ADMIN_OPTS=[{k:"lv",n:"Lên thẳng cấp trần",d:"Cấp = trần hiện tại, cộng đủ điểm tiềm năng (5/cấp) và điểm võ công (1/cấp)",fn:()=>{const gap=Math.max(0,MAX_LEVEL-S.lvl);S.lvl=MAX_LEVEL;S.attrPts+=gap*PTS_PER_LEVEL;S.skPts+=gap*SKILL_PTS_PER_LEVEL;return"Cấp "+MAX_LEVEL+" (+"+gap*PTS_PER_LEVEL+" điểm tiềm năng, +"+gap+" điểm võ công)"}},{k:"gold",n:"Ngân lượng",d:"Cộng 10.000.000 lượng",fn:()=>{S.gold+=1e7;return"+10.000.000 lượng"}},{k:"mats",n:"Nguyên liệu đầy đủ",d:"99 Huyền Tinh mỗi cấp 1–5, 20 Tinh Hồng Bảo Thạch, 50 Thủy Tinh Trắng / Thần Bí Khoáng Thạch",fn:()=>{for(let l=1;l<=5;l++)matAdd("ht",l,99);matAdd("misc","thbt",20);matAdd("misc","wc",50);matAdd("misc","mys",50);return"đã thêm nguyên liệu"}},{k:"zones",n:"Mở toàn bộ vùng",d:"Mở hết ải để xem mọi bản đồ và mọi loại quái",fn:()=>{S.maxStage=Math.max(S.maxStage,STAGES);S.stage=S.maxStage;return"mở tới ải "+STAGES}},{k:"enh",n:"Cường hoá +10 toàn bộ đồ đang mặc",d:"Mọi món đang mặc lên +"+ENH_MAX+" (thuộc tính gốc +"+Math.round(ENH_STEP*ENH_MAX*100)+"%)",fn:()=>{let n=0;for(const k in S.eq){const it=S.eq[k];if(it){it.enh=ENH_MAX;n++}}return"đã cường hoá "+n+" món lên +"+ENH_MAX}},{k:"gear",n:"Một bộ Hoàng Kim đủ ô",d:"Phát một bộ Hoàng Kim đủ món của phái đang chơi (mức may mắn tối đa), tặng thêm điểm cho đủ yêu cầu Sức mạnh / Thân pháp. Chọn bộ cao nhất mặc được ở cấp hiện tại. Đồ đang mặc được cất vào hành trang",fn:()=>{const f=FAC[S.fac];if(!f)return"chưa chọn phái";const lvOf=r=>(r.req.find(q=>q[0]===36)||[0,0])[1];const facOf=r=>(r.req.find(q=>q[0]===39)||[0,-1])[1];const mine=J.sets.gold.filter(r=>facOf(r)===f.id&&sexReqOk(r.req)&&!/^\[/.test(r.n));const groups={};for(const r of mine)(groups[r.grp]=groups[r.grp]||[]).push(r);const onePerSlot=rows=>{const used={},out=[];for(const r of rows){const sl=DETAIL_SLOT[r.d],cap=sl==="ring"?2:1;used[sl]=used[sl]||0;if(used[sl]>=cap)continue;used[sl]++;out.push(r)}return out};const cand=Object.values(groups).map(rows=>{const pick=onePerSlot(rows);return{rows:pick,lv:Math.max(...pick.map(lvOf))}}).filter(g=>g.rows.length>=3);if(!cand.length)return"không có bộ nào phù hợp";const ok=cand.filter(g=>g.lv<=S.lvl);const best=(ok.length?ok:cand).sort((a,b)=>ok.length?b.lv-a.lv||b.rows.length-a.rows.length:a.lv-b.lv||b.rows.length-a.rows.length)[0];let n=0;const need={};for(const r of best.rows){let it=null;try{it=makeSetItem("gold",r,10)}catch(e){}if(!it)continue;const k=slotFor(it);if(!k)continue;try{const old=S.eq[k];if(old){if(S.inv.length>=INV_MAX)makeRoom(old,true);S.inv.unshift(old)}S.eq[k]=it;n++;const d=reqDeficit(it);for(const a in d)need[a]=Math.max(need[a]||0,d[a])}catch(e){}}let added=0;for(const a in need){S.attr[a]+=need[a];added+=need[a]}const lack=best.lv>S.lvl;return"đã mặc "+n+" món bộ Hoàng Kim cấp "+best.lv+(added?", tặng "+added+" điểm cho đủ yêu cầu":"")+(lack?" — CHƯA ĐỦ CẤP (cần cấp "+best.lv+", bạn cấp "+S.lvl+"): lên cấp rồi đồ mới có tác dụng":"")}},{k:"unlock",n:"Mở khoá tính năng",d:"Tháp thử thách, đồng hành (không cần đủ cấp), gọi ngay Trùm Hoàng Kim và thêm 5 lượt Tài Xỉu hôm nay",fn:()=>{const r=RW();r.unlockAll=1;r.gbT=0;const t=txState();t.luot=Math.max(0,t.luot-5);return"đã mở khoá (tháp, đồng hành, trùm Hoàng Kim, +5 lượt Tài Xỉu)"}}];
const adminHomNay=()=>localISODay();
const adminDaDung=()=>false;
const ADM_DEF={xp:1,gold:1,drop:1,hp:1,dmg:1,heroDmg:1,spawn:1,lucky:0,speed:0,god:0,infMana:0};
const ADM_MUL=[["xp","EXP nhận được",[.5,1,2,3,5,10,25,100]],["gold","Vàng rơi",[.5,1,2,5,10,50]],["drop","Tỉ lệ rơi đồ",[.5,1,2,3,5,10]],["hp","Máu quái",[.1,.25,.5,1,2,5,10]],["dmg","Sát thương quái",[0,.25,.5,1,2,5]],["heroDmg","Sát thương của bạn",[.5,1,2,5,10,100,1e6]],["spawn","Số quái mỗi đợt",[.5,1,2,3,5]],["lucky","May mắn cộng thêm",[0,10,25,50,100,200]],["speed","Tốc độ game (0 = theo chế độ)",[0,.5,1,1.5,2.5,5,10]]];
const ADM_FLAG=[["god","Bất tử (không mất máu)"],["infMana","Nội lực vô hạn"]];
const ADM_PRESET=[["Cày nhanh",{xp:10,speed:5,spawn:2}],["Săn đồ",{drop:5,lucky:50,gold:3,spawn:2}],["Đánh trùm",{hp:.5,heroDmg:5,spawn:1}],["Thử tải",{spawn:5,speed:10}],["Đặt lại hệ số",ADM_DEF]];
const admV=v=>v===1e6?"Một đòn":v===0?"Mặc định":"×"+v;
let ADM_TAB="mul";
const admStage=()=>Math.min(S.stage,STAGES);
function admBoss(){const z=zoneOf(admStage()),[x,y]=inWorld(H.x+rnd(160,240),H.y+rnd(-80,80));R.enemies.push(makeEnemy(z.boss,Math.min(MAX_LEVEL,Math.max(stageLevel(admStage()),S.lvl)+1),"boss",x,y))}
const ADM_ACT={
 hero:[
  {n:"Đặt cấp",opts:[10,30,50,80,100,120,150,MAX_LEVEL],fn:v=>{v=+v;const d=v-S.lvl;if(d>0){S.attrPts+=d*PTS_PER_LEVEL;S.skPts+=d*SKILL_PTS_PER_LEVEL}S.lvl=v;S.xp=0;return"cấp "+v+(d>0?" (+"+d*PTS_PER_LEVEL+" tiềm năng, +"+d+" võ công)":"")}},
  {n:"Cộng điểm tiềm năng",opts:[10,50,200],fn:v=>{S.attrPts+=+v;return"+"+v+" điểm tiềm năng"}},
  {n:"Cộng điểm võ công",opts:[5,20,100],fn:v=>{S.skPts+=+v;return"+"+v+" điểm võ công"}},
  {n:"Ngân lượng",opts:[1e6,1e7,1e8,1e9],fn:v=>{S.gold+=+v;return"+"+fmt(+v)+" lượng"}},
  {n:"Hồi đầy máu và nội lực",fn:()=>{R.life=R.P.life;R.mana=R.P.mana;return"đã hồi đầy"}}],
 world:[
  {n:"Nhảy tới ải",opts:[1,10,20,40,60,80,100,STAGES],fn:v=>{v=+v;S.stage=v;S.maxStage=Math.max(S.maxStage,v);S.wave=1;R.enemies=[];R.spawnT=.3;R.zoneShown=null;return"ải "+v}},
  {n:"Tới đợt trùm của ải",fn:()=>{S.wave=WAVES;R.enemies=[];R.spawnT=.3;return"đợt "+WAVES}},
  {n:"Gọi trùm vùng",fn:()=>{admBoss();return"đã gọi trùm"}},
  {n:"Gọi Trùm Hoàng Kim",fn:()=>{RW().gbT=0;spawnGoldBoss();return"đã gọi Trùm Hoàng Kim"}},
  {n:"Gọi tinh anh",opts:[5,10,20],fn:v=>{const z=zoneOf(admStage());for(let i=0;i<+v;i++){const[x,y]=inWorld(H.x+rnd(-260,260),H.y+rnd(-220,220));R.enemies.push(makeEnemy(pick(z.m),Math.max(stageLevel(admStage()),S.lvl),"elite",x,y))}return"đã gọi "+v+" tinh anh"}},
  {n:"Xoá hết quái trên sân",fn:()=>{R.enemies=[];return"đã xoá"}},
  {n:"Mở toàn bộ vùng",fn:()=>ADMIN_OPTS.find(o=>o.k==="zones").fn()}],
 item:[
  {n:"Phát đồ ngẫu nhiên (số dòng)",opts:[3,4,5,6],fn:v=>{for(let i=0;i<10;i++)grant({item:+v},"Bảng điều khiển");return"10 món "+v+" dòng"}},
  {n:"Một bộ Hoàng Kim đủ ô",fn:()=>ADMIN_OPTS.find(o=>o.k==="gear").fn()},
  {n:"Cường hoá +10 đồ đang mặc",fn:()=>ADMIN_OPTS.find(o=>o.k==="enh").fn()},
  {n:"Nguyên liệu đầy đủ",fn:()=>ADMIN_OPTS.find(o=>o.k==="mats").fn()}],
 act:[
  {n:"Đặt lại lượt công thành, Tống Kim, tháp",fn:()=>{siegeState().used=0;tkState().used=0;towerTries().n=0;return"đã đặt lại lượt"}},
  {n:"Đặt kỷ lục tháp",opts:[0,10,25,49,50,100],fn:v=>{RW().stat.towerBest=+v;return"kỷ lục tầng "+v}},
  {n:"Lệnh công thành",opts:[100,500,2000],fn:v=>{RW().sgTok=siegeTokens()+ +v;return"+"+v+" lệnh"}},
  {n:"Tống Kim Lệnh",opts:[100,500,2000],fn:v=>{RW().tkTok=tkTokens()+ +v;return"+"+v+" lệnh"}},
  {n:"Phúc Duyên",opts:[50,200,1000],fn:v=>{RW().fd+=+v;return"+"+v+" Phúc Duyên"}},
  {n:"Buff EXP +25% (phút)",opts:[30,60,180],fn:v=>{xpBuffAdd(+v);return"buff "+v+" phút"}},
  {n:"Làm xong nhiệm vụ ngày",fn:()=>{dailyQuests().list.forEach(q=>q.have=q.need);dotGift();return"đã đủ tiến độ, vào Quà để nhận"}},
  {n:"Mở lại điểm danh",fn:()=>{RW().login.claimed=false;dotGift();return"có thể nhận lại"}},
  {n:"Mở khoá tính năng",fn:()=>ADMIN_OPTS.find(o=>o.k==="unlock").fn()}]
};
const ADM_TABS=[["mul","Hệ số"],["hero","Nhân vật"],["world","Thế giới"],["item","Đồ"],["act","Hoạt động"],["tool","Công cụ"]];
let ADM_CK=0,ADM_MSG="",ADM_EXIT=0;
const admTime=t=>{const d=new Date(t);return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})+" ngày "+d.toLocaleDateString("vi-VN")};
function admSay(m){ADM_MSG=m;const el=document.getElementById("admMsg");if(el){el.textContent=m;el.hidden=!m}}
const ADM_LS_OK=k=>/^jxui_|^jxidle_ui$|^jxidle_fb_draft$/.test(String(k));
function admLockStorage(){const P=Storage.prototype;if(P.__admLock)return;P.__admLock=1;const set=P.setItem,rem=P.removeItem,clr=P.clear,blk=t=>ADMV.sandbox&&t===window.localStorage;
 P.setItem=function(k,v){if(blk(this)&&!ADM_LS_OK(k))return;return set.call(this,k,v)};P.removeItem=function(k){if(blk(this)&&!ADM_LS_OK(k))return;return rem.call(this,k)};P.clear=function(){if(blk(this))return;return clr.call(this)};
 const no=m=>{toast(m+" không dùng được trong phiên thử nghiệm (không lưu)")};
 const wrap=(name,msg,ret)=>{const f=window[name];if(typeof f!=="function")return;window[name]=function(){if(ADMV.sandbox){no(msg);return typeof ret==="function"?ret():ret}return f.apply(this,arguments)}};
 wrap("downloadSaveFile","Tải file lưu",false);wrap("exportSave","Xuất mã","");wrap("pickSaveFile","Nạp từ file",undefined);wrap("stashDeposit","Gửi kho chung",false);wrap("stashWithdraw","Rút kho chung",false);wrap("stashGold","Kho chung",false);wrap("stashMat","Kho chung",false);wrap("guildDonate","Đóng góp bang hội",()=>({ok:false,msg:"Đóng góp bang hội không dùng được trong phiên thử nghiệm"}))}
function admStart(){const ok=document.getElementById("admAgree");if(ok&&!ok.checked){admSay("Hãy đánh dấu ô xác nhận trước khi bật.");return}try{if(typeof save==="function")save()}catch(e){}ADM_CK=S.last||Date.now();admLockStorage();ADMV.sandbox=1;ADM_MSG="Đã bật phiên thử nghiệm.";admRefresh()}
function admRun(fn,name){let kq="xong";try{kq=fn()||"xong"}catch(e){admSay("Lỗi: "+(e&&e.message));return}R.dirty=true;invDirty=true;try{recalc()}catch(e){}admSay(name+": "+kq);try{log('<span style="color:#8fe34a">[Điều khiển]</span> '+esc(name)+" — "+esc(kq))}catch(e){}if(typeof renderAll==="function")renderAll();admRefresh()}
const ADM_XS=[];
setInterval(()=>{if(!ADMV.sandbox||typeof S==="undefined"||!S||!S.fac)return;if(ADMV.god&&R.P)R.life=R.P.life;if(ADMV.infMana&&R.P)R.mana=R.P.mana},150);
setInterval(()=>{if(typeof R==="undefined"||!R)return;const t=Date.now();ADM_XS.push([t,R.xpTot||0,R.kills||0]);while(ADM_XS.length>2&&t-ADM_XS[0][0]>6e4)ADM_XS.shift();const el=document.getElementById("admLive");if(!el||!S||!S.fac)return;const a=ADM_XS[0],b=ADM_XS[ADM_XS.length-1],dt=(b[0]-a[0])/1e3||1;el.textContent=`Cấp ${S.lvl} · ải ${admStage()} · ${fmt(Math.round((b[1]-a[1])/dt*60))} EXP/phút · ${((b[2]-a[2])/dt).toFixed(2)} quái/giây · tốc độ ×${gameSpeed()}`},1000);
function adminHtml(){
 if(!ADMV.sandbox)return'<h3>Bảng điều khiển <small>chỉ chế độ 2.0</small></h3><p class="desc">Chỉnh hệ số EXP, vàng, rơi đồ, quái, tốc độ và cấp, đồ, ải ngay trong lúc chơi để thử nghiệm.</p>'
  +'<div class="admwarn"><b>⚠ PHIÊN THỬ NGHIỆM SẼ KHÔNG ĐƯỢC LƯU</b><ul><li>Trò chơi lưu một lần ngay trước khi bật. Đó là bản lưu cuối cùng.</li><li>Sau khi bật, <b>mọi thứ</b> bạn nhận hoặc thay đổi (cấp, kinh nghiệm, đồ, ngân lượng, nhiệm vụ, điểm danh, lượt hoạt động…) kể cả do chơi bình thường đều <b>mất</b> khi tải lại hoặc đóng trang.</li><li>Trong phiên không tải/xuất/nạp file lưu, không gửi kho chung và không đóng góp bang hội được.</li><li>Không thể tắt phiên mà vẫn giữ tiến trình. Chỉ có cách tải lại trang để quay về bản lưu.</li><li>Tiến trình mất trong phiên thử nghiệm không được hỗ trợ khôi phục.</li></ul>'
  +'<label class="admagree"><input type="checkbox" id="admAgree"> Tôi đã hiểu: mọi tiến trình từ lúc bật sẽ không được lưu.</label></div>'
  +'<p class="reqbad" id="admMsg"'+(ADM_MSG?"":" hidden")+'>'+esc(ADM_MSG)+'</p>'
  +'<div class="btnrow"><button class="btn red" id="admGo" disabled>Bật thử nghiệm</button><button class="btn" onclick="closeModal()">Để sau</button></div>';
 const tabs='<div class="dtabs" id="admTabs">'+ADM_TABS.map(([k,n])=>`<button data-at="${k}" class="${k===ADM_TAB?"on":""}">${n}</button>`).join("")+"</div>";
 let body="";
 if(ADM_TAB==="mul"){
  body=ADM_MUL.map(([k,n,o])=>`<div class="row"><span>${n}</span><select data-m="${k}">${o.map(v=>`<option value="${v}" ${ADMV[k]===v?"selected":""}>${admV(v)}</option>`).join("")}${o.includes(ADMV[k])?"":`<option value="${ADMV[k]}" selected>${admV(ADMV[k])}</option>`}</select></div>`).join("")
   +ADM_FLAG.map(([k,n])=>`<label><input type="checkbox" data-f="${k}" ${ADMV[k]?"checked":""}> ${n}</label>`).join("")
   +'<div class="btnrow">'+ADM_PRESET.map(([n],i)=>`<button class="btn sm" data-ps="${i}">${n}</button>`).join("")+"</div>";
 }else if(ADM_TAB==="tool"){
  body='<div class="card"><b>Số liệu trực tiếp</b><div id="admLive" class="dim small">…</div></div><div class="card"><small class="dim">Đột biến hôm nay: '+esc(mutator()?mutator().n+" — "+mutator().d:"không có")+'</small></div>';
 }else{
  body=(ADM_ACT[ADM_TAB]||[]).map((a,i)=>`<div class="qrow"><span>${a.n}</span>${a.opts?`<select data-ao="${i}">${a.opts.map(v=>`<option value="${v}">${v>=1e6?fmt(v):v}</option>`).join("")}</select>`:"<small></small>"}<button class="btn sm" data-ar="${i}">Chạy</button></div>`).join("");
 }
 return'<h3>Bảng điều khiển <small>chế độ 2.0</small></h3>'
  +'<div class="admwarn sticky"><b>⚠ ĐANG THỬ NGHIỆM · KHÔNG LƯU</b><span>Bản lưu cuối: '+esc(admTime(ADM_CK||S.last||Date.now()))+'. Mọi tiến trình từ lúc đó sẽ mất khi tải lại hoặc đóng trang.</span>'
  +'<button class="btn sm red" id="admExit">'+(ADM_EXIT>Date.now()?"Bấm lần nữa để tải lại":"Thoát & về bản lưu")+'</button></div>'
  +'<p class="dim small" id="admMsg"'+(ADM_MSG?"":" hidden")+'>'+esc(ADM_MSG)+'</p>'+tabs+body;
}
function admBind(){
 const go=document.getElementById("admGo"),ag=document.getElementById("admAgree");if(go)go.onclick=admStart;if(ag)ag.onchange=()=>{go.disabled=!ag.checked};
 document.querySelectorAll("#admTabs [data-at]").forEach(b=>b.onclick=()=>{ADM_TAB=b.dataset.at;admRefresh()});
 document.querySelectorAll("#mBody [data-m]").forEach(s=>s.onchange=()=>{ADMV[s.dataset.m]=+s.value;R.dirty=true;const m=ADM_MUL.find(x=>x[0]===s.dataset.m);admSay((m?m[1]:s.dataset.m)+": "+admV(+s.value))});
 document.querySelectorAll("#mBody [data-f]").forEach(c=>c.onchange=()=>{ADMV[c.dataset.f]=c.checked?1:0});
 document.querySelectorAll("#mBody [data-ps]").forEach(b=>b.onclick=()=>{const p=ADM_PRESET[+b.dataset.ps];Object.assign(ADMV,ADM_DEF,p[1]);ADM_MSG="Bộ cài sẵn: "+p[0];admRefresh()});
 document.querySelectorAll("#mBody [data-ar]").forEach(b=>b.onclick=()=>{const a=ADM_ACT[ADM_TAB][+b.dataset.ar],sel=document.querySelector(`#mBody [data-ao="${b.dataset.ar}"]`);admRun(()=>a.fn(sel?sel.value:undefined),a.n)});
 const ex=document.getElementById("admExit");if(ex)ex.onclick=()=>{if(ADM_EXIT>Date.now()){R.dirty=false;location.reload();return}ADM_EXIT=Date.now()+4e3;ex.textContent="Bấm lần nữa để tải lại";setTimeout(()=>{if(ex.isConnected&&ADM_EXIT<=Date.now())ex.textContent="Thoát & về bản lưu"},4100)};
}
function admRefresh(){const m=document.getElementById("mBody");if(!m)return;const y=m.scrollTop;m.innerHTML=adminHtml();admBind();m.scrollTop=y}
function adminModal(){if(!MC().admin){toast(modeBlockMsg("Bảng điều khiển"));return}modal(adminHtml(),admBind)}
window.adminModal=adminModal;
