import {GAME} from '../gen/game.js';
import {HttpError} from './http.js';
import {validateChar} from './validate.js';

export const DUEL_RULES=Object.freeze({version:'power-v2',ttl:3*864e5,powerRatio:1.5,pairDaily:3});
export function advancedDuels(env,row){let state;try{state=JSON.parse(row.snapshot);}catch(e){}return !!state&&GAME.featureEnabled('duel_modes',state.mode,env.FEATURE_FLAGS,!!state.sandbox);}
export function duelProfile(row){
  let state;try{state=JSON.parse(row.snapshot);}catch(e){throw new HttpError(403,'snapshot_invalid');}
  if(!state||typeof state!=='object'||state.mode!=='ctc'||state.sandbox||!GAME.FAC[state.fac]||state.fac!==row.fac||state.lvl!==row.lvl||![1,2].includes(state.v))throw new HttpError(403,'snapshot_invalid');
  const previous=GAME.getS();let result;
  try{result=validateChar(state,row.play_sec);}catch(e){throw new HttpError(403,'snapshot_invalid');}finally{GAME.setS(previous);}
  if(result.flags.length||result.pending.length||!Number.isFinite(result.power)||result.power<1)throw new HttpError(403,'snapshot_invalid','Cần đồng bộ snapshot hợp lệ trước khi đấu');
  return {...row,power:result.power,bracket:result.bracket?.k||null};
}
export function checkDuelMatch(a,b,kind){
  if(kind==='ranked'&&(!a.bracket||a.bracket!==b.bracket))throw new HttpError(400,'different_bracket');
  if(kind==='ranked'&&Math.max(a.power,b.power)/Math.max(1,Math.min(a.power,b.power))>DUEL_RULES.powerRatio)throw new HttpError(400,'power_mismatch','Ranked yêu cầu lực chiến không lệch quá 1,5 lần');
}
export function duelFactor(seed,side){let h=2166136261;for(const c of `${seed}:${side}`)h=Math.imul(h^c.charCodeAt(0),16777619);return .9+((h>>>0)%21)/100;}
export function duelOutcome(row){
  const cScore=Math.max(1,Number(row.challenger_power)||1)*duelFactor(row.id,'c'),dScore=Math.max(1,Number(row.defender_power)||1)*duelFactor(row.id,'d');
  const tie=row.rules_version===DUEL_RULES.version&&Math.abs(cScore-dScore)<=1e-9;
  const winner=tie?null:cScore>=dScore?row.challenger_id:row.defender_id;
  return {winner,tie,challenger_score:cScore,defender_score:dScore};
}
