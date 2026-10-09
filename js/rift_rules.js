"use strict";
const RIFT_RULES=Object.freeze({v:1,version:'rift-v1',stages:5,maxModifiers:5,maxCopies:2,stageSeconds:60});
// Metadata đọc từ data/content/rift_modifiers.v1.json (schema 2.0); behavior trong riftStats key theo id.
// Guard typeof vì file này nạp trước js/content.js ở client (build đã validate).
const RIFT_MODIFIERS=(()=>{
  if(typeof validateRiftModifiers==="function")validateRiftModifiers(JX_CONTENT.riftModifiers);
  return Object.freeze(Object.fromEntries(JX_CONTENT.riftModifiers.modifiers.map(m=>[m.id,Object.freeze({name:m.name,axis:m.axis,note:m.desc})])));
})();
function riftModifiersValid(list){return Array.isArray(list)&&list.length<=5&&list.every(k=>typeof k==='string'&&Object.hasOwn(RIFT_MODIFIERS,k)&&list.filter(x=>x===k).length<=2);}
function riftStats(input,modifiers=[]){
  if(!riftModifiersValid(modifiers))throw Error('Modifier bí cảnh không hợp lệ');
  const p=JSON.parse(JSON.stringify(input));
  for(const key of modifiers){
    if(key==='sustain'){p.life*=1.1;p.regen+=p.life*.01;continue;}
    if(key==='reserve'){p.manaRegen+=p.mana*.01;}
    for(const attack of [p.main,p.basic,...(p.actives||[])]){
      if(key==='tempo'){attack.rate*=1.15;attack.cost*=1.1;}
      if(key==='reserve')attack.cost*=.85;
      if(key==='venom'){const raw=Object.values(attack.parts).reduce((x,y)=>x+y,0);attack.parts.poison=(attack.parts.poison||0)+raw*.12;}
      if(key==='control'){attack.stun=Math.min(80,(attack.stun||0)+10);for(const el of Object.keys(attack.parts))if(el!=='poison')attack.parts[el]*=.95;}
      if(key==='echo'){attack.targets=Math.min(8,(attack.targets||1)+1);for(const el of Object.keys(attack.parts))attack.parts[el]*=.9;}
    }
  }
  return p;
}
function riftChoices(seed,cleared,chosen=[]){
  if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(cleared)||cleared<0||cleared>5||!riftModifiersValid(chosen))throw Error('Luật lựa chọn bí cảnh không hợp lệ');
  const keys=Object.keys(RIFT_MODIFIERS).filter(k=>chosen.filter(x=>x===k).length<2),offset=((seed>>>0)+cleared*3)%keys.length;
  return [0,1,2].map(n=>keys[(offset+n)%keys.length]);
}
{
  const original=calc;
  calc=function(){const p=original.apply(this,arguments);return R.training&&R.riftModifiers?.length&&modeId()==='g2'?riftStats(p,R.riftModifiers):p;};
}
