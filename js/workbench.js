"use strict";
let WORKBENCH_PENDING=null,WORKBENCH_BUSY=false;
function workbenchHash(text){let a=2166136261,b=5381;for(const c of text){a=Math.imul(a^c.charCodeAt(0),16777619)>>>0;b=(Math.imul(b,33)^c.charCodeAt(0))>>>0;}return a.toString(36)+"_"+b.toString(36)+"_"+text.length;}
function workbenchState(){
  const p=S.extensions?.workbench;if(!p)return {v:1,mode:modeId(),character:S.cid,receipts:[]};
  if(p.v!==1||p.mode!==modeId()||p.character!==S.cid||!Array.isArray(p.receipts)||p.receipts.length>32||p.receipts.some(x=>!x||typeof x.id!=="string"||x.id.length>80||typeof x.ok!=="boolean"||typeof x.msg!=="string"||x.msg.length>300))throw Error("Dữ liệu bàn chế tác chưa được hỗ trợ; giữ nguyên bản lưu");
  return p;
}
function workbenchProblem(){return !featureEnabled("safe_workbench")?"Bàn chế tác chỉ mở PHLT/2.0 khi được bật":buildChangeProblem();}
function workbenchPreviewCore(raw){
  const problem=workbenchProblem();if(problem)throw Error(problem);workbenchState();
  if(!raw||!["recycle","enhance","reroll","enchase","upgradeHT","buyHT","upgradeOre","randomForge","makePlatina","upgradePlatina","combineShards"].includes(raw.kind))throw Error("Công thức không hợp lệ");
  const args={kind:raw.kind,uids:Array.isArray(raw.uids)?raw.uids.slice():[],ht:raw.ht,key:raw.key,insured:raw.insured===true,quantity:raw.quantity??1};
  if(args.uids.length>3||args.uids.some(x=>!Number.isSafeInteger(x)||x<0)||new Set(args.uids).size!==args.uids.length)throw Error("UID nguyên liệu không hợp lệ");
  const items=args.uids.map(uid=>S.inv.find(it=>it.uid===uid));
  if(args.uids.some(uid=>S.inv.filter(it=>it.uid===uid).length!==1))throw Error("UID nguyên liệu thiếu hoặc trùng trong túi");
  if(items.some(it=>!it||it.locked||Object.values(S.eq).some(eq=>eq?.uid===it.uid)||!modeItemOk(it,modeId())))throw Error("Chỉ dùng đồ sở hữu trong túi, chưa khóa/chưa mặc và đúng mode");
  let cost=0,chance=100,detail="",materials=[];
  switch(args.kind){
    case "recycle":
      if(!MC().lab||items.length!==3||!items.every(canFuse))throw Error("Hợp cần ba món nhẫn/dây chuyền/ngọc bội được phép");
      cost=fuseCost();detail="Tiêu ba món → Huyền Tinh cấp native trong giới hạn1–10; không đảm bảo cấp tối đa.";break;
    case "enhance":
      if(items.length!==1||(items[0].enh||0)>=ENH_MAX)throw Error("Cường hóa đã đủ cấp hoặc thiếu món");
      cost=enhCost(items[0]);chance=Math.round(enhChance(items[0])*100);detail="Giữ đồ; thất bại mất phí; cap +"+ENH_MAX;break;
    case "reroll":
      if(items.length!==1||!canReroll(items[0]))throw Error("Không tẩy đồ trắng/bộ/Tím");
      cost=rerollCost(items[0]);detail="Gieo lại toàn bộ số dòng hiện có bằng bảng native; không thêm dòng hoặc vượt cap.";break;
    case "enchase":{
      if(items.length!==1||!Number.isInteger(args.ht)||args.ht<1||args.ht>HT_MAX||typeof args.key!=="string"||args.key.length>60)throw Error("Chọn món/Huyền Tinh/khoáng hợp lệ");
      const check=enchaseCheck(items[0],args.ht,args.key);if(typeof check==="string")throw Error(check);
      chance=100-RCP_R.enchase.fail_pct;materials=[`1 HT cấp ${args.ht}`,`1 khoáng ${args.key}`];detail="Thêm một dòng Tím theo khoáng native, tối đa6; thất bại mất đá, giữ đồ.";break;
    }
    case "upgradeHT":
      if(items.length||!MC().lab||!Number.isInteger(args.ht)||args.ht<1||args.ht>=HT_MAX||matHave("ht",args.ht)<3)throw Error("Cần ba HT cùng cấp1–9");
      chance=Math.round((1-RCP_R.violet_up.fail[0]/RCP_R.violet_up.fail[1])*100);materials=[`3 HT cấp ${args.ht}`];detail="Thành công tăng1cấp, cap10; thất bại mất ba viên.";
      if(args.insured){const bh=htInsureCost(args.ht);cost=bh.van;if(matHave("misc","thbt")<bh.thbt)throw Error("Thiếu đá bảo hiểm");materials.push(`${bh.thbt} thbt`);detail="Bảo hiểm native: thất bại giữ ba HT, vẫn mất phí và đá bảo hiểm.";}break;
    case "buyHT":
      if(items.length||!MC().lab||!Number.isInteger(args.ht)||args.ht<1||args.ht>=HT_MAX||!Number.isInteger(args.quantity)||args.quantity<1||args.quantity>3)throw Error("Mua1–3HT cấp1–9");
      cost=htBuyCost(args.ht)*args.quantity;detail=`Mua ${args.quantity} HT cấp ${args.ht} theo giá native.`;break;
    case "upgradeOre":{
      if(items.length||!MC().lab||typeof args.key!=="string"||args.key.length>60)throw Error("Khoáng không hợp lệ");
      const o=oreParse(args.key);if(!Number.isInteger(o.place)||o.place<0||o.place>=6||!Number.isInteger(o.lvl)||o.lvl<1||o.lvl>=ORE_MAX||!oreRows(o.a).length||matHave("ore",args.key)<1)throw Error("Cần khoáng cấp1–9 theo bảng native");
      chance=Math.round((1-RCP_R.ore_up.fail[0]/RCP_R.ore_up.fail[1])*100);materials=[`1 khoáng ${args.key}`];detail="Thăng1cấp, cap10; thất bại mất khoáng.";break;
    }
    case "randomForge":{
      const row=RF_MUC.find(x=>x.k===args.key);if(items.length||!MC().rforge||!row||S.inv.length>=INV_MAX)throw Error("Mức rèn không hợp lệ hoặc túi đầy");
      cost=rfCost(row);chance=Math.round(row.ty*100);detail=`Rèn ${row.mo} theo cấp nhân vật/bảng native; thất bại mất phí, không bảo đảm món phù hợp.`;break;
    }
    case "makePlatina":
      if(!MC().platina||items.length!==2||!items.every(canPlatBase)||!samePlatBase(...items))throw Error("Chỉ2.0: hai Hoàng Kim cùng template được phép");
      cost=platCost(PLAT_MAKE.cost.van);chance=PLAT_MAKE.rate;materials=[`${PLAT_MAKE.inputs[1].qty} wc`,`${PLAT_MAKE.inputs[2].qty} mys`];
      if(matHave("misc","wc")<PLAT_MAKE.inputs[1].qty||matHave("misc","mys")<PLAT_MAKE.inputs[2].qty)throw Error("Thiếu vật liệu Bạch Kim");detail="Dùng công thức native, rủi ro mất nguyên liệu theo config; chỉ Bạch Kim2.0.";break;
    case "upgradePlatina":{
      const it=items[0];if(!MC().platina||items.length!==1||it.set?.kind!=="platina"||(it.plv||0)>=PLAT_MAX)throw Error("Chỉ2.0: Bạch Kim chưa đủ +10");
      const u=PLAT_UP[it.plv||0];cost=platCost(u.cost.van);chance=u.rate;materials=[`${u.inputs[0].qty} wc`,`${u.inputs[1].qty} mys`];
      if(matHave("misc","wc")<u.inputs[0].qty||matHave("misc","mys")<u.inputs[1].qty)throw Error("Thiếu vật liệu thăng Bạch Kim");detail="Cap +10; thất bại giữ cấp, mất chi phí native.";break;
    }
    case "combineShards":
      if(items.length||!MC().hk||typeof args.key!=="string"||!Object.hasOwn(SHARD_NEEDS,args.key)||matHave("shard",args.key)<SHARD_NEEDS[args.key]||S.inv.length>=INV_MAX)throw Error("Thiếu mảnh hợp lệ hoặc túi đầy");
      materials=[`${SHARD_NEEDS[args.key]} mảnh ${SHARD_NAMES[args.key]||args.key}`];detail="Ghép Hoàng Kim theo ID template thật; không tạo Bạch Kim.";break;
  }
  if(!Number.isSafeInteger(cost)||cost<0||S.gold<cost)throw Error("Không đủ ngân lượng");
  const baseline=JSON.stringify(S),serialized=JSON.stringify(args);
  return {v:1,id:"wb_"+workbenchHash(baseline+serialized),mode:modeId(),character:S.cid,baseline,args,cost,chance,detail,materials,
    names:items.map(it=>it.n),note:"Không bảo đảm thành công/tiến độ. Kiểm tra lại tài nguyên trước nhận; lỗi lưu giữ kết quả để thử lưu lại."};
}
function workbenchPreview(raw){
  const previous=S;
  try{S=JSON.parse(JSON.stringify(previous));const p=workbenchPreviewCore(raw);p.baseline=JSON.stringify(previous);p.id="wb_"+workbenchHash(p.baseline+JSON.stringify(p.args));return p;}
  finally{S=previous;}
}
function workbenchCommit(pending){
  if(workbenchProblem())return {ok:false,msg:workbenchProblem()};
  if(pending.mode!==modeId()||pending.character!==S.cid||JSON.stringify(S)!==pending.baseline)return {ok:false,msg:"Trạng thái đã thay đổi; không áp dụng giao dịch cũ"};
  const previous=S;S=JSON.parse(JSON.stringify(pending.candidate));
  try{if(!save())throw Error("Không lưu được");}catch{S=previous;WORKBENCH_PENDING=pending;return {ok:false,msg:"Không lưu được; kết quả được giữ để thử lưu lại",pending:true};}
  WORKBENCH_PENDING=null;R.dirty=true;invDirty=true;return {...pending.result,saved:true};
}
function workbenchExecute(preview){
  if(WORKBENCH_BUSY)return {ok:false,msg:"Đang lưu giao dịch"};
  WORKBENCH_BUSY=true;
  try{
    const problem=workbenchProblem();if(problem)throw Error(problem);
    const prior=workbenchState().receipts.find(x=>x.id===preview?.id);if(prior)return {...prior,replayed:true,saved:true};
    if(WORKBENCH_PENDING)return {ok:false,msg:"Thử lưu giao dịch đang giữ trước",pending:true};
    if(!preview||preview.v!==1||preview.baseline!==JSON.stringify(S))throw Error("Preview cũ; hãy xem lại chi phí");
    const fresh=workbenchPreview(preview.args);if(fresh.id!==preview.id)throw Error("Preview không khớp thao tác");
    const previous=S,random=Math.random,recipeRandom=rcRand,dirty=R.dirty,oldInvDirty=invDirty;
    let seed=2166136261;for(const c of fresh.id)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    let candidate,result;
    try{
      S=JSON.parse(JSON.stringify(previous));const auto=S.autoEquip;S.autoEquip=false;
      Math.random=rcRand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const a=fresh.args,items=a.uids.map(uid=>S.inv.find(it=>it.uid===uid));let r;
      switch(a.kind){
        case "recycle":r=fuse(items);break;
        case "enchase":r=enchase(items[0],a.ht,a.key);break;
        case "enhance":{const v=enhanceCore(items[0]);r={ok:v.ok,msg:v.ok?"Cường hóa thành công":"Cường hóa thất bại, mất phí"};break;}
        case "reroll":{
          const it=items[0],n=it.mag.length;S.gold-=fresh.cost;
          it.mag=n<=2?rollMagic(it,[it.lvl-1,it.lvl-2].slice(0,Math.max(1,n)).map(v=>clamp(v,1,10)),R.P?.lucky||0,true):rollMagic(it,magicLevels(n,it.lvl),R.P?.lucky||0);
          delete it.leg;r={ok:true,msg:"Tẩy luyện theo bảng native"};break;
        }
        case "upgradeHT":r=upgradeHT(a.ht,a.insured);break;
        case "buyHT":r=buyHT(a.ht,a.quantity);break;
        case "upgradeOre":r=upgradeOre(a.key);break;
        case "randomForge":r=randomForge(a.key);break;
        case "makePlatina":r=makePlatina(...items);break;
        case "upgradePlatina":r=upgradePlatina(items[0]);break;
        case "combineShards":r=combineShards(a.key);break;
      }
      S.autoEquip=auto;
      if(S.gold<0||!Number.isFinite(S.gold)||S.inv.length>INV_MAX||S.inv.some(it=>!modeItemOk(it,modeId())))throw Error("Kết quả vượt luật tài nguyên/phẩm chất");
      result={id:fresh.id,ok:r.ok===true,msg:String(r.msg||"Đã xử lý công thức").slice(0,300)};
      const p=workbenchState();S.extensions||={v:1};S.extensions.workbench={...p,receipts:[result,...p.receipts].slice(0,32)};candidate=S;
    }finally{S=previous;Math.random=random;rcRand=recipeRandom;R.dirty=dirty;invDirty=oldInvDirty;}
    return workbenchCommit({baseline:fresh.baseline,mode:fresh.mode,character:fresh.character,candidate,result});
  }catch(e){return {ok:false,msg:e.message};}finally{WORKBENCH_BUSY=false;}
}
function workbenchRetry(){return WORKBENCH_PENDING?workbenchCommit(WORKBENCH_PENDING):{ok:false,msg:"Không có giao dịch cần lưu lại"};}
function workbenchDiscard(){WORKBENCH_PENDING=null;return {ok:true,msg:"Đã bỏ kết quả chưa lưu, không tiêu tài nguyên"};}
