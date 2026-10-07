"use strict";
/* Gom giao diện: Hệ thống thành nhóm gập, hộp Quà theo nhóm, dải trạng thái, công tắc cày bổ sung. Không đổi logic game. */
(function(){
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const ready=()=>typeof S!=="undefined"&&S&&S.fac;

/* ---------- 1. Thẻ Hệ thống: nhóm gập + đủ công tắc cày ở một chỗ ---------- */
const TOGGLES=[
 {id:"push",n:"Vượt ải",get:()=>!!S.push,run:()=>$("#jxPush").click()},
 {id:"rot",n:"Xoay chiêu",get:()=>S.rot!==false,run:()=>$("#jxRot").click()},
 {id:"pot",n:"Tự dùng thuốc",get:()=>!S.potOff&&S.chal!=="nopot",run:()=>window.togglePotAuto&&window.togglePotAuto()},
 {id:"ctrl",n:"Thủ công",get:()=>typeof manual==="function"&&manual(),run:()=>setCtrl(manual()?"auto":"manual")}
];
const GROUPS=[
 ["Chơi & tự động",true,["Thao tác nhanh","Tốc độ game","Tự động","Độ khó và trợ giúp"]],
 ["Nhân vật & lưu trữ",false,["Nhân vật","Chế độ chơi","Bảng điều khiển","Lưu game","Chơi Online"]],
 ["Hiển thị & điều khiển",false,["Trợ năng","Điều khiển & Hiển thị","Âm thanh"]],
 ["Dữ liệu",false,["Nguồn dữ liệu"]]
];
const openG=new Set([0]);
function addToggles(t){
 const row=t.querySelector(".qtg");if(!row||row.querySelector("[data-tg]"))return;
 for(const g of TOGGLES){const b=document.createElement("button");b.className="btn sm"+(g.get()?" on":"");b.dataset.tg=g.id;b.textContent=g.n+": "+(g.get()?"Bật":"Tắt");
  b.onclick=()=>{g.run();if(typeof refresh==="function")refresh()};row.appendChild(b)}
}
function groupMore(){
 const t=$("#t-more");if(!t||t.querySelector(":scope > .mgrp"))return;
 const secs=[];let cur=null;
 for(const n of Array.from(t.children)){if(n.tagName==="H3"){cur={h:n,nodes:[n]};secs.push(cur)}else if(cur)cur.nodes.push(n);}
 if(!secs.length)return;
 const tail=[];
 for(const s of secs){const last=s.nodes[s.nodes.length-1];if(s.nodes.length>2&&last.classList.contains("btnrow")&&last.querySelector("#bSwitch,#bReset")){s.nodes.pop();tail.push(last)}}
 const used=new Set(),det=[];
 GROUPS.forEach(([name,,keys],i)=>{
  const d=document.createElement("details");d.className="mgrp";d.open=openG.has(i);
  const sm=document.createElement("summary");sm.textContent=name;d.appendChild(sm);
  d.addEventListener("toggle",()=>{d.open?openG.add(i):openG.delete(i)});
  for(const k of keys){const s=secs.find(x=>x.h.textContent.trim().startsWith(k));if(s&&!used.has(s)){used.add(s);s.nodes.forEach(n=>d.appendChild(n))}}
  if(i===1)tail.forEach(n=>d.appendChild(n));
  if(d.children.length>1)det.push(d)});
 const rest=secs.filter(s=>!used.has(s));
 if(rest.length){const d=document.createElement("details");d.className="mgrp";const sm=document.createElement("summary");sm.textContent="Khác";d.appendChild(sm);rest.forEach(s=>s.nodes.forEach(n=>d.appendChild(n)));det.push(d)}
 det.forEach(d=>t.appendChild(d));
}
if(typeof renderMore==="function"){const _rm=renderMore;renderMore=function(){_rm();const t=$("#t-more");if(!t)return;addToggles(t);groupMore()}}

/* ---------- 2. Hộp Quà: nhóm thẻ + gập phần mô tả dài ---------- */
const GIFT_GROUPS=[["Hôm nay",["login","quest","yt","lvms"]],["Hoạt động",["tk","siege","tower"]],["Thưởng",["ach","chest","event","tx"]],["Nhân vật",["pet","reborn","mode"]],["Cộng đồng",["guild","clan"]]];
const descOpen=new Set();
if(typeof giftModal==="function"){const _gm=giftModal;giftModal=function(){_gm();
 const bar=$("#giftTabs");if(!bar)return;
 const btn={};bar.querySelectorAll("button[data-g]").forEach(b=>btn[b.dataset.g]=b);
 const frag=document.createDocumentFragment(),put=n=>{const s=document.createElement("span");s.className="glab";s.textContent=n;frag.appendChild(s)};
 for(const [n,keys] of GIFT_GROUPS){const have=keys.filter(k=>btn[k]);if(!have.length)continue;put(n);have.forEach(k=>{frag.appendChild(btn[k]);delete btn[k]})}
 const left=Object.keys(btn);if(left.length){put("Khác");left.forEach(k=>frag.appendChild(btn[k]))}
 bar.appendChild(frag);
 const key=(typeof giftTab==="string"?giftTab:"");
 $$("#mBody > p.desc").forEach(p=>{if(p.textContent.length<190)return;
  const d=document.createElement("details");d.className="dsc";d.open=descOpen.has(key);
  const sm=document.createElement("summary");sm.textContent="Luật & mô tả";d.appendChild(sm);
  p.replaceWith(d);d.appendChild(p);d.addEventListener("toggle",()=>{d.open?descOpen.add(key):descOpen.delete(key)})})}}

/* ---------- 2b. Chấm xanh: mục có quà / nhiệm vụ nhận được ---------- */
function giftReadyTabs(){const t=new Set();if(!ready())return t;try{const r=RW();
 if(!r.login.claimed)t.add("login");
 if(lvMsReady().length)t.add("lvms");
 if(dailyQuests().list.some(q=>!q.done&&q.have>=q.need))t.add("quest");
 if(typeof ytState==="function"){const y=ytState();if(y.done||ytDeliverable())t.add("yt")}
 if(r.fd>=FD_COST)t.add("chest");
 if(typeof EVENT_SHOP!=="undefined"&&(r.stat.tokens|0)>=Math.min(...EVENT_SHOP.map(x=>x[0])))t.add("event");
 if(unlocked(PET_LV)&&!r.pet)t.add("pet");
 if(S.lvl>=REBORN_LV&&(r.stat.reborn|0)<REBORN_MAX||typeof tpPending==="function"&&tpPending()>0)t.add("reborn");
}catch(e){}return t}
window.giftReadyTabs=giftReadyTabs;
if(typeof giftPending==="function"){const _gp=giftPending;giftPending=function(){return _gp()||giftReadyTabs().size>0}}
function markGiftTabs(){const bar=$("#giftTabs");if(!bar)return;const rd=giftReadyTabs();bar.querySelectorAll("button[data-g]").forEach(b=>{const on=rd.has(b.dataset.g);let d=b.querySelector(".gdot");if(on&&!d){d=document.createElement("em");d.className="gdot";d.setAttribute("aria-label","có thể nhận");b.appendChild(d)}else if(!on&&d)d.remove()});
 document.querySelectorAll("#mBody .qrow").forEach(q=>{const btn=q.querySelector("button.btn");q.classList.toggle("ready",!!(btn&&!btn.disabled&&/^(Nhận|Nộp|Vào)$/.test(btn.textContent.trim())))})}
if(typeof giftModal==="function"){const _gm2=giftModal;giftModal=function(){_gm2();markGiftTabs()}}
setInterval(()=>{if(!ready())return;const any=giftReadyTabs().size>0;const td=$("#jxToday");if(td)td.classList.toggle("on",any);const gb=$("#giftBtn");if(gb)gb.classList.toggle("on",any||(typeof giftPending==="function"&&giftPending()))},1000);

/* ---------- 3. Dải trạng thái: đang làm gì, tốc độ, buff ---------- */
const st=document.createElement("div");st.id="jxStat";st.setAttribute("aria-live","off");const bt=$("#battle");if(bt)bt.appendChild(st);
function statText(){
 if(!ready())return"";
 const p=[];
 if(typeof SV!=="undefined"&&SV.on)return"";
 if(R.tower)p.push("Tháp tầng "+R.tower.floor);
 else if(S.siege)p.push("Công thành "+S.siege.layer+"/3");
 else if(R.tk)p.push("Tống Kim "+R.tk.wave+"/"+TK_WAVES);
 else if(R.town)p.push("Trong thành");
 else if(typeof manual==="function"&&manual()){const left=window.JXM?Math.ceil(window.JXM()/1e3):0;p.push(left>0?"Thủ công · tự đánh lại sau "+left+"s":"Thủ công")}
 else p.push(S.push?"Tự cày · vượt ải":"Tự cày · tại chỗ");
 const v=typeof gameSpeed==="function"?gameSpeed():1;if(v>1)p.push("×"+v);
 const b=typeof xpBuffLeft==="function"?xpBuffLeft():0;if(b>0)p.push("EXP +25% · "+Math.ceil(b/6e4)+"p");
 return p.join(" · ")}
setInterval(()=>{const t=statText();if(st.textContent!==t)st.textContent=t;st.style.display=t?"":"none"},500);
})();
