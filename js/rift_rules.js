"use strict";
const RIFT_RULES=Object.freeze({v:1,version:'rift-v1',stages:5,maxModifiers:5,maxCopies:2,stageSeconds:60});
const RIFT_MODIFIERS=Object.freeze({
  tempo:{name:'Nhịp liên chiêu',axis:'tốc độ',note:'+15% tốc đánh, +10% mana mỗi chiêu'},
  venom:{name:'Độc mạch',axis:'DOT',note:'Thêm độc bằng12% sát thương đòn; chỉ trong bí cảnh'},
  sustain:{name:'Hồi nguyên',axis:'sinh tồn',note:'+10% HP tối đa, hồi1% HP mỗi giây'},
  reserve:{name:'Tụ khí',axis:'mana',note:'Giảm15% mana mỗi chiêu, hồi thêm1% mana tối đa mỗi giây'},
  control:{name:'Định thân',axis:'khống chế',note:'+10 điểm % choáng (tối đa80%), -5% damage trực tiếp'},
  echo:{name:'Phân ảnh',axis:'đa mục tiêu',note:'+1 mục tiêu (tối đa8), -10% damage mỗi đòn'},
});
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
