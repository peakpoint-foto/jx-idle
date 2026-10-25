import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localD1 } from './helpers/d1.js';
import {
  validateCommunityMilestoneSnapshot, seasonResourceClaimGate,
  ctcSeasonResourceGate, communityMilestoneGate,
} from '../src/season_snapshot.js';

// Ngưỡng fixture CHỈ cho test (minh họa logic đạt/chưa đạt mốc), không phải canon game.
const MILESTONES = [{ id: 'm1', required_total: 1000 }];
const NOW = Date.now();
const good = (over = {}) => ({ version: 'community-snapshot-v1', snapshot_id: 'snap-1', milestone_id: 'm1',
  total: 1200, source: 'server', verified_at: NOW - 1000,
  contributors: [{ account_id: 'a1', amount: 700 }, { account_id: 'a2', amount: 500 }], ...over });

test('snapshot cộng đồng hợp lệ: đạt mốc khi tổng >= ngưỡng, chưa đạt khi tổng < ngưỡng', () => {
  assert.equal(validateCommunityMilestoneSnapshot(good(), MILESTONES, NOW).unlocked, true);
  assert.equal(validateCommunityMilestoneSnapshot(good({ total: 999, contributors: [{ account_id: 'a1', amount: 999 }] }), MILESTONES, NOW).unlocked, false);
  assert.equal(validateCommunityMilestoneSnapshot(good({ contributors: undefined }), MILESTONES, NOW).unlocked, true);
});

test('snapshot từ chối: nguồn client, version lạ, mốc lạ, tổng âm, tổng lệch contributors, thời gian tương lai', () => {
  assert.throws(() => validateCommunityMilestoneSnapshot(good({ source: 'client' }), MILESTONES, NOW), { code: 'snapshot_untrusted_source' });
  assert.throws(() => validateCommunityMilestoneSnapshot(good({ version: 'v9' }), MILESTONES, NOW), { code: 'snapshot_bad_version' });
  assert.throws(() => validateCommunityMilestoneSnapshot(good({ milestone_id: 'nope' }), MILESTONES, NOW), { code: 'snapshot_unknown_milestone' });
  assert.throws(() => validateCommunityMilestoneSnapshot(good({ total: -1 }), MILESTONES, NOW), { code: 'snapshot_bad_total' });
  assert.throws(() => validateCommunityMilestoneSnapshot(good({ total: 1201 }), MILESTONES, NOW), { code: 'snapshot_total_mismatch' });
  assert.throws(() => validateCommunityMilestoneSnapshot(good({ verified_at: NOW + 1000 }), MILESTONES, NOW), { code: 'snapshot_bad_time' });
});

test('cổng thưởng mùa: CTC tài nguyên và mốc cộng đồng đều CHƯA MỞ ở Bước 2', () => {
  assert.deepEqual(ctcSeasonResourceGate(), { open: false, missing: ['sharedCalc', 'validatorExtended', 'd1ClaimTable', 'serverRunIdClaim'] });
  assert.deepEqual(communityMilestoneGate(), { open: false, missing: ['snapshotAggregation', 'milestoneTable', 'claimRoute'] });
  assert.deepEqual(seasonResourceClaimGate({ sharedCalc: true, validatorExtended: true, d1ClaimTable: true, serverRunIdClaim: true }), { open: true, missing: [] });
});

test('migration 0014: đúng 3 bảng + claim một lần + server_run_id duy nhất (local SQLite D1-shape)', async t => {
  const sql = readFileSync(new URL('../../migrations/0014_season_milestones.sql', import.meta.url), 'utf8');
  for (const name of ['season_milestones', 'season_milestone_snapshots', 'season_milestone_claims']) assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS ' + name), name);
  assert.ok(sql.includes('UNIQUE'), 'thiếu UNIQUE server_run_id');
  assert.ok(sql.includes('PRIMARY KEY (account_id, milestone_id)'), 'thiếu PK claim một lần');
  const DB = await localD1({ initialSql: sql }); t.after(() => DB.close());
  await DB.prepare('INSERT INTO season_milestones(milestone_id,mode,required_total,created_at) VALUES(?1,?2,?3,?4)').bind('m1', 'g2', 1000, NOW).run();
  await DB.prepare('INSERT INTO season_milestone_snapshots(snapshot_id,milestone_id,total,source,verified_at) VALUES(?1,?2,?3,?4,?5)').bind('snap-1', 'm1', 1200, 'server', NOW).run();
  const claim = (acc, run) => DB.prepare('INSERT INTO season_milestone_claims(account_id,milestone_id,snapshot_id,server_run_id,claimed_at) VALUES(?1,?2,?3,?4,?5)').bind(acc, 'm1', 'snap-1', run, NOW).run();
  await claim('a1', 'run-1');
  await assert.rejects(() => claim('a1', 'run-2'), 'claim lặp cùng tài khoản+mốc phải lỗi PK');
  await assert.rejects(() => claim('a2', 'run-1'), 'server_run_id tái dùng phải lỗi UNIQUE');
  const row = await DB.prepare('SELECT COUNT(*) n FROM season_milestone_claims').bind().first();
  assert.equal(row.n, 1);
});
