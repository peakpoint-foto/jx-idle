// Local accounts only. Used by load and real-browser smoke; never a remote DB.
import {GAME} from '../../gen/game.js';
import {sha256Hex} from '../../src/http.js';
import worker from '../../src/index.js';
export async function sessionFixture(DB,count=2){
  const env={DB,FEATURE_FLAGS:{party_lobby:true,party_combat:true,online_economy:true}},players=[];
  for(let i=0;i<count;i++){
    const id='smoke'+i,token='local-session-smoke-token-'+i,fac=['shaolin','emei','wudang','tangmen'][i];
    const main=GAME.FAC[fac].skills.find(id=>GAME.SK[id]?.req<=60&&GAME.SK[id]?.kind!=='passive')||GAME.FAC[fac].skills[0];
    const state={...GAME.newSave(),cid:'c_local_session_smoke_'+i,mode:'ctc',fac,lvl:60,attrPts:295,skPts:58,main,sk:{[main]:1}};
    await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id,await sha256Hex(token),'Smoke'+i,Date.now()),
      DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status) VALUES(?1,?2,?3,?4,60,100,?5,'verified')").bind(id,state.cid,JSON.stringify(state),fac,Date.now())]);
    const call=async(path,body)=>{
      const r=await worker.fetch(new Request('http://game.test/api'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{});
      const d=await r.json();if(!r.ok)throw Object.assign(Error(d.msg||d.error),{code:d.error});return d;
    };
    players.push({id,token,state,call});
  }
  const room=(await players[0].call('/room',{action:'create'})).room;
  for(const p of players.slice(1))await p.call('/room',{action:'join',room_id:room.id});
  for(const p of players)await p.call('/room',{action:'ready',ready:true});
  return {env,players,room};
}
