"use strict";
// 2.12: Ngã rẽ expedition — mỗi ngày một bản đồ chung (seed theo ngày),
// mỗi ngã rẽ là tradeoff hiển thị trước (an toàn vs hiểm/thưởng cao).
function expeditionDaySeed(dayStr) {
  const d = dayStr || new Date().toISOString().slice(0, 10);
  let h = 2166136261;
  for (const c of `expedition:${d}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
// 3 ngã rẽ, mỗi ngã 2 nhánh. Deterministic theo ngày.
function expeditionDailyForks(dayStr) {
  let s = expeditionDaySeed(dayStr);
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const forks = [];
  const names = [["Rừng", "Đầm"], ["Núi", "Hang"], ["Sông", "Sa mạc"]];
  for (let i = 0; i < 3; i++) {
    const risk = 0.1 + rnd() * 0.25; // 10-35% hiểm thêm
    const reward = 0.15 + rnd() * 0.35; // 15-50% thưởng thêm
    forks.push({
      id: `f${i}`, name: `Ngã rẽ ${i + 1}`,
      branches: [
        {id: `${names[i][0]}`, name: names[i][0], safe: true,
         desc: `An toàn: quái yếu hơn 10%, thưởng chuẩn.`,
         mod: {hp: 0.9, damage: 0.9, gold: 1, loot: 0}},
        {id: `${names[i][1]}`, name: names[i][1], safe: false,
         desc: `Hiểm: quái +${Math.round(risk * 100)}% mạnh, thưởng +${Math.round(reward * 100)}%.`,
         mod: {hp: 1 + risk, damage: 1 + risk, gold: 1 + reward, loot: 1}},
      ],
    });
  }
  return forks;
}
// Modifier tổng từ các nhánh đã chọn.
function expeditionForkMods(chosen) {
  const mod = {hp: 1, damage: 1, gold: 1, loot: 0};
  for (const b of (chosen || [])) {
    if (!b || !b.mod) continue;
    mod.hp *= b.mod.hp; mod.damage *= b.mod.damage;
    mod.gold *= b.mod.gold; mod.loot += b.mod.loot;
  }
  return mod;
}
// Lưu lựa chọn vào expedition state.
function expeditionChooseFork(forkId, branchId, dayStr) {
  const e = expeditionState();
  if (!e || !expeditionActive()) return {ok: false, msg: "Chưa có expedition đang đi"};
  const forks = expeditionDailyForks(dayStr);
  const fork = forks.find(f => f.id === forkId);
  const branch = fork && fork.branches.find(b => b.id === branchId);
  if (!branch) return {ok: false, msg: "Nhánh không hợp lệ"};
  e.travel = e.travel || {};
  e.travel.forks = e.travel.forks || {};
  e.travel.forks[forkId] = {branch: branchId, safe: branch.safe, mod: branch.mod};
  expeditionWrite({travel: e.travel});
  return {ok: true, branch};
}
