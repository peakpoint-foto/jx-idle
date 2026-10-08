import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from './helpers/game.mjs';
test('guild write retries reuse nonce, distinct commands get new nonce and pending calls cannot race',async()=>{
 const g=game();g.run("fixture('ctc',20);var bodies=[];onlApi=async(path,opt)=>{bodies.push(opt.body);if(bodies.length===1)throw {code:'offline'};return {ok:true}};var command={action:'promote',target_id:'member',guild_id:'guild'}");
 await assert.rejects(g.run('onlGuildWrite(command)'));assert.equal(g.run('ONL.guildBusy'),false);await g.run('onlGuildWrite(command)');
 assert.equal(g.run('bodies[0].request_id'),g.run('bodies[1].request_id'));await g.run("onlGuildWrite({...command,action:'demote'})");assert.notEqual(g.run('bodies[1].request_id'),g.run('bodies[2].request_id'));
 g.run('ONL.guildBusy=true');await assert.rejects(g.run('onlGuildWrite(command)'));assert.equal(g.run('bodies.length'),3);
});
