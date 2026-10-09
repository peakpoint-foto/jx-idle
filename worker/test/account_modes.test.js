import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {game} from '../../test/helpers/game.mjs';
import {parseSave, accountModeOpen, register, sync, me} from '../src/account.js';
import {ladder, profile} from '../src/ladder.js';
import {season} from '../src/seasons.js';
import {sessions} from '../src/sessions.js';
import {economy} from '../src/economy.js';
import {validateChar, levelCapForTime, minSecForLevel, MODE_TIME_FACTOR} from '../src/validate.js';

const base = (mode, extra = {}) => ({...GAME.newSave(), cid: 'c_modes_' + mode + '_0123456789', mode, fac: 'shaolin', lvl: 20, xp: 5, ...extra});
const req = (method = 'POST', token = null) => new Request('https://game.test/api/x', {method, headers: token ? {authorization: 'Bearer ' + token, 'cf-connecting-ip': '1.2.3.4'} : {'cf-connecting-ip': '1.2.3.4'}});
async function fixture(t, flags = {}) {
  const DB = await localD1(); t.after(() => DB.close());
  const env = {DB, FEATURE_FLAGS: flags};
  const enroll = async (name, mode, extra) => {
    const result = await register(req(), env, {name, save: base(mode, extra)});
    return {...result, token: result.token, sync: (save, more = {}) => sync(req('POST', result.token), env, {save, base_rev: result.sync_rev, ...more})};
  };
  return {DB, env, enroll};
}

test('account modes: CTC always open, PHLT/2.0 only with their own flag, legacy callers stay CTC-only', () => {
  const on = {FEATURE_FLAGS: {online_account_phlt: true}};
  assert.equal(accountModeOpen(null, 'ctc'), true); assert.equal(accountModeOpen({}, 'phlt'), false); assert.equal(accountModeOpen(null, 'phlt'), false);
  assert.equal(accountModeOpen(on, 'phlt'), true); assert.equal(accountModeOpen(on, 'g2'), false, 'one mode flag never opens another mode');
  assert.equal(accountModeOpen({FEATURE_FLAGS: {online_account_g2: true}}, 'g2'), true); assert.equal(accountModeOpen(on, 'nope'), false);
  assert.equal(parseSave(base('ctc'), {FEATURE_FLAGS: {}}).mode, 'ctc');
  assert.throws(() => parseSave(base('phlt'), {FEATURE_FLAGS: {}}), {code: 'mode_not_open'});
  assert.equal(parseSave(base('phlt'), on).mode, 'phlt');
  assert.throws(() => parseSave(base('g2'), on), {code: 'mode_not_open'});
  assert.throws(() => parseSave(base('phlt')), {code: 'not_ctc'}, 'a caller that passes no env fails closed');
  assert.throws(() => parseSave(base('phlt'), null), {code: 'not_ctc'});
  assert.throws(() => parseSave(base('nope'), on), {code: 'not_ctc'});
  assert.throws(() => parseSave(base('phlt', {sandbox: true}), on), {code: 'sandbox_save'});
});
test('register stores the mode, keeps non-CTC characters off the CTC ladder and reports the mode', async t => {
  const f = await fixture(t, {online_account_phlt: true});
  await assert.rejects(() => register(req(), f.env, {name: 'GTwo', save: base('g2')}), {code: 'mode_not_open'});
  const ctc = await f.enroll('CtcPlayer', 'ctc'), phlt = await f.enroll('PhltPlayer', 'phlt');
  assert.equal((await f.DB.prepare('SELECT mode FROM chars WHERE account_id=?1').bind(ctc.id).first()).mode, 'ctc');
  assert.equal((await f.DB.prepare('SELECT mode FROM chars WHERE account_id=?1').bind(phlt.id).first()).mode, 'phlt');
  assert.equal((await me(req('GET', phlt.token), f.env)).char.mode, 'phlt');
  await f.DB.prepare("UPDATE chars SET bracket='so',power=500,lvl=50 WHERE account_id IN (?1,?2)").bind(ctc.id, phlt.id).run();
  const board = await ladder(req('GET'), f.env, null, new URL('https://game.test/api/ladder?b=so'));
  assert.deepEqual(board.rows.map(r => r.name), ['CtcPlayer'], 'only CTC characters are on the public CTC board');
  const p = await profile(req('GET'), f.env, null, new URL('https://game.test/api/profile?name=PhltPlayer'));
  assert.equal(p.mode, 'phlt'); assert.equal(p.ranked, false);
  assert.equal((await profile(req('GET'), f.env, null, new URL('https://game.test/api/profile?name=CtcPlayer'))).ranked, true);
});
test('a character mode is locked: a transferred or edited save cannot move the account between modes', async t => {
  const f = await fixture(t, {online_account_phlt: true, online_account_g2: true});
  const ctc = await f.enroll('LockCtc', 'ctc'), phlt = await f.enroll('LockPhlt', 'phlt');
  await assert.rejects(() => ctc.sync({...base('ctc'), mode: 'g2'}), {code: 'mode_locked'});
  await assert.rejects(() => ctc.sync({...base('ctc'), mode: 'phlt'}), {code: 'mode_locked'});
  await assert.rejects(() => phlt.sync({...base('phlt'), mode: 'ctc'}), {code: 'mode_locked'});
  await assert.rejects(() => phlt.sync({...base('phlt'), mode: 'g2'}), {code: 'mode_locked'});
  assert.equal((await phlt.sync({...base('phlt'), lvl: 21})).ok, true, 'same mode still syncs');
  assert.equal((await f.DB.prepare('SELECT mode,lvl FROM chars WHERE account_id=?1').bind(phlt.id).first()).mode, 'phlt');
  f.env.FEATURE_FLAGS.online_account_phlt = false;
  await assert.rejects(() => phlt.sync({...base('phlt'), lvl: 22}, {base_rev: 3}), {code: 'mode_not_open'});
  assert.equal((await f.DB.prepare('SELECT snapshot FROM chars WHERE account_id=?1').bind(phlt.id).first()).snapshot.includes('"mode":"phlt"'), true, 'closing the flag keeps the stored character');
});
test('PHLT and 2.0 accounts are denied every CTC-only feature, even with those flags on', async t => {
  const f = await fixture(t, {online_account_phlt: true, online_account_g2: true, ranked_seasons: true, party_lobby: true, party_combat: true, online_economy: true});
  const phlt = await f.enroll('DenyPhlt', 'phlt'), g2 = await f.enroll('DenyGtwo', 'g2');
  for (const who of [phlt, g2]) {
    await assert.rejects(() => season(req('GET', who.token), f.env), {code: 'feature_disabled'});
    await assert.rejects(() => economy(req('GET', who.token), f.env), {code: 'feature_disabled'});
  }
  const sessionsFor = who => sessions(req('GET', who.token), f.env, undefined, new URL('https://game.test/api/sessions'));
  await assert.rejects(() => sessionsFor(g2), {code: 'feature_disabled'}, '2.0 sessions exist only as community challenges and need that flag');
  await assert.rejects(() => sessionsFor(phlt), {code: 'feature_disabled'}, 'PHLT sessions need coop_rescue as well');
});
test('time-based level check scales with the mode without loosening CTC', () => {
  // Find a level that needs more than eight hours of CTC play, so the 8x factor of 2.0 is observable.
  let lvl = 90; while (lvl < GAME.MAX_LEVEL && minSecForLevel(lvl) < 8 * 3600 * MODE_TIME_FACTOR.g2) lvl++;
  const sec = Math.ceil(minSecForLevel(lvl) / MODE_TIME_FACTOR.g2) + 1;
  const state = mode => ({...GAME.newSave(), mode, fac: 'shaolin', lvl, xp: 0});
  const levelFlag = mode => validateChar(state(mode), sec).flags.some(f => f[0] === 'level_time');
  assert.ok(levelCapForTime(sec) < lvl && levelCapForTime(sec * MODE_TIME_FACTOR.phlt) < lvl, 'CTC and PHLT timing would flag this level');
  assert.equal(levelFlag('ctc'), true); assert.equal(levelFlag('phlt'), true); assert.equal(levelFlag('g2'), false);
  assert.deepEqual(MODE_TIME_FACTOR, {ctc: 1, phlt: 2, g2: 8});
});
test('mode item caps apply to the right mode, and tampered set items are flagged', () => {
  const make = (mode, kinds) => {
    const g = game(5); g.run(`fixture('${mode}',100);S.fac='shaolin';S.sk={};recalc()`);
    g.run(`for(const kind of ${JSON.stringify(kinds)}){const rows=J.sets[kind];for(let i=0;i<rows.length;i+=211){const it=makeSetItem(kind,rows[i],10);if(it)S.inv.push(it)}}`);
    const state = g.json('S'); return {state, sets: state.inv.filter(i => i.set)};
  };
  const g2 = make('g2', ['gold', 'platina']), phlt = make('phlt', ['gold']);
  const gold = g2.sets.find(i => i.set.kind === 'gold'), platina = g2.sets.find(i => i.set.kind === 'platina'), phltGold = phlt.sets[0];
  assert.ok(gold && platina && phltGold);
  const only = (mode, items) => validateChar({...g2.state, mode, inv: items, eq: {}}, 5e7).flags.map(f => f[0]);
  assert.deepEqual(only('g2', [gold, platina]), []);
  assert.ok(only('phlt', [platina]).includes('item_mode'), 'Platina is above the PHLT cap');
  assert.ok(only('phlt', [gold]).includes('item_mode'), 'an item tagged for 2.0 may not be used in PHLT');
  assert.deepEqual(only('phlt', [phltGold]), [], 'Gold made in PHLT is valid in PHLT');
  assert.ok(only('ctc', [phltGold]).includes('item_mode'), 'Gold sets are above the CTC cap');
  const forged = JSON.parse(JSON.stringify(gold)); forged.mag[0].p[0] = 99999;
  assert.ok(only('g2', [forged]).includes('item_affix'), 'a boosted set line is flagged');
  const base2 = JSON.parse(JSON.stringify(gold)); base2.base[0][2] = 99999; base2.base[0][1] = 99999;
  assert.ok(only('g2', [base2]).includes('item_base'), 'inflated set base stats are flagged');
  const unknown = JSON.parse(JSON.stringify(gold)); unknown.set.sid = 424242;
  assert.ok(only('g2', [unknown]).includes('item_base'), 'a set item with no template is flagged');
  const extra = JSON.parse(JSON.stringify(gold)); extra.mag.push(...extra.mag);
  assert.ok(only('g2', [extra]).includes('item_affix'), 'more lines than the template is flagged');
  const fakeAttr = JSON.parse(JSON.stringify(gold)); fakeAttr.mag[0].a = 99999;
  assert.ok(only('g2', [fakeAttr]).includes('item_affix'), 'an attribute outside the template is flagged');
});
test('the game\'s own generators produce no false flags in any mode (fuzz, deterministic)', () => {
  const totals = {};
  for (const mode of ['ctc', 'phlt', 'g2']) for (const [c, fac] of Object.values(GAME.FAC).entries()) {
    if (c % 3) continue;
    const g = game(11 + c);
    g.run(`fixture('${mode}',${60 + c * 8});S.fac='${fac.key}';S.sk={};S.gold=1e12;recalc()`);
    g.run("for(let i=0;i<120;i++){for(const it of rollDrops({L:Math.min(S.lvl+5,140),cls:i%5?'normal':'elite',bonusDrop:1}))S.inv.push(it)}");
    g.run(`for(const kind of ['gold','platina']){const rows=J.sets[kind]||[];for(let i=${c};i<rows.length;i+=${40 + c}){const it=makeSetItem(kind,rows[i],i%11);if(it)S.inv.push(it)}}`);
    g.run("for(let n=0;n<30;n++){try{randomForge(['thuong','kha','hiem'][n%3])}catch(e){}}");
    g.run("for(let n=0;n<30;n++){try{const d=irnd(0,9),gr=J.items[d];const it=makeItem(d,sexPart(d,pick(gr.list).k),clamp(Math.round(S.lvl/12),1,10),0);if(!it||!sexOk(it))continue;S.inv.push(it);for(let place=0;place<6;place++){for(let tr=0;tr<60;tr++){const pool=orePool(place);const a=pick(pool);const rows=oreRows(a);if(!rows.length)continue;const lvl=irnd(1,rows.length);const key=oreKey(place,a,lvl);matAdd('ht',lvl,1);matAdd('ore',key,1);if(enchase(it,lvl,key).ok)break}}}catch(e){}}");
    const state = g.json('S'), result = validateChar(state, 5e7);
    assert.deepEqual(result.flags, [], `${mode}/${fac.key}`); assert.deepEqual(result.pending, [], `${mode}/${fac.key}`);
    const t = totals[mode] ??= {gold: 0, platina: 0, vio: 0, items: 0};
    for (const it of state.inv) { t.items++; if (it.set?.kind === 'gold') t.gold++; if (it.set?.kind === 'platina') t.platina++; if (it.vio) t.vio++; }
  }
  assert.ok(totals.phlt.gold > 100 && totals.phlt.vio > 10 && totals.phlt.platina === 0, JSON.stringify(totals));
  assert.ok(totals.g2.gold > 100 && totals.g2.platina > 100 && totals.g2.vio > 10, JSON.stringify(totals));
  assert.equal(totals.ctc.gold + totals.ctc.platina + totals.ctc.vio, 0);
});
