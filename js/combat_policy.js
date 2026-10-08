"use strict";

const COMBAT_POLICIES={ctc:{objective:"Mục tiêu nhiệm vụ",balanced:"Cân bằng"},phlt:{conserve:"Giữ vật tư",balanced:"Cân bằng"},g2:{rotation:"Thử rotation",balanced:"Cân bằng"}};
function combatPolicy() {
  const saved=S.extensions?.combatPolicy;
  if(!featureEnabled("combat_policy")||R.training||saved?.v!==1||saved.mode!==modeId()||!COMBAT_POLICIES[modeId()]?.[saved.profile])return null;
  return {profile:saved.profile,reserveControl:saved.reserveControl===true,
    lifeThreshold:saved.profile==="conserve"?.3:.5,manaMultiplier:saved.profile==="conserve"?1:2,buy:saved.profile!=="conserve"};
}
function combatPolicyReason(action,reason){R.policyReason={action,reason};}
function combatPolicySave(profile,reserveControl) {
  const problem=buildChangeProblem();if(problem)return buildResult([problem]);
  if(!featureEnabled("combat_policy")||!COMBAT_POLICIES[modeId()]?.[profile])return buildResult(["Profile không hợp lệ cho mode"]);
  if(S.extensions?.combatPolicy&&S.extensions.combatPolicy.v!==1)return buildResult(["Phiên bản chính sách mới hơn chưa hỗ trợ"]);
  const candidate=JSON.parse(JSON.stringify(S));candidate.extensions||={v:1};
  candidate.extensions.combatPolicy={v:1,mode:modeId(),profile,reserveControl:!!reserveControl};
  return buildPersist(candidate);
}
function combatPolicyTarget(list) {
  const live=list.filter(e=>e.hp>0),policy=combatPolicy();
  if(!policy||manual())return nearest(live);
  if(policy.profile==="objective") {
    const targets=live.filter(e=>e.objective===true||e.id===R.policyObjectiveId||e.goldBoss||e.cls==="boss");
    if(targets.length){combatPolicyReason("target","Ưu tiên mục tiêu nhiệm vụ/boss còn sống");return nearest(targets);}
  }
  combatPolicyReason("target","Mục tiêu còn sống gần nhất");return nearest(live);
}
{
  const original=pickAttack;
  pickAttack=function(P,hard){
    const policy=combatPolicy();
    if(!policy||manual())return original(P,hard);
    const target=R.policyTarget,skipControl=policy.reserveControl&&target&&(target.stun>0||target.stunImm>0);
    const pool=policy.profile==="rotation"?rotPool(P):[];
    const candidates=pool.length?pool:[P.main];
    const usable=candidates.filter(a=>a.cost<=R.mana&&!(skipControl&&a.stun>0));
    if(!usable.length){combatPolicyReason("attack",skipControl?"Giữ khống chế khi mục tiêu đang choáng/miễn nhiễm":"Thiếu mana, dùng đòn thường");return P.basic;}
    let attack=usable[0];
    if(pool.length){const index=(R.rotI||0)%pool.length;for(let k=0;k<pool.length;k++){const choice=pool[(index+k)%pool.length];if(usable.includes(choice)){attack=choice;R.rotI=(index+k+1)%pool.length;break;}}}
    combatPolicyReason("attack",pool.length?"Rotation có đủ mana":"Chiêu chính có đủ mana");return attack;
  };
  const originalPotion=autoPotion;
  autoPotion=function(dt){
    const policy=combatPolicy();if(!policy||manual())return originalPotion(dt);
    const off=S.potOff;
    // Keep existing HOT ticking exactly once, suppress its automatic purchases.
    try{S.potOff=true;originalPotion(dt);}finally{S.potOff=off;}
    const h=R.hot,P=R.P;if(off||S.chal==="nopot"||R.deadT>0||R.life<=0||R.town)return;
    h.cd=Math.max(0,(h.cd||0)-dt);
    for(const [kind,need] of [["life",R.life<P.life*policy.lifeThreshold],["mana",P.main.cost>0&&R.mana<P.main.cost*policy.manaMultiplier]]) {
      if(!need||h[kind+"T"]>0||h.cd>0||R.potCd?.[kind]>0)continue;
      if(kind==="life"&&S.siege&&typeof siegePotLeft==="function"&&siegePotLeft()<=0){combatPolicyReason("potion","Đã hết quota thuốc công thành");continue;}
      const stock=takeStock(kind),potion=stock||(policy.buy?bestPotion(kind):null);
      if(!potion){combatPolicyReason("potion",policy.buy?"Không đủ vàng hoặc thuốc":"Giữ vật tư: không tự mua thuốc");continue;}
      usePotion(kind,potion,!!stock);h.cd=1;combatPolicyReason("potion",kind==="life"?"HP dưới ngưỡng profile":"Mana dưới ngưỡng chiêu chính");
    }
  };
}
