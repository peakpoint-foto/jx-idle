import {performance} from 'node:perf_hooks';
import {localD1} from '../worker/test/helpers/d1.js';
import {sessionFixture} from '../worker/test/helpers/session-fixture.js';
const reports=[];
for(const size of [2,4]){
  const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
  const DB=await localD1();let queries=0,rowsRead=0,rowsWritten=0,hasRows=false,measuring=false;
  const record=r=>{if(measuring){queries++;if(r?.meta?.rows_read!=null){hasRows=true;rowsRead+=r.meta.rows_read;rowsWritten+=r.meta.rows_written||0;}}return r;};
  // D1 first() discards metadata; use all() for the same SELECT to retain cost counters.
  const wrap=(stmt)=>({bind:(...a)=>wrap(stmt.bind(...a)),first:async()=>{const r=record(await stmt.all());return r.results[0]||null;},all:async()=>record(await stmt.all()),run:async()=>record(await stmt.run()),raw:stmt});
  const measured={prepare:s=>wrap(DB.prepare(s)),batch:async statements=>(await DB.batch(statements.map(s=>s.raw))).map(record)};
  try{
    const f=await sessionFixture(measured,size),s=(await f.players[0].call('/sessions',{action:'create',id:'load_session_party_'+size})).session;
    // Stress active polling for the full 120-second budget without early boss defeat.
    const row=await DB.prepare('SELECT state FROM combat_sessions WHERE id=?1').bind(s.id).first(),state=JSON.parse(row.state);state.boss.hp=state.boss.max=1e12;
    for(const a of state.actors){a.p.life=a.hp=1e12;a.p.block=100;}
    await DB.prepare('UPDATE combat_sessions SET state=?2 WHERE id=?1').bind(s.id,JSON.stringify(state)).run();
    const latency=[];let bytes=0,tick=0;measuring=true;
    for(let second=1;second<=120;second++){
      clock+=1000;
      for(const p of f.players){const start=performance.now(),d=await p.call('/sessions?id='+s.id);latency.push(performance.now()-start);bytes+=Buffer.byteLength(JSON.stringify(d));tick=d.session.tick;}
    }
    measuring=false;latency.sort((a,b)=>a-b);const requests=latency.length;
    reports.push({runtime:process.env.JX_D1_RUNTIME==='1'?'Miniflare D1 local':'SQLite local',players:size,poll_ms:1000,session_seconds:120,requests,sql_statements:queries,
      d1_rows_read:hasRows?rowsRead:null,d1_rows_written:hasRows?rowsWritten:null,response_bytes:bytes,p50_ms:+latency[Math.floor(requests*.5)].toFixed(2),p95_ms:+latency[Math.floor(requests*.95)].toFixed(2),final_tick:tick,
      estimated_1000_sessions_daily:{requests:requests*1000,sql_statements:queries*1000,response_bytes:bytes*1000},limitations:'Warm local runtime; no WAN latency, edge CPU billing or production price assertion; active-read stress excludes create/commands/claims.'});
  }finally{Date.now=realNow;await DB.close();}
}
console.log(JSON.stringify(reports,null,2));
