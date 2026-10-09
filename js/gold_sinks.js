"use strict";
// Gold sinks có kiểm soát (2.4): ba sink — (a) tẩy luyện dòng affix,
// (b) mở rộng kho theo nấc giá tăng dần, (c) phí đổi loadout/build.
// Mọi sink ghi log + sổ cái (S.rw.goldSinks) + telemetry. Mặc định tắt (flag gold_sinks).

// (a) Seed cam kết trước chống save-scum — seededRng/rerollSeedFor trong js/loot.js
// (loot.js có trong worker bundle nên worker cũng dùng được).

// Sổ cái sink: tổng vàng đã chi theo loại.
function goldSinkLedger() {
  if (!S.rw || typeof S.rw !== "object") S.rw = {};
  if (!S.rw.goldSinks || typeof S.rw.goldSinks !== "object") S.rw.goldSinks = {};
  return S.rw.goldSinks;
}
// Trừ vàng cho sink: trả true nếu đủ và đã trừ.
function goldSinkSpend(sink, cost, label) {
  cost = Math.max(0, Math.round(cost));
  if (S.gold < cost) { toast("Không đủ ngân lượng"); return false; }
  S.gold -= cost;
  const ledger = goldSinkLedger();
  ledger[sink] = (ledger[sink] | 0) + cost;
  if (typeof teleTrack === "function") {
    teleTrack("gold_sink_spent", {sink, amount: teleGoldBucket(cost)});
    teleTrack("gold_total", teleGoldBucket(S.gold));
  }
  if (label) log(`<span class="dim">Đã chi ${fmt(cost)} lượng: ${esc(label)}</span>`);
  R.dirty = true;
  return true;
}

// (c) Phí đổi loadout/build — 0 khi flag tắt.
function loadoutSwitchFee() {
  if (!featureEnabled("gold_sinks")) return 0;
  return Math.round(2000 * Math.pow(1.02, S.lvl));
}

// (b) Mở rộng kho: mỗi nấc +10 ô, tối đa 5 nấc, giá tăng dần.
const STASH_BUY_STEP = 10, STASH_BUY_MAXTIER = 5;
function stashBuyTier() {
  try { return Math.max(0, Math.min(STASH_BUY_MAXTIER, stashRead().st.buyTier | 0)); }
  catch (e) { return 0; }
}
function stashBuyCost(tier) {
  return Math.round(100000 * Math.pow(2.2, tier) * (1 + S.lvl / 50));
}
function stashCap() {
  return (typeof stashMax === "function" ? stashMax() : 60) + STASH_BUY_STEP * stashBuyTier();
}
function stashExpandBuy() {
  const tier = stashBuyTier();
  if (tier >= STASH_BUY_MAXTIER) return {ok: false, msg: "Kho đã mở rộng tối đa"};
  const cost = stashBuyCost(tier);
  return stashTx(st => {
    if (!goldSinkSpend("stash_expand", cost, `mở rộng kho +${STASH_BUY_STEP} ô (nấc ${tier + 1})`)) return {ok: false, msg: "Không đủ ngân lượng"};
    st.buyTier = tier + 1;
    return {ok: true, from: "char", msg: `Đã mở rộng kho lên ${stashCap()} ô`};
  });
}
