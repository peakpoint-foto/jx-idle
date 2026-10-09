import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localD1} from './helpers/d1.js';
import {sha256Hex} from '../src/http.js';
import worker from '../src/index.js';
test('old pre-CAS schema upgrades additively, preserves account/save and migrations can repeat',async t=>{
  const legacy=`
    CREATE TABLE accounts(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,created_at INTEGER NOT NULL,ip_hash TEXT,play_sec REAL NOT NULL DEFAULT 0,last_hb INTEGER,off_t0 INTEGER,off_sec REAL NOT NULL DEFAULT 0);
    CREATE TABLE chars(account_id TEXT PRIMARY KEY,fac TEXT,sex INTEGER,lvl INTEGER NOT NULL DEFAULT 1,xp REAL NOT NULL DEFAULT 0,snapshot TEXT,updated_at INTEGER,sync_n INTEGER NOT NULL DEFAULT 0);
    INSERT INTO accounts(id,token_hash,name,created_at) VALUES('legacy','hash','Legacy',1);
    INSERT INTO chars(account_id,fac,snapshot) VALUES('legacy','shaolin','{"v":1,"mode":"ctc","cid":"c_legacy_character","gold":42}');
  `;
  const DB=await localD1({initialSql:legacy});t.after(()=>DB.close());
  const saved=await DB.prepare('SELECT snapshot,sync_rev,validation_status FROM chars WHERE account_id=?1').bind('legacy').first();
  assert.deepEqual(JSON.parse(saved.snapshot),{v:1,mode:'ctc',cid:'c_legacy_character',gold:42});
  assert.equal(saved.sync_rev,1);assert.equal(saved.validation_status,'verified');
  const migrations=['0001_init','0002_boss_receipts','0003_guild_management','0004_duel_modes','0005_party_lobby','0006_resource_ledger','0007_combat_sessions','0008_player_moderation','0009_player_mutes','0010_room_chat','0011_ranked_seasons','0012_weekly_trial','0013_community_challenge'];
  for(let pass=0;pass<2;pass++)for(const name of migrations){
    const sql=readFileSync(new URL('../../migrations/'+name+'.sql',import.meta.url),'utf8');
    await DB.batch(sql.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s)));
  }
  assert.equal((await DB.prepare('SELECT snapshot FROM chars WHERE account_id=?1').bind('legacy').first()).snapshot,saved.snapshot);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM accounts').first()).n,1);
  for(const table of ['boss_receipts','guild_receipts','duel_meta','friendships','room_invites','lobby_rooms','lobby_members','combat_sessions','session_members','session_actions','session_rewards','player_blocks','player_reports','admin_audit','player_mutes','room_chat','season_meta','season_final','trial_results','challenges','challenge_attempts','challenge_results','trial_recorded'])assert.ok(await DB.prepare('SELECT name FROM sqlite_master WHERE name=?1').bind(table).first());
});
test('release flag rollback preserves local social data, config is mode scoped and re-enable restores access',async t=>{
  const DB=await localD1();t.after(()=>DB.close());const token='local-release-test-token-0123456789';
  await DB.batch([
    DB.prepare("INSERT INTO accounts(id,token_hash,name,created_at) VALUES('local',?1,'Local',1)").bind(await sha256Hex(token)),
    DB.prepare("INSERT INTO chars(account_id,snapshot) VALUES('local',?1)").bind(JSON.stringify({mode:'ctc'})),
    DB.prepare("INSERT INTO friendships(a,b,requester,status,expires_at,created_at) VALUES('local','other','other','accepted',1,1)"),
  ]);
  const req=path=>new Request('https://game.test/api/'+path,{headers:{authorization:'Bearer '+token}});
  const flags={party_lobby:true,duel_modes:true,guild_management:true};
  let response=await worker.fetch(req('friends'),{DB,FEATURE_FLAGS:flags},{});
  assert.equal(response.status,200);
  response=await worker.fetch(req('friends'),{DB,FEATURE_FLAGS:{party_lobby:false}},{});
  assert.equal(response.status,403);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM friendships').first()).n,1);
  response=await worker.fetch(req('friends'),{DB,FEATURE_FLAGS:flags},{});assert.equal(response.status,200);
  const config=await (await worker.fetch(req('config?mode=phlt'),{DB,FEATURE_FLAGS:flags},{})).json();
  assert.equal(config.capabilities.party_lobby,false);assert.equal(config.capabilities.duel_modes,false);
  assert.equal(config.capabilities.guild_management,false);assert.equal(config.v,1);
  response=await worker.fetch(req('config?mode=ctc'),{DB,FEATURE_FLAGS:'malformed'},{});const fallback=await response.json();
  assert.equal(fallback.capabilities.party_lobby,false);assert.equal(fallback.capabilities.guild_online,true);
});
