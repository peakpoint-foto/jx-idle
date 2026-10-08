import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {guild} from '../src/social.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
async function fixture(t){
 const DB=await localD1();t.after(()=>DB.close());const env={DB,FEATURE_FLAGS:{guild_management:true}},players=[];
 for(let i=0;i<4;i++){
  const id='gplayer'+i,token='valid-guild-token-0123456789-'+i,state=Object.assign(GAME.newSave(),{fac:'shaolin',mode:'ctc',lvl:60});
  await DB.batch([DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at) VALUES(?1,?2,?3,?4)').bind(id,await sha256Hex(token),'GuildPlayer'+i,Date.now()),DB.prepare("INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status) VALUES(?1,?2,?3,'shaolin',60,1000,?4,'verified')").bind(id,'guild-character-'+i,JSON.stringify(state),Date.now())]);
  players.push({id,post:body=>guild(new Request('https://game.test/api/guild',{method:'POST',headers:{authorization:'Bearer '+token}}),env,body),get:()=>guild(new Request('https://game.test/api/guild',{headers:{authorization:'Bearer '+token}}),env)});
 }
 const created=await players[0].post({action:'create',name:'Test Guild'}),gid=created.guild.id;
 await players[1].post({action:'join',name:'Test Guild'});await players[2].post({action:'join',name:'Test Guild'});
 return {DB,env,players,gid};
}
test('roles enforce cross-guild permissions and logs/receipts make management retry once',async t=>{
 const {DB,players:p,gid}=await fixture(t);
 await assert.rejects(()=>p[1].post({action:'promote',target_id:p[2].id,request_id:'wrong_role_1'}),{code:'guild_permission'});
 await p[3].post({action:'create',name:'Other Guild'});await assert.rejects(()=>p[0].post({action:'kick',target_id:p[3].id,request_id:'cross_guild_1'}),{code:'guild_permission'});
 const body={action:'promote',target_id:p[1].id,guild_id:gid,request_id:'promote_once_1'};await Promise.all([p[0].post(body),p[0].post(body)]);
 assert.equal((await p[1].get()).guild.role,'officer');assert.equal((await DB.prepare('SELECT COUNT(*) n FROM guild_logs WHERE action=?1').bind('promote').first()).n,1);
 await assert.rejects(()=>p[1].post({action:'kick',target_id:p[0].id,request_id:'kick_owner_1'}),{code:'guild_permission'});
 await p[1].post({action:'kick',target_id:p[2].id,request_id:'kick_member_1'});assert.equal((await p[2].get()).guild,null);
 await assert.rejects(()=>p[0].post({...body,target_id:p[3].id}),{code:'request_id_reused'});
});
test('owner leave/transfer race preserves exactly one owner and sole owner can leave',async t=>{
 const {DB,players:p,gid}=await fixture(t);
 const results=await Promise.allSettled([p[0].post({action:'transfer',target_id:p[1].id,request_id:'transfer_race_1'}),p[0].post({action:'leave',request_id:'leave_race_1'})]);
 assert.ok(results.some(r=>r.status==='fulfilled'));
 const g=await DB.prepare('SELECT owner_id FROM guilds WHERE id=?1').bind(gid).first(),owners=await DB.prepare("SELECT account_id FROM guild_members WHERE guild_id=?1 AND role='owner'").bind(gid).all();
 assert.equal(owners.results.length,1);assert.equal(owners.results[0].account_id,g.owner_id);assert.equal((await p[0].get()).guild,null);
 await p[3].post({action:'create',name:'Solo Guild'});const leave={action:'leave',request_id:'leave_solo_1'};await p[3].post(leave);await p[3].post(leave);assert.equal((await p[3].get()).guild,null);
 assert.equal((await DB.prepare("SELECT COUNT(*) n FROM guilds WHERE name='Solo Guild'").first()).n,0);
});
test('calendar is role guarded, capped and retry/cancel do not duplicate schedule',async t=>{
 const {DB,players:p,gid}=await fixture(t),event={action:'schedule',title:'<script>literal title</script>',activity:'siege',starts_at:Date.now()+3600000,request_id:'event_once_1'};
 await assert.rejects(()=>p[1].post(event),{code:'guild_permission'});await Promise.all([p[0].post(event),p[0].post(event)]);
 let view=await p[0].get();assert.equal(view.calendar.length,1);assert.equal(view.calendar[0].title,event.title);
 const cancel={action:'cancel_event',target_id:view.calendar[0].id,request_id:'cancel_once_1'};await p[0].post(cancel);await p[0].post(cancel);assert.equal((await p[0].get()).calendar.length,0);
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>p[0].post({...event,title:'Event '+i,request_id:'event_cap_'+i})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,10);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM guild_calendar WHERE guild_id=?1 AND cancelled=0').bind(gid).first()).n,10);
});
test('flag off preserves old members and contribution only comes from verified boss receipts',async t=>{
 const {DB,env,players:p}=await fixture(t),before=await DB.prepare('SELECT * FROM guild_members ORDER BY account_id').all();env.FEATURE_FLAGS={};
 await assert.rejects(()=>p[0].post({action:'promote',target_id:p[1].id,request_id:'flag_off_1'}),{code:'feature_disabled'});
 assert.deepEqual((await DB.prepare('SELECT * FROM guild_members ORDER BY account_id').all()).results,before.results);
 const attack=await p[1].post({action:'boss_attack',request_id:'source_receipt_1',damage:1e12,contrib:1e12});
 assert.ok(attack.damage<1e12);assert.equal(attack.guild.weekly_damage,attack.damage);assert.equal(attack.contribution_source,'verified_snapshot_boss_receipts');
 await assert.rejects(()=>p[1].post({action:'donate',amount:1e12}),{code:'donation_disabled'});
});
