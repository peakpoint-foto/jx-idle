import test from 'node:test';
import assert from 'node:assert/strict';
import {localD1} from './helpers/d1.js';
import {GAME} from '../gen/game.js';
import {sha256Hex} from '../src/http.js';
import {season, seasonInfo, seasonOf, SEASON_RULES} from '../src/seasons.js';

const DAY = 864e5, SEASON_MS = 28 * DAY, CUR = 700, PREV = 699, curStart = CUR * SEASON_MS;
async function fixture(t, {at = curStart + 3 * DAY, flags = {ranked_seasons: true}} = {}) {
  const DB = await localD1(); t.after(() => DB.close());
  const realNow = Date.now; let now = at; Date.now = () => now; t.after(() => { Date.now = realNow; });
  const env = {DB, FEATURE_FLAGS: flags}, people = {};
  async function add(key, {fac = 'shaolin', bracket = 'so', mode = 'ctc', sandbox = 0, flagged = 0, status = 'verified', synced = curStart - 5 * DAY, name} = {}) {
    const id = 'season_' + key, token = 'local-season-token-0123456789-' + key, state = {...GAME.newSave(), cid: 'c_season_' + key, mode, fac, lvl: 60, sandbox};
    await DB.batch([
      DB.prepare('INSERT INTO accounts(id,token_hash,name,created_at,play_sec) VALUES(?1,?2,?3,?4,10000000)').bind(id, await sha256Hex(token), name || 'Season' + key, now),
      DB.prepare('INSERT INTO chars(account_id,character_id,snapshot,fac,lvl,power,updated_at,validation_status,bracket,flagged) VALUES(?1,?2,?3,?4,60,100,?5,?6,?7,?8)')
        .bind(id, state.cid, JSON.stringify(state), fac, synced, status, bracket, flagged)]);
    const req = (method) => new Request('https://game.test/api/season', {method, headers: {authorization: 'Bearer ' + token}});
    return people[key] = {id, get: () => season(req('GET'), env), post: body => season(req('POST'), env, body)};
  }
  const score = (key, weekOffset, points, wins, base = PREV) => DB.prepare('INSERT INTO duel_scores(account_id,season,points,wins,losses) VALUES(?1,?2,?3,?4,0) ON CONFLICT(account_id,season) DO UPDATE SET points=excluded.points,wins=excluded.wins')
    .bind('season_' + key, String(base * 4 + weekOffset), points, wins).run();
  return {DB, env, add, score, people, tick: ms => { now += ms; }, setNow: v => { now = v; }, now: () => now};
}
async function populate(f) {
  for (const k of ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']) await f.add(k);
  await f.add('flag', {flagged: 1, status: 'flagged'}); await f.add('other', {fac: 'emei'});
  await f.add('g2', {mode: 'g2'}); await f.add('sbx', {sandbox: 1}); await f.add('stale', {synced: curStart - 40 * DAY});
  // p0 splits points over two weekly seasons; p1 and p2 tie on points and wins; p5 is under the minimum.
  await f.score('p0', 0, 20, 7); await f.score('p0', 3, 10, 3);
  await f.score('p1', 1, 24, 8); await f.score('p2', 2, 24, 8); await f.score('p3', 0, 15, 5); await f.score('p4', 1, 6, 2); await f.score('p5', 0, 2, 1);
  for (const k of ['flag', 'g2', 'sbx', 'stale']) await f.score(k, 0, 100, 30);
  await f.score('other', 0, 50, 17);
}
test('ranked season is four weekly duel seasons with explicit UTC bounds', () => {
  const info = seasonInfo(CUR);
  assert.equal(info.start, curStart); assert.equal(info.end - info.start, 28 * DAY);
  assert.equal(info.first_week, CUR * 4); assert.equal(info.last_week, CUR * 4 + 3);
  assert.equal(seasonOf(curStart).index, CUR); assert.equal(seasonOf(curStart - 1).index, PREV); assert.equal(seasonOf(info.end).index, CUR + 1);
  assert.equal(new Date(curStart).getUTCDay(), 4, 'seasons start on Thursday 00:00 UTC');
  assert.equal(SEASON_RULES.titles.length, 4);
});
test('feature flag, mode, sandbox and lock guards', async t => {
  const off = await fixture(t, {flags: {}}); const a = await off.add('a');
  await assert.rejects(() => a.get(), {code: 'feature_disabled'});
  const on = await fixture(t);
  const g2 = await on.add('g2', {mode: 'g2'}), sbx = await on.add('sbx', {sandbox: 1}), flagged = await on.add('f', {flagged: 1, status: 'flagged'}), stale = await on.add('s', {synced: curStart - 40 * DAY});
  await assert.rejects(() => g2.get(), {code: 'feature_disabled'}); await assert.rejects(() => sbx.get(), {code: 'feature_disabled'});
  await assert.rejects(() => flagged.get(), {code: 'season_locked'}); await assert.rejects(() => stale.get(), {code: 'season_locked'});
});
test('freeze ranks per faction and bracket with shared ties and excludes ineligible characters', async t => {
  const f = await fixture(t); await populate(f);
  const [v0, v1] = await Promise.all([f.people.p0.get(), f.people.p1.get()]);
  const rows = (await f.DB.prepare('SELECT account_id,placement,group_size,title,points,wins FROM season_final WHERE season_idx=?1 ORDER BY placement,account_id').bind(PREV).all()).results;
  assert.deepEqual(rows.map(r => [r.account_id.slice(7), r.placement, r.group_size, r.title, r.points]), [
    ['other', 1, 1, 'contender', 50], ['p0', 1, 5, 'champion', 30], ['p1', 2, 5, 'top3', 24], ['p2', 2, 5, 'top3', 24], ['p3', 4, 5, 'top10', 15], ['p4', 5, 5, 'top10', 6]]);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM season_meta').first()).n, 1, 'concurrent first reads freeze once');
  const mine = v0.claims.find(c => c.season === PREV);
  assert.equal(mine.title, 'champion'); assert.equal(mine.claimed_at, null); assert.equal(mine.claim_open, true);
  assert.deepEqual(mine.board.map(b => [b.placement, b.name]), [[1, 'Seasonp0'], [2, 'Seasonp1'], [2, 'Seasonp2'], [4, 'Seasonp3'], [5, 'Seasonp4']]);
  assert.ok(mine.board.find(b => b.name === 'Seasonp0').me); assert.equal(v1.claims[0].title, 'top3');
  assert.equal(v0.claims[0].deadline, undefined); assert.equal(v0.claims[0].claim_deadline, curStart + DAY + 28 * DAY);
  const under = await f.people.p5.get(); assert.deepEqual(under.claims, [], 'under the minimum points earns no title');
});
test('claim is idempotent, concurrent-safe, bounded by the cutoff and window, and writes no resources', async t => {
  const f = await fixture(t, {at: curStart + 12 * 3600e3}); await populate(f);
  await assert.rejects(() => f.people.p0.post({action: 'claim', season: PREV}), {code: 'season_not_final'});
  assert.deepEqual((await f.people.p0.get()).claims, [], 'nothing is frozen before the cutoff');
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM season_meta WHERE season_idx=?1').bind(PREV).first()).n, 0, 'the season is not frozen before its cutoff');
  f.setNow(curStart + DAY + 1);
  const [a, b] = await Promise.all([f.people.p0.post({action: 'claim', season: PREV}), f.people.p0.post({action: 'claim', season: PREV})]);
  assert.equal(a.receipt.title, 'champion'); assert.equal(a.receipt.claimed_at, b.receipt.claimed_at); const first = a.receipt.claimed_at;
  f.tick(10 * DAY); assert.equal((await f.people.p0.post({action: 'claim', season: PREV})).receipt.claimed_at, first, 'a retry returns the original receipt');
  assert.equal((await f.people.p0.get()).titles[0].title, 'champion');
  await assert.rejects(() => f.people.p5.post({action: 'claim', season: PREV}), {code: 'season_no_title'});
  await assert.rejects(() => f.people.p0.post({action: 'claim', season: CUR}), {code: 'bad_season'});
  await assert.rejects(() => f.people.p0.post({action: 'claim', season: '699'}), {code: 'bad_season'});
  await assert.rejects(() => f.people.p0.post({action: 'claim', season: PREV, reward: 999}), {code: 'bad_season_action'});
  await assert.rejects(() => f.people.p0.post({action: 'collect', season: PREV}), {code: 'bad_season_action'});
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM resource_ledger').first()).n, 0, 'titles are cosmetic: no ledger writes');
  f.setNow(curStart + DAY + 28 * DAY + 1);
  await f.DB.prepare('UPDATE chars SET updated_at=?1').bind(f.now()).run();
  await assert.rejects(() => f.people.p1.post({action: 'claim', season: PREV}), {code: 'season_claim_expired'});
});
test('a flagged player cannot claim, and finals never change after the freeze', async t => {
  const f = await fixture(t); await populate(f);
  await f.people.p0.get();
  await f.score('p3', 0, 999, 99); await f.score('p5', 1, 500, 50);
  const again = await f.people.p0.get();
  assert.deepEqual(again.claims[0].board.map(b => b.name), ['Seasonp0', 'Seasonp1', 'Seasonp2', 'Seasonp3', 'Seasonp4'], 'late score changes cannot rewrite a frozen season');
  assert.deepEqual((await f.people.p5.get()).claims, []);
  await f.DB.prepare("UPDATE chars SET flagged=1,validation_status='flagged' WHERE account_id='season_p1'").run();
  await assert.rejects(() => f.people.p1.post({action: 'claim', season: PREV}), {code: 'season_locked'});
});
test('live standing needs the minimum points; guild logistics are capped per member and exclude flagged members', async t => {
  const f = await fixture(t); await populate(f);
  await f.DB.prepare("UPDATE chars SET updated_at=?1 WHERE account_id IN ('season_p0','season_p1','season_p2','season_p3')").bind(f.now()).run();
  const cur = (k, off, pts, wins) => f.score(k, off, pts, wins, CUR);
  await cur('p0', 0, 40, 13); await cur('p1', 1, 10, 3); await cur('p2', 0, 2, 1); await cur('p3', 0, 8, 2);
  const live = await f.people.p0.get();
  assert.equal(live.standing.points, 40); assert.equal(live.standing.eligible, true); assert.equal(live.standing.placement, 1);
  assert.deepEqual(live.board.map(b => b.name), ['Seasonp0', 'Seasonp1', 'Seasonp3']);
  assert.equal((await f.people.p2.get()).standing.eligible, false, '2 points is below the 3-point minimum');
  await f.DB.batch([
    f.DB.prepare("INSERT INTO guilds(id,name,owner_id,week,created_at,updated_at) VALUES('gs1','Chiến Bang','season_p0','w1',1,1)"),
    ...['p0', 'p1', 'p2', 'flag'].map(k => f.DB.prepare("INSERT INTO guild_members(guild_id,account_id,role,joined_at,last_seen) VALUES('gs1',?1,'member',1,1)").bind('season_' + k)),
    f.DB.prepare("INSERT INTO session_rewards(session_id,account_id,amount,day,created_at) VALUES('s1','season_p1',1,'d',?1),('s2','season_p1',1,'d',?1),('s3','season_p2',1,'d',?2)").bind(curStart + DAY, curStart - DAY),
  ]);
  await f.score('flag', 0, 500, 100, CUR);
  const g = (await f.people.p0.get()).guild;
  assert.equal(g.name, 'Chiến Bang'); assert.equal(g.cap, 30); assert.equal(g.mine, 30, '40 points are capped at 30');
  const byName = Object.fromEntries(g.members.map(m => [m.name, m.points]));
  assert.deepEqual(byName, {Seasonp0: 30, Seasonp1: 16, Seasonp2: 2}, '10 duel + 2 receipts x3 = 16; out-of-season receipt and flagged member ignored');
  assert.equal(g.total, 48); assert.deepEqual(g.board.map(b => ({...b})), [{name: 'Chiến Bang', total: 48}]);
  assert.equal((await f.people.other.get()).guild, null, 'a player without a guild has no logistics');
});
