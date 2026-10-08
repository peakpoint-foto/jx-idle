import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { game } from './helpers/game.mjs';

test('summon drop threshold is 0.05 percent', () => {
  const source = fs.readFileSync(new URL('../js/events.js', import.meta.url), 'utf8');
  assert.equal(Number(source.match(/const SUMMON_P = ([\d.]+)/)[1]), 0.0005);
});

test('CTC ordinary monster drops are yellow at low and high levels', () => {
  const g = game();
  for (const level of [10, 60, 150]) {
    g.run(`fixture('ctc',${level});var drops=[];for(let i=0;i<300;i++)drops.push(...rollDrops({L:${level},cls:'boss'}));`);
    assert.ok(g.run('drops.length') > 0);
    assert.equal(g.run('drops.every(it=>it.r===2)'), true);
  }
});

test('Thiên Vương có đường rơi cả Thương và Chùy hợp lệ', () => {
  const g = game();
  g.run(`fixture('ctc',120);S.fac='tianwang';R.P=calc();var drops=[];for(let i=0;i<5000;i++)drops.push(...rollDrops({L:120,cls:'boss'}));`);
  assert.ok(g.run("drops.some(it=>it.d===0&&it.k===3)"));
  assert.ok(g.run("drops.some(it=>it.d===0&&it.k===4)"));
  assert.equal(g.run("drops.filter(it=>it.d===0&&[3,4].includes(it.k)).every(it=>weaponCode({weapon:it})===FAC.tianwang.wcode)"), true);
});

test('elemental skill affixes roll at most one and legacy items migrate', () => {
  const g = game(); g.run("fixture('ctc',150)");
  assert.equal(g.run(`Array.from({length:300},()=>makeItem(0,0,10,6)).filter(Boolean).every(it=>it.mag.every(m=>!isElementSkillAttr(attrName(m.a))||m.p[0]<=1))`), true);
  g.run(`var oldItem=makeItem(0,0,2,3);oldItem.mag=[{a:J.affix.find(a=>attrName(a.a)==='waterskill_v').a,p:[38,-1,0],pre:0}];S.inv=[oldItem];S=migrate(S);`);
  assert.equal(g.run('S.inv[0].mag[0].p[0]'), 1);
  assert.equal(g.run('S.itemPolicyV'), 1);
});

test('ngưỡng tự bơm HP theo phần trăm và mặc định cũ 50%', () => {
  const g = game();
  g.run("fixture('ctc',60);S.gold=1e9;S.potLifePct=30;R.life=R.P.life*.4;R.hot={life:0,mana:0,lifeT:0,manaT:0};var used0=S.potUsed||0;autoPotion(.1);");
  assert.equal(g.run('S.potUsed||0'), 0);
  g.run("R.life=R.P.life*.2;autoPotion(.1);");
  assert.equal(g.run('S.potUsed||0'), 1);
  g.run("delete S.potLifePct;R.hot={life:0,mana:0,lifeT:0,manaT:0};R.life=R.P.life*.4;autoPotion(.1);");
  assert.equal(g.run('S.potUsed||0'), 2);
});

test('tắt Vượt ải giữ nguyên map sau nhiều vòng luyện công', () => {
  const g = game();
  g.run("fixture('ctc',60);S.stage=10;S.maxStage=10;S.push=false;S.wave=WAVES;R.farm=2;waveCleared();");
  assert.equal(g.run('S.stage'), 10);
  assert.equal(g.run('S.maxStage'), 10);
  assert.equal(g.run('S.push'), false);
});

test('offline gains giữ EXP và giới hạn 8 giờ/12 giờ', () => {
  const g = game();
  g.run("fixture('ctc',60);S.last=Date.now()-59e3;var off=offlineGains();");
  assert.equal(g.run('off'), null);
  g.run("S.last=Date.now()-60e3;off=offlineGains();");
  assert.ok(g.run('off && off.xp > 0'));
  g.run("S.last=Date.now()-20*3600e3;S.offDay={t0:Date.now()-3600e3,secs:8*3600};off=offlineGains();");
  assert.equal(g.run('off.secs'), 4 * 3600);
});
