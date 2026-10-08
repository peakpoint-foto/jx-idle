import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {auditSkillGraph,loadSkillData} from './skill-audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>fs.readFileSync(root+p,'utf8');
const scripts=[...read('index.html').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(scripts).size,scripts.length,'Duplicate classic script');
for(const path of scripts){assert.ok(fs.existsSync(root+path),'Missing '+path);new vm.Script(read(path),{filename:path});}
const before=(a,b)=>assert.ok(scripts.indexOf(a)>=0&&scripts.indexOf(a)<scripts.indexOf(b),a+' must load before '+b);
for(const [a,b] of [
  ['data.js','js/core.js'],['world.js','js/core.js'],['js/core.js','js/skill_graph.js'],['js/skill_graph.js','js/stats.js'],
  ['js/modes.js','js/stats.js'],['js/capabilities.js','js/combat.js'],['js/combat_contract.js','js/combat.js'],
  ['js/combat.js','js/save.js'],['js/save.js','js/save_schema.js'],['js/save_schema.js','js/main.js'],
  ['js/build_profiles.js','js/training.js'],['js/online.js','js/online_lobby.js'],['js/ui.js','js/main.js'],
  ['js/jxorig.js','js/combat_reports.js'],['js/combat_reports.js','js/boss_phases.js'],['js/boss_phases.js','js/expedition.js'],
  ['js/expedition.js','js/expedition_travel.js'],['js/expedition_travel.js','js/expedition_ui.js'],['js/expedition_ui.js','js/expedition_travel_ui.js'],
  ['js/expedition_travel.js','js/expedition_routes.js'],['js/expedition_routes.js','js/expedition_ui.js'],['js/expedition_travel_ui.js','js/expedition_routes_ui.js'],
  ['js/expedition_routes.js','js/expedition_knowledge.js'],['js/expedition_knowledge.js','js/expedition_ui.js'],['js/expedition_routes_ui.js','js/expedition_knowledge_ui.js'],
  ['js/forge.js','js/workbench.js'],['js/auto.js','js/workbench_ui.js'],['js/workbench.js','js/workbench_ui.js'],
  ['js/workbench.js','js/resource_summary.js'],['js/resource_summary.js','js/economy_ui.js'],['js/online.js','js/economy_ui.js'],
])before(a,b);
const workerFiles=read('worker/build-game.mjs').match(/const FILES = \[([\s\S]*?)\];/)[1].match(/"[^"]+"/g).map(x=>JSON.parse(x));
for(const path of workerFiles)assert.ok(scripts.includes(path),'Worker-only gameplay source '+path);
for(const path of ['js/skill_graph.js','js/capabilities.js','js/stats.js','js/combat_contract.js','js/feedback_context.js','js/save_schema.js'])assert.ok(workerFiles.includes(path),'Shared helper absent from Worker '+path);
const {data,sha256}=loadSkillData(),audit=auditSkillGraph(data);
assert.equal(audit.malformed.length,0,'Malformed support link');
assert.equal(sha256,'702f2ae6d09d750d98effd634974e258499af3207bce38e1ffcfeec54784d75e','Skill data changed: review provenance and update baseline explicitly');
assert.deepEqual([audit.total,audit.learnable,audit.existingOutside,audit.missing],[106,76,15,15]);
const backlog=read('docs/AGENT_BACKLOG.md'),todo=read('docs/AGENT_TODO.md'),tasks=new Map();
for(const match of backlog.matchAll(/^### ([A-Z]\d{2}) —[^\n]*\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)){
  const dependency=match[2].match(/phụ thuộc: ([^.\n]+)/);
  assert.ok(dependency,'Missing dependencies '+match[1]);
  tasks.set(match[1],dependency[1]==='none'?[]:dependency[1].split(',').map(x=>x.trim()));
}
assert.equal(tasks.size,43,'Backlog task count');
const visited=new Set(),visiting=new Set();
function visit(id){assert.ok(tasks.has(id),'Unknown dependency '+id);assert.ok(!visiting.has(id),'Dependency cycle '+id);if(visited.has(id))return;visiting.add(id);for(const dep of tasks.get(id))visit(dep);visiting.delete(id);visited.add(id);}
for(const id of tasks.keys())visit(id);
const rows=[...todo.matchAll(/^- \[([ x])\] \*\*([A-Z]\d{2})\*\*/gm)],ids=rows.map(m=>m[2]),done=new Set(rows.filter(m=>m[1]==='x').map(m=>m[2]));
assert.equal(ids.length,43);assert.equal(new Set(ids).size,43);
for(const id of ids)assert.ok(tasks.has(id),'Unknown TODO '+id);
for(const id of done)for(const dep of tasks.get(id))assert.ok(done.has(dep),'Completed '+id+' depends on unfinished '+dep);
const assetIgnore=read('.assetsignore');
for(const path of ['worker/**','test/**','migrations/**','.github/**','scripts/**','docs/**'])assert.ok(assetIgnore.split('\n').includes(path),'Development files may ship as assets: '+path);
console.log('Contracts: '+scripts.length+' scripts, shared helpers, skill provenance and '+tasks.size+' acyclic tasks ('+done.size+' done).');
