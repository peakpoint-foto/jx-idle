"use strict";
// G04: standardized community challenges for mode 2.0. A challenge is a build, never a save: the server builds the character at a fixed
// level with deterministic reference gear, so a result depends only on the submitted build, the preset and the seed, and the server can
// re-simulate it. Presets are a fixed, versioned allowlist.
const CHALLENGE_VERSION="g2-challenge-v1";
const CHALLENGE_PRESETS=Object.freeze({
  std40:Object.freeze({id:"std40",level:40,waves:6,scale:4,label:"Chuẩn cấp 40"}),
  std60:Object.freeze({id:"std60",level:60,waves:6,scale:7,label:"Chuẩn cấp 60"}),
  std100:Object.freeze({id:"std100",level:100,waves:6,scale:10,label:"Chuẩn cấp 100"}),
});
const CHALLENGE_LIMITS=Object.freeze({attrEach:1000,skills:40});
const CHALLENGE_ATTR=Object.freeze(["str","dex","vit","eng"]);
const challengePreset=id=>typeof id==="string"&&Object.prototype.hasOwnProperty.call(CHALLENGE_PRESETS,id)?CHALLENGE_PRESETS[id]:null;
function challengeBudgets(presetId){const p=challengePreset(presetId);return p?{attr:(p.level-1)*PTS_PER_LEVEL,skill:(p.level-1)*SKILL_PTS_PER_LEVEL+1}:null;}
// Strict: unknown keys, wrong types, off-faction skills or budget overruns are refused, never repaired. Returns a normalized copy on success.
function challengeSpecCheck(spec,presetId){
  const preset=challengePreset(presetId);if(!preset)return{ok:false,code:"bad_preset"};
  if(!spec||typeof spec!=="object"||Array.isArray(spec)||Object.keys(spec).some(k=>!["fac","sex","attr","sk","main"].includes(k)))return{ok:false,code:"bad_spec"};
  const fac=typeof spec.fac==="string"&&Object.prototype.hasOwnProperty.call(FAC,spec.fac)?FAC[spec.fac]:null;if(!fac)return{ok:false,code:"bad_faction"};
  if(spec.sex!==0&&spec.sex!==1)return{ok:false,code:"bad_sex"};
  const budget=challengeBudgets(presetId);
  const a=spec.attr;if(!a||typeof a!=="object"||Array.isArray(a)||Object.keys(a).length!==CHALLENGE_ATTR.length||CHALLENGE_ATTR.some(k=>!Number.isInteger(a[k])||a[k]<0||a[k]>CHALLENGE_LIMITS.attrEach))return{ok:false,code:"bad_attr"};
  if(CHALLENGE_ATTR.reduce((n,k)=>n+a[k],0)>budget.attr)return{ok:false,code:"attr_budget"};
  const sk=spec.sk;if(!sk||typeof sk!=="object"||Array.isArray(sk))return{ok:false,code:"bad_skills"};
  const entries=Object.entries(sk);if(!entries.length||entries.length>CHALLENGE_LIMITS.skills)return{ok:false,code:"bad_skills"};
  const own=new Set(fac.skills.map(String));let used=0;const clean={};
  for(const[id,lv]of entries){
    const def=/^\d{1,5}$/.test(id)?SK[id]:null;
    if(!def||!own.has(id)||!Number.isInteger(lv)||lv<1||lv>(def.max||20)||(def.req||1)>preset.level)return{ok:false,code:"bad_skills"};
    used+=lv;clean[id]=lv;
  }
  if(used>budget.skill)return{ok:false,code:"skill_budget"};
  if(!Number.isInteger(spec.main)||!Object.prototype.hasOwnProperty.call(clean,String(spec.main))||SK[spec.main].kind==="passive")return{ok:false,code:"bad_main"};
  return{ok:true,spec:{fac:spec.fac,sex:spec.sex,attr:Object.fromEntries(CHALLENGE_ATTR.map(k=>[k,a[k]])),sk:Object.fromEntries(Object.keys(clean).sort((x,y)=>x-y).map(id=>[id,clean[id]])),main:spec.main}};
}
// Deterministic reference equipment (same selection as the siege reference set, but parameterized and independent of the caller's save).
function standardGear(fac,sex,lvl){
  const prevS=S,prevR=R.P,probe=Object.assign({},newSave(),{fac,sex,lvl,mode:"g2"}),eq={},tier=clamp(Math.round(lvl/12),1,10),f=FAC[fac];
  const oldRandom=Math.random;let seed=335518;
  S=probe;Math.random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
  if(R.P)R.P=Object.assign({},R.P,{lucky:0});
  const put=(detail,particular,slot)=>{const row=baseRow(detail,particular,tier);if(!row||!sexReqOk(row.req))return false;const it=makeItem(detail,particular,tier,2);if(!it||!sexOk(it))return false;eq[slot]=it;return true};
  try{
    const weaponDetail=f&&f.wcode===7?1:0,weaponPart=f&&f.wcode===7?0:f&&f.wcode===9?6:f&&f.wcode>=0?f.wcode:0;
    put(weaponDetail,weaponPart,"weapon");
    for(const detail of[2,7,6,5,8,4,9,3]){
      const rows=(J.items[detail]&&J.items[detail].list||[]).filter(r=>r.lvl<=lvl+2&&sexReqOk(r.req)).sort((x,y)=>y.lvl-x.lvl),row=rows[0];if(!row)continue;
      const slot=DETAIL_SLOT[detail];
      if(slot==="ring"){put(detail,row.k,"ring1");put(detail,row.k,"ring2");}else put(detail,row.k,slot);
    }
  }finally{Math.random=oldRandom;R.P=prevR;S=prevS;}
  return eq;
}
// A complete save for the standardized character: fixed level, no spare points, reference gear, and only what the validated build chose.
function challengeSave(spec,presetId){
  const preset=challengePreset(presetId),s=Object.assign(newSave(),{mode:"g2",name:"Chuẩn hóa",fac:spec.fac,sex:spec.sex,lvl:preset.level,attr:{...spec.attr},attrPts:0,sk:{...spec.sk},skPts:0,main:spec.main,inv:[],last:0,cid:"c_standard_challenge_build"});
  s.eq=standardGear(spec.fac,spec.sex,preset.level);return s;
}
