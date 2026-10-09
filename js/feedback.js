"use strict";
/* Góp ý: gửi tới máy chủ Cloudflare (POST /api/feedback) để chủ host đọc và khắc phục. Bản nháp giữ trong trình duyệt tới khi gửi xong. */
(function(){
const $=s=>document.querySelector(s);
const DRAFT="jxidle_fb_draft";
const CATS=[["bug","Lỗi"],["ui","Giao diện"],["balance","Cân bằng"],["idea","Ý tưởng"],["other","Khác"]];
const MAX=2000;
const draft=()=>{try{return JSON.parse(localStorage.getItem(DRAFT)||"{}")||{}}catch(e){return{}}};
const keep=d=>{if(typeof ADMV!=="undefined"&&ADMV.sandbox)return;try{localStorage.setItem(DRAFT,JSON.stringify(d))}catch(e){}};
function ctx(){const c={w:innerWidth,h:innerHeight,ua:navigator.userAgent,lang:navigator.language||""};
 if(typeof S!=="undefined"&&S&&S.fac){c.mode=S.mode||"";c.lvl=S.lvl|0;c.fac=S.fac;c.stage=S.stage|0;c.ver=COMBAT_MODEL_VERSION}
 if(typeof ADMV!=="undefined"&&ADMV.sandbox)c.admin=true;return c}
function fbModal(){
 const d=draft(),c=cleanFeedbackContext(ctx());let diagnostic=null;
 if(featureEnabled("feedback_diagnostics")){try{diagnostic=feedbackDiagnosticsSnapshot();}catch(e){}}
 modal(`<h3>Góp ý cho nhà phát triển</h3>
 <p class="desc">Nội dung được gửi tới người vận hành máy chủ trò chơi (Cloudflare) để kiểm tra và khắc phục. Không ghi mật khẩu hay thông tin cá nhân nhạy cảm.</p>
 <div class="card lootf fbbox">
  <div class="row">Loại <select id="fbCat">${CATS.map(([k,n])=>`<option value="${k}" ${d.cat===k?"selected":""}>${n}</option>`).join("")}</select></div>
 <div class="row">Tính năng <select id="fbFeature">${FB_FEATURES.map(k=>`<option value="${k}" ${d.feature===k?"selected":""}>${FB_FEATURE_NAMES[k]}</option>`).join("")}</select></div>
  <textarea id="fbText" maxlength="${MAX}" rows="6" placeholder="Mô tả vấn đề hoặc ý tưởng: bạn đang làm gì, điều gì xảy ra, bạn mong đợi điều gì…" style="width:100%;box-sizing:border-box">${esc(d.text||"")}</textarea>
  <small class="dim" id="fbCount"></small>
  <div class="row">Liên hệ <input id="fbContact" maxlength="100" placeholder="Không bắt buộc (email, Zalo…)" value="${esc(d.contact||"")}" style="flex:1"></div>
  <label><input type="checkbox" id="fbCtx" ${d.allowCtx===true?"checked":""}> Đính kèm thông tin kỹ thuật <small class="dim">(chế độ, cấp, môn phái, ải, kích thước màn hình, trình duyệt)</small></label>
  <small class="dim" id="fbCtxTxt">${esc(JSON.stringify(c))}</small>
  ${diagnostic?`<label><input type="checkbox" id="fbDiagnostic"> Đính kèm chẩn đoán trận (tối đa 32 event, không tên/ID nhân vật/save/token)</label><pre id="fbDiagnosticPreview" hidden style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(diagnostic,null,2))}</pre>`:""}
  <small class="dim">Thông tin kỹ thuật/chẩn đoán chỉ gửi khi bạn chọn. Email/số liên hệ trong mô tả và mã có nhãn được ẩn; nếu muốn trả lời, dùng ô Liên hệ. Dữ liệu góp ý giữ tối đa 90 ngày trong danh sách máy chủ; việc xóa vật lý chạy khi có truy cập. Bản sao webhook nếu host bật có chính sách riêng.</small>
 </div>
 <p class="reqbad" id="fbErr" hidden></p>
 <div class="btnrow"><button class="btn" id="fbSend">Gửi góp ý</button><button class="btn" id="fbClose">Để sau</button></div>`,()=>{
  const t=$("#fbText"),cnt=()=>{$("#fbCount").textContent=t.value.length+"/"+MAX+" ký tự · bản nháp được giữ lại nếu bạn đóng"};
  const store=()=>keep({cat:$("#fbCat").value,feature:$("#fbFeature").value,text:t.value,contact:$("#fbContact").value,allowCtx:$("#fbCtx").checked});
  ["#fbCat","#fbFeature","#fbText","#fbContact","#fbCtx"].forEach(s=>$(s).addEventListener("input",()=>{store();cnt()}));
  $("#fbCtx").addEventListener("change",()=>{store();$("#fbCtxTxt").hidden=!$("#fbCtx").checked});$("#fbCtxTxt").hidden=!$("#fbCtx").checked;
  if($("#fbDiagnostic"))$("#fbDiagnostic").onchange=()=>{$("#fbDiagnosticPreview").hidden=!$("#fbDiagnostic").checked;};
  cnt();$("#fbClose").onclick=()=>closeModal();
  $("#fbSend").onclick=async()=>{const b=$("#fbSend"),err=$("#fbErr"),text=t.value.trim();err.hidden=true;
   if(text.length<5){err.textContent="Nội dung góp ý quá ngắn (tối thiểu 5 ký tự).";err.hidden=false;return}
   b.disabled=true;b.textContent="Đang gửi…";
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
   try{const body=feedbackPayload({cat:$("#fbCat").value,feature:$("#fbFeature").value,text,contact:$("#fbContact").value,includeContext:$("#fbCtx").checked,includeDiagnostics:!!$("#fbDiagnostic")?.checked},c,diagnostic);
    const r=await fetch(onlBase()+"/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:controller.signal});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.msg||"Máy chủ báo lỗi ("+r.status+")");
    if(!ADMV.sandbox)try{localStorage.removeItem(DRAFT)}catch(e){}
    modal(`<h3>Đã gửi góp ý</h3><div class="card"><p class="desc">Cảm ơn bạn! Góp ý <b>#${esc(String(j.id||""))}</b> đã tới người vận hành máy chủ.</p></div><div class="btnrow"><button class="btn" onclick="closeModal()">Đóng</button></div>`);
   }catch(e){err.textContent=(e&&e.message&&!/fetch/i.test(e.message)?e.message:"Không kết nối được máy chủ")+". Bản nháp vẫn được giữ, hãy thử lại sau.";err.hidden=false;b.disabled=false;b.textContent="Gửi lại"}finally{clearTimeout(timeout)}}})}
window.fbModal=fbModal;
const ov=$("#jxOverflow");if(ov&&!$("#jxFb")){const b=document.createElement("button");b.className="rbtn";b.id="jxFb";b.dataset.ic="rec";b.title="Góp ý cho nhà phát triển";b.setAttribute("aria-label","Góp ý");b.innerHTML='<i></i><span class="sk">Góp ý</span>';b.onclick=()=>{if(typeof S!=="undefined"&&S&&S.fac)fbModal()};ov.appendChild(b)}
if(typeof renderMore==="function"){const _rm=renderMore;renderMore=function(){_rm();const t=$("#t-more");if(!t||$("#bFb"))return;
 const h=document.createElement("h3");h.textContent="Góp ý";const c=document.createElement("div");c.className="card";c.innerHTML='<p class="dim small">Gặp lỗi hay có ý tưởng? Gửi trực tiếp tới người vận hành máy chủ.</p><div class="btnrow"><button class="btn" id="bFb">Gửi góp ý</button></div>';
 const g=Array.from(t.querySelectorAll(":scope > .mgrp")).find(x=>x.firstChild&&x.firstChild.textContent==="Dữ liệu");
 if(g){g.querySelector("summary").textContent="Góp ý & dữ liệu";g.insertBefore(c,g.children[1]);g.insertBefore(h,c)}else{t.appendChild(h);t.appendChild(c)}
 $("#bFb").onclick=fbModal}}
})();
