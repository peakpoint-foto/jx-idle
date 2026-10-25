import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { game } from "./helpers/game.mjs";

const raw = fs.readFileSync(new URL("../data/content/boss_loot.v1.json", import.meta.url), "utf8");
const doc = JSON.parse(raw);

// Validator trong js/content.js phải chấp nhận đúng file đã build.
test("boss loot v1 qua validateBossLoot, không boss trống, tổng tỉ lệ = 10000, pity đúng công thức", () => {
  const g = game();
  assert.equal(g.run("validateBossLoot(JX_CONTENT.bossLoot).version"), "boss-loot-v1");
  assert.equal(g.json("JX_CONTENT.bossLoot.bosses.length"), 16);
  for (const b of doc.bosses) {
    assert.ok(b.common.length > 0, `${b.zone}: common trống`);
    assert.equal(b.common.reduce((s, c) => s + c.weight_permyriad, 0), 10000, `${b.zone}: tổng common`);
    assert.equal(b.set_pool.groups.reduce((s, x) => s + x.share_permyriad, 0), 10000, `${b.zone}: tổng set share`);
    assert.equal(b.set_pool.groups.reduce((s, x) => s + x.records, 0), b.set_pool.records, `${b.zone}: tổng set records`);
    assert.equal(b.pity.boss_kills, Math.ceil(500 / (1 + 0.2 * b.zone_index)), `${b.zone}: pity`);
    assert.deepEqual(b.exclusive, [], `${b.zone}: exclusive phải rỗng`);
    assert.ok(b.pity.basis && b.pity.applies_to, `${b.zone}: pity thiếu basis/applies_to`);
  }
});

// Validator phải từ chối các lỗi mà Bước 2 cam kết không để lọt.
test("validateBossLoot từ chối tổng sai, pity sai, exclusive bịa, thiếu boss", () => {
  const g = game();
  const bad = (mut) => { const d = JSON.parse(raw); mut(d); return JSON.stringify(d); };
  assert.throws(() => g.run(`validateBossLoot(${bad(d => { d.bosses[0].common[0].weight_permyriad += 1; })})`), /tổng phải = 10000/);
  assert.throws(() => g.run(`validateBossLoot(${bad(d => { d.bosses[0].pity.boss_kills = 999; })})`), /pity/);
  assert.throws(() => g.run(`validateBossLoot(${bad(d => { d.bosses[0].exclusive = ["Món bịa"]; })})`), /exclusive/);
  assert.throws(() => g.run(`validateBossLoot(${bad(d => { d.bosses.pop(); })})`), /đúng 16/);
  assert.throws(() => g.run(`validateBossLoot(${bad(d => { d.bosses[1].zone_index = 0; })})`), /zone_index/);
});

// Đối chiếu độc lập với data.js/world.js trong harness (J = JX, W = JW):
// zone + boss + cấp + drop file + trọng số common + pool set + phái suy từ kỹ năng boss.
test("bảng loot đối chiếu đúng JW.zones, JX.drop và JX.sets (không bịa boss/item/phái)", () => {
  const g = game();
  const zones = g.json("W.zones");
  assert.equal(doc.bosses.length, zones.length);
  doc.bosses.forEach((b, i) => {
    const z = zones[i];
    assert.equal(b.zone_id, z.id, `zone_index ${i}: zone_id`);
    assert.equal(b.zone, z.n, `zone_index ${i}: tên vùng`);
    assert.equal(b.level_lo, z.lo, `zone_index ${i}: lo`);
    assert.equal(b.level_hi, z.hi, `zone_index ${i}: hi`);
    assert.equal(b.boss_id, z.boss, `zone_index ${i}: boss_id`);
    const bossName = g.run(`W.mon[String(${z.boss})].n`);
    assert.equal(b.boss, bossName, `zone_index ${i}: tên boss`);
    // Phái suy từ kỹ năng boss có trong factions[].skills; chỉ 3 boss cuối toàn kỹ năng Võ Đang.
    const affinity = g.run(`(() => { const sk = W.mon[String(${z.boss})].sk || []; const fac = {}; for (const f of J.factions) for (const id of f.skills) fac[id] = f.key; const s = new Set(sk.map(id => fac[id]).filter(Boolean)); return s.size === 1 ? [...s][0] : null; })()`);
    assert.equal(b.faction_affinity, affinity, `zone_index ${i}: faction_affinity`);
    // Drop file theo đúng js/loot.js dropFile() ở cấp cuối vùng.
    const dropFile = g.run(`(() => { const L = ${z.hi}; const b = L < 110 ? Math.max(10, Math.min(90, Math.floor(L / 10) * 10)) : L < 119 ? 110 : 119; return "npcdroprate" + b + ".ini"; })()`);
    assert.equal(b.drop_file, dropFile, `zone_index ${i}: drop_file`);
    // Trọng số common: đúng tổng trọng số x[3] theo detail trong drop file, sai số làm tròn <= 1/10000.
    const check = g.run(`(() => { const df = J.drop["${dropFile}"]; const rows = df.items.filter(x => x[0] === 0 && x[1] <= 9); const tot = rows.reduce((s, x) => s + x[3], 0); const by = {}; for (const x of rows) { by[x[1]] = by[x[1]] || { rows: 0, w: 0 }; by[x[1]].rows++; by[x[1]].w += x[3]; } return { tot, by }; })()`);
    for (const c of b.common) {
      const ref = check.by[String(c.detail)];
      assert.ok(ref, `zone_index ${i}: detail ${c.detail} không có trong drop file`);
      assert.equal(c.rows, ref.rows, `zone_index ${i}: detail ${c.detail} rows`);
      const expect = (ref.w / check.tot) * 10000;
      assert.ok(Math.abs(c.weight_permyriad - expect) <= 1, `zone_index ${i}: detail ${c.detail} weight ${c.weight_permyriad} vs ${expect}`);
    }
    // Pool set: đúng js/sets.js rollSetDrop — req[36] <= hi+2; nhóm Võ Đang đúng req[39] = id phái Võ Đang.
    const setCheck = g.run(`(() => { const reqOf = (r, id) => (r.req.find(q => q[0] === id) || [0, -1])[1]; const gold = J.sets.gold.filter(r => reqOf(r, 36) <= ${z.hi} + 2); const wudId = J.factions.find(f => f.key === "wudang").id; return { total: gold.length, wudang: gold.filter(r => reqOf(r, 39) === wudId).length }; })()`);
    assert.equal(b.set_pool.records, setCheck.total, `zone_index ${i}: set_pool.records`);
    if (b.faction_affinity === "wudang") {
      const w = b.set_pool.groups.find(x => x.faction === "wudang");
      assert.equal(w.records, setCheck.wudang, `zone_index ${i}: nhóm Võ Đang`);
    }
    // Platina: đúng pool ở cap người chơi 180 (req[36] <= 182), không phụ thuộc cấp vùng.
    const plat = g.run(`(() => { const reqOf = (r, id) => (r.req.find(q => q[0] === id) || [0, -1])[1]; return J.sets.platina.filter(r => reqOf(r, 36) <= 182).length; })()`);
    assert.equal(b.platina_conditional.records, plat, `zone_index ${i}: platina records`);
  });
});
