"use strict";

function lootCodex(level=S.lvl) {
  if(!featureEnabled("loot_codex"))throw new Error("Cẩm nang nguồn rơi chưa mở");
  if(!Number.isInteger(level)||level<1||level>MAX_LEVEL)throw new Error("Cấp mục tiêu không hợp lệ");
  const effective=Math.min(level,S.lvl+DROP_OVER),file=dropFile(effective),config=MC();
  const groups=[...new Set(file.items.filter(row=>row[0]===0&&row[1]<=9&&row[3]>0).map(row=>DETAIL_SLOT[row[1]]))];
  const sources=[{id:"monsters",name:"Quái thường / tinh anh / boss",rarities:[0,1,2].filter(r=>r<=config.rarMax),
    detail:`Bảng drop cấp ${effective}; nhóm: ${groups.map(slot=>SLOT_VI[slot]||slot).join(", ")}. Tier ${file.main.MinItemLevel||1}–${file.main.MaxItemLevel||10}; chất lượng còn phụ thuộc cấp, may mắn và loại quái.`,reference:"J.drop + dropFile/rollDrops0/magicCount"},
    {id:"reward",name:"Rương Phúc Duyên",rarities:[1,2].filter(r=>r<=config.rarMax),detail:`Chi phí ${FD_COST} Phúc Duyên; có ${FD_TABLE.filter(row=>row[1].item).length} loại kết quả trang bị trong bảng thưởng, không bảo đảm ra đồ.`,reference:"FD_TABLE + grant"}];
  if(config.hk&&J.sets.gold?.length)sources.push({id:"gold",name:"Trùm và mảnh Hoàng Kim",rarities:[4],detail:`Cấp yêu cầu ${HK_MIN_LV}; điều kiện nhận đồ trùm hiện ${hkHard()?"đã đạt":"chưa đạt (kiểm tra cấp/độ khó)"}. Ghép mảnh theo ${Object.keys(SHARD_NEEDS).length} công thức item.`,reference:"hkHard/rwOnKill + REF.shardNeeds"});
  if(config.vio&&config.lab&&RCP_R.violet_fuse)sources.push({id:"violet",name:"Hợp và khảm Tím",rarities:[3],detail:`Hợp ${RCP_R.violet_fuse.inputs[0].qty||3} món đúng nhóm nguyên liệu; chi phí ${fmt(fuseCost())} lượng, tối đa ${VIO_SLOTS} dòng khảm. Preview công thức trước khi tiêu đồ.`,reference:"RCP.recipes.violet_fuse + enchase"});
  if(config.platina&&PLAT_MAKE)sources.push({id:"platina",name:"Chế Bạch Kim",rarities:[5],detail:`Chỉ các cặp template có trong config; cần hai món cùng refId, vật liệu và ${fmt(platCost(PLAT_MAKE.cost.van))} lượng. Không phải nguồn rơi quái thường.`,reference:"RCP.recipes.platina_make + makePlatina"});
  return {mode:modeId(),level,effective,sources,rarityCap:config.rarMax,note:"Nguồn và điều kiện từ config hiện tại; không suy ra xác suất item cụ thể từ trọng số bảng."};
}
function lootWishlistPreview(raw) {
  if(!featureEnabled("loot_codex"))throw new Error("Wishlist chưa mở");
  if(!raw||!Array.isArray(raw.rules)||raw.rules.length>8||!raw.rules.length||!['any','all'].includes(raw.ruleMode)||
    !Number.isInteger(raw.minRar)||raw.minRar<0||raw.minRar>MC().rarMax||
    raw.rules.some(r=>!r||!Object.hasOwn(LOOT_RULE_NAMES,r.attr)||!Number.isFinite(r.min)||r.min<=0||r.min>1e5))throw new Error("Tiêu chí wishlist không hợp lệ với mode");
  const filter=normalizeLootFilter({...raw,minLvl:1,wearableOnly:true,activeOnly:raw.activeOnly===true,auto:true,pickMode:"filter"});
  return {v:1,mode:modeId(),fac:S.fac,filter};
}
function lootWishlistSave(raw) {
  if(SAVE_LOCK||ADMV.sandbox)return buildResult(["Không lưu wishlist trong phiên bị khóa/thử nghiệm"]);
  if(S.extensions?.lootWishlist&&S.extensions.lootWishlist.v!==1)return buildResult(["Phiên bản wishlist mới hơn chưa hỗ trợ"]);
  const wishlist=lootWishlistPreview(raw),candidate=JSON.parse(JSON.stringify(S));candidate.extensions||={v:1};candidate.extensions.lootWishlist=wishlist;return buildPersist(candidate);
}
function lootWishlistApply() {
  if(SAVE_LOCK||ADMV.sandbox)return buildResult(["Không áp dụng wishlist trong phiên bị khóa/thử nghiệm"]);
  const saved=S.extensions?.lootWishlist;
  if(saved?.v!==1||saved.mode!==modeId()||saved.fac!==S.fac)return buildResult(["Wishlist cũ hoặc khác mode/phái; hãy tạo lại"]);
  const validated=lootWishlistPreview(saved.filter),candidate=JSON.parse(JSON.stringify(S));candidate.lootF=validated.filter;return buildPersist(candidate);
}
function lootWishlistForGoal(goal) {
  if(!BUILD_GOALS[modeId()]?.[goal])throw new Error("Mục tiêu không có trong mode");
  const attrs=goal==="survival"?["lifemax_v","allres_p"]:goal==="mana"?["manamax_v","manareplenish_v"]:["allskill_v","skill_enhance"];
  return {minRar:1,ruleMode:"any",activeOnly:true,rules:attrs.map(attr=>({attr,min:1}))};
}
