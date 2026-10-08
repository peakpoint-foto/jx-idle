"use strict";
const EXPEDITION_KNOWLEDGE_KEYS=Object.freeze(Object.keys(EXPEDITION_ROUTES).flatMap(id=>[1,2,3].map(n=>id+":"+n)));
function expeditionKnowledge(){
  const p=S.extensions?.expeditionKnowledge;
  if(!p)return {v:1,mode:"phlt",character:S.cid,checkpoints:[],completed:[],enemies:[],journal:[]};
  if(p.v!==1||p.mode!=="phlt"||p.character!==S.cid||!Array.isArray(p.checkpoints)||!Array.isArray(p.completed)||!Array.isArray(p.journal))return null;
  if(p.checkpoints.length>6||new Set(p.checkpoints).size!==p.checkpoints.length||p.checkpoints.some(k=>!EXPEDITION_KNOWLEDGE_KEYS.includes(k)))return null;
  if(p.completed.length>2||new Set(p.completed).size!==p.completed.length||p.completed.some(k=>!Object.hasOwn(EXPEDITION_ROUTES,k)))return null;
  const enemies=p.enemies??[];
  if(!Array.isArray(enemies)||enemies.length>32||new Set(enemies).size!==enemies.length||enemies.some(id=>typeof id!=="string"||!Object.hasOwn(MON,id)))return null;
  if(p.journal.length>10||p.journal.some(x=>!x||typeof x.session!=="string"||x.session.length>80||!Object.hasOwn(EXPEDITION_ROUTES,x.route)||
    !["completed","withdrawn","failed","interrupted"].includes(x.outcome)||!["fee","banked","lostGold","items","lostItems","cleared","finished"].every(k=>Number.isSafeInteger(x[k])&&x[k]>=0)||
    x.fee>1e9||x.banked>x.fee*1.5||x.lostGold>x.fee*1.5||x.items>6||x.lostItems>6||x.cleared>3||x.finished>1e15))return null;
  return {...p,enemies};
}
function expeditionKnowledgeView(){
  if(modeId()!=="phlt"||!featureEnabled("expedition_knowledge"))return null;
  const p=expeditionKnowledge();if(!p)return {unsupported:true};
  return {unsupported:false,checkpoints:p.checkpoints.slice(),completed:p.completed.slice(),journal:p.journal.map(x=>({...x})),
    enemies:p.enemies.map(tid=>({name:MON[tid].n,resistance:MON[tid].rmax.slice(),note:"Trần kháng template đã gặp; kháng trận còn theo cấp/hệ, không phải điểm yếu cố định."})),
    recipes:p.completed.map(id=>id==="shelter"?{id:"violet_fuse",name:"Tra cứu Hợp Tím",detail:`Công thức hiện có: 3 món đúng nhóm ${FUSE_SLOTS.map(d=>SLOT_VI[DETAIL_SLOT[d]]||d).join(", ")}, ${fmt(fuseCost())} lượng. Giữ điều kiện native, không cấp vật liệu hoặc mở chế đồ ngoài mode.`}:{id:"gold_shards",name:"Tra cứu mảnh Hoàng Kim",detail:`Tra cứu ${Object.keys(SHARD_NEEDS).length} mẫu ghép hiện có; cần đủ mảnh và điều kiện native. Không cấp Hoàng Kim hoặc công thức Bạch Kim.`}),
    cosmetics:p.checkpoints.map(k=>({id:"checkpoint:"+k,label:EXPEDITION_ROUTES[k.split(":")[0]].name+" · dấu chặng "+k.split(":")[1]}))};
}
{
  const original=expeditionReward;
  expeditionReward=function(e,outcome){
    original(e,outcome);
    if(modeId()!=="phlt"||ADMV.sandbox||SAVE_LOCK||!featureEnabled("expedition_knowledge")||!e.travel?.route||!expeditionTravelState())return;
    const current=expeditionKnowledge();if(!current)return; // Preserve unknown/malformed namespaces; gameplay reward is independent.
    const p=JSON.parse(JSON.stringify(current)),id=e.travel.route.id,t=e.travel;
    if(p.journal.some(row=>row.session===e.id))return;
    // Fail keeps only first cleared checkpoint; abort/reload never grant progress.
    const retained=outcome==="completed"?3:outcome==="failed"&&e.cleared>0?1:0;
    for(let n=1;n<=retained;n++){const key=id+":"+n;if(!p.checkpoints.includes(key))p.checkpoints.push(key);}
    if(retained)for(const tid of zoneOf(S.stage).m){const key=String(tid);if(p.enemies.length<32&&!p.enemies.includes(key))p.enemies.push(key);}
    if(outcome==="completed"&&!p.completed.includes(id))p.completed.push(id);
    const safe=["completed","withdrawn"].includes(outcome)&&t.claimed===true;
    p.journal.unshift({session:e.id,route:id,outcome,fee:t.cost,banked:safe?t.receipt.gold:0,items:safe?t.receipt.items:0,
      lostGold:safe?0:t.gold,lostItems:safe?0:t.items.length,cleared:e.cleared,finished:Date.now()});p.journal=p.journal.slice(0,10);
    S.extensions.expeditionKnowledge=p;
  };
}
