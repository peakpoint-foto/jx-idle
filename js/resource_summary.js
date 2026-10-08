"use strict";
const RESOURCE_FIELDS=Object.freeze(["gold","items","ht","ore","shard","misc","lifePots","manaPots"]);
function resourceBalances(state=S){
  const sum=value=>{const values=Object.values(value||{});if(values.length>1024||values.some(n=>!Number.isSafeInteger(n)||n<0||n>1e9))throw Error("Tài nguyên ngoài giới hạn summary");return values.reduce((a,b)=>a+b,0);};
  const b={gold:state.gold,items:(state.inv||[]).length+Object.values(state.eq||{}).filter(Boolean).length,
    ht:sum(state.mats?.ht),ore:sum(state.mats?.ore),shard:sum(state.mats?.shard),misc:sum(state.mats?.misc),
    lifePots:sum(state.potStock?.life),manaPots:sum(state.potStock?.mana)};
  if(RESOURCE_FIELDS.some(k=>!Number.isSafeInteger(b[k])||b[k]<0||b[k]>1e15))throw Error("Số dư chưa hợp lệ");return b;
}
function resourceLedgerState(){
  const p=S.extensions?.resourceLedger;if(!p)return {v:1,mode:modeId(),character:S.cid,entries:[]};
  if(p.v!==1||p.mode!==modeId()||p.character!==S.cid||!Array.isArray(p.entries)||p.entries.length>32||p.entries.some(x=>!x||
    !Number.isSafeInteger(x.at)||x.at<0||x.at>1e15||!["workbench","expedition","local_net"].includes(x.source)||
    !x.delta||Object.keys(x.delta).some(k=>!RESOURCE_FIELDS.includes(k))||Object.values(x.delta).some(n=>!Number.isSafeInteger(n)||Math.abs(n)>1e15)))throw Error("Summary phiên bản khác hoặc chưa hợp lệ");
  return p;
}
function resourceCatalog(){
  return {mode:modeId(),cap:MC().rarMax,sources:["Quái/hoạt động theo luật mode và quota native","Phúc Duyên/nhiệm vụ/đăng nhập có điều kiện native"],
    sinks:["Thuốc/cửa hàng theo giá và lượt native",...(MC().lab?["Hợp/khảm/thăng nguyên liệu qua preview bàn chế tác"]:[]),...(MC().rforge?["Rèn ngẫu nhiên có rủi ro native"]:[]),...(modeId()==="phlt"?["Phí hành trình; thuốc chuyến tách kho thường"]:[])],
    policy:modeId()==="ctc"?"Không lab/rforge/đồ cao hơn Vàng; công trạng online tách vàng local.":modeId()==="phlt"?"Cap Tím/Hoàng Kim; không Bạch Kim; hành trình gross vàng tối đa1.5phí, payout an toàn.":"Cap Bạch Kim; công cụ thử build không cấp tài nguyên; không nhập ví CTC."};
}
function resourceSummary(){
  if(!featureEnabled("resource_summary"))return null;
  try{return {unsupported:false,balances:resourceBalances(),entries:resourceLedgerState().entries.map(x=>({...x,delta:{...x.delta}})),catalog:resourceCatalog()};}
  catch{return {unsupported:true};}
}
{
  const originalSave=save;
  save=function(){
    if(!featureEnabled("resource_summary")||ADMV.sandbox||SAVE_LOCK)return originalSave();
    const extensions=S.extensions,prior=extensions?.resourceLedger;
    let changed=false;
    try{
      const p=resourceLedgerState(),raw=localStorage.getItem(saveKey());
      if(raw&&raw.length<=2e6){
        const decoded=unpack(raw),before=decoded.ok&&decoded.state;
        if(before&&before.mode===modeId()&&before.cid===S.cid){
          const a=resourceBalances(before),b=resourceBalances(),delta=Object.fromEntries(RESOURCE_FIELDS.filter(k=>b[k]!==a[k]).map(k=>[k,b[k]-a[k]]));
          if(Object.keys(delta).length){
            const wb=S.extensions?.workbench?.receipts?.[0]?.id,oldWb=before.extensions?.workbench?.receipts?.[0]?.id;
            const e=S.extensions?.expedition,old=before.extensions?.expedition;
            const source=wb&&wb!==oldWb?"workbench":e&&(e.id!==old?.id||e.status!==old?.status)?"expedition":"local_net";
            S.extensions||={v:1};S.extensions.resourceLedger={...p,entries:[{at:Date.now(),source,delta},...p.entries].slice(0,32)};changed=true;
          }
        }
      }
    }catch{} // Unknown namespaces and incomplete local histories do not block gameplay saving.
    let ok;try{ok=originalSave();}catch(e){if(changed){if(prior)S.extensions.resourceLedger=prior;else delete S.extensions.resourceLedger;}throw e;}
    if(!ok&&changed){if(prior)S.extensions.resourceLedger=prior;else delete S.extensions.resourceLedger;}
    return ok;
  };
}
