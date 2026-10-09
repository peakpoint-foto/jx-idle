"use strict";

const FB_FEATURES=["build_advice","trial","event_calendar","codex","goals_7d","gold_sink","story","rift","lab","boss","season","other"];
const FB_FEATURE_NAMES={build_advice:"Cố vấn build",trial:"Thử thách tuần",event_calendar:"Lịch sự kiện",codex:"Codex sưu tầm",goals_7d:"Mục tiêu 7 ngày",gold_sink:"Gold sink",story:"Truyện ngắn",rift:"Rift",lab:"Phòng lab build",boss:"Boss",season:"Mùa",other:"Khác / chung"};

function redactFeedbackText(value) {
  return String(value).replace(/\b(?:Bearer|token|recovery[_ ]?code|ADMIN_KEY)\s*[:= ]\s*[^\s,;]+/gi,"[đã ẩn mã]")
    .replace(/mã khôi phục\s*[:= ]\s*[^\s,;]+/gi,"[đã ẩn mã]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[đã ẩn email]")
    .replace(/(?:\+?84|0)[ .-]?\d(?:[ .-]?\d){8,10}\b/g,"[đã ẩn số liên hệ]");
}
function cleanFeedbackDiagnostics(input) {
  if(!input||typeof input!=="object"||Array.isArray(input)||input.v!==1||!isMode(input.mode)||!FAC[input.fac])throw new Error("Diagnostic schema không hợp lệ");
  if(new TextEncoder().encode(JSON.stringify(input)).length>16384)throw new Error("Diagnostic quá lớn");
  const output={v:1,mode:input.mode,fac:input.fac};
  if(/^jx-combat-v\d{1,3}$/.test(input.version))output.version=input.version;
  if(/^b_[0-9a-f]{8}$/.test(input.buildId))output.buildId=input.buildId;
  if(["farm","survival","siege","tower","tk","expedition","rift"].includes(input.activity))output.activity=input.activity;
  if(!Array.isArray(input.events)||input.events.length>32)throw new Error("Timeline diagnostic quá lớn hoặc không hợp lệ");
  output.events=input.events.flatMap(event=>{
    if(!event||!COMBAT_EVENT_KINDS.includes(event.kind)||!Number.isFinite(event.at)||event.at<0||event.at>86400)return [];
    const clean={kind:event.kind,at:event.at};
    for(const key of ["raw","useful","excess","duration"])if(Number.isFinite(event[key])&&event[key]>=0&&event[key]<=1e12)clean[key]=event[key];
    const id=Number(event.skillId);if(Number.isSafeInteger(id)&&SK[id])clean.skillId=id;
    // Actor IDs, arbitrary reasons, names, contact and extension fields are not exported.
    return [clean];
  });
  return output;
}
function cleanFeedbackContext(input) {
  const output={};if(!input||typeof input!=="object"||Array.isArray(input))return output;
  for(const key of ["mode","lvl","fac","stage","ver","w","h","ua","lang","admin"]){const v=input[key];
    if(typeof v==="number"&&Number.isFinite(v))output[key]=v;
    else if(typeof v==="string"||typeof v==="boolean")output[key]=redactFeedbackText(String(v)).slice(0,200);
  }return output;
}
function feedbackPayload(input,context,diagnostics) {
  const text=String(input.text||"").trim();if(text.length<5||text.length>2000)throw new Error("Nội dung cần 5–2000 ký tự");
  const output={text:redactFeedbackText(text),cat:String(input.cat||"other"),contact:String(input.contact||"").trim().slice(0,100)};
  if(FB_FEATURES.includes(input.feature))output.feature=input.feature;
  if(input.includeContext===true)output.ctx=cleanFeedbackContext(context);
  if(input.includeDiagnostics===true){output.diagnosticConsent=true;output.diagnostics=cleanFeedbackDiagnostics(diagnostics);}
  if(new TextEncoder().encode(JSON.stringify(output)).length>16384)throw new Error("Góp ý quá lớn");return output;
}
function feedbackDiagnosticsSnapshot() {
  if(!featureEnabled("feedback_diagnostics"))throw new Error("Chẩn đoán góp ý chưa mở");
  const values=JSON.stringify([S.fac,S.attr,S.sk,S.main,S.slots,S.rot,Object.entries(S.eq).map(([slot,it])=>[slot,it.d,it.k,it.lvl,it.s,it.r,it.base,it.mag,it.ext,it.enh])]);let hash=2166136261;
  for(let i=0;i<values.length;i++)hash=Math.imul(hash^values.charCodeAt(i),16777619)>>>0;
  const report=combatReportHistory().at(-1);
  return cleanFeedbackDiagnostics({v:1,mode:modeId(),fac:S.fac,version:COMBAT_MODEL_VERSION,buildId:"b_"+hash.toString(16).padStart(8,"0"),
    activity:report?.activity||combatActivity(),events:report?.events.slice(-32)||[]});
}
