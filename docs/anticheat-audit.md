# Audit anticheat — Milestone 1 (jx-idle)

**Phạm vi:** Khảo sát hiện trạng (không triển khai Milestone 2).  
**Ngày:** 2026-10-14  
**Mục tiêu dự án:** Máy chủ là nguồn sự thật cho toàn bộ kinh tế; client chỉ gửi **intent**, không gửi **state**.

---

## Tóm tắt điều hành

| Lĩnh vực | Nguồn sự thật hiện tại | Ghi chú |
|----------|------------------------|---------|
| Nhân vật (lvl, xp, attr, sk, eq, inv, mats, gold) | **Client → `localStorage`**, mirror qua `/api/sync` | Server **lưu snapshot** và **validate** (`validateChar`), nhưng **không từ chối** save gian lận — chỉ **gắn cờ** / loại khỏi bảng xếp hạng |
| Kho rương (stash) | **Client `localStorage`** (`jxidle_stash*`) | Không có API server |
| Rơi đồ / combat idle | **Client** (`combat.js`, loot) | Server không biết từng kill/drop |
| EXP / vàng treo máy (offline) | **Client** (`offlineGains` trong `save.js`) | Dựa `S.last` (đồng hồ thiết bị) + mô phỏng local |
| Công trạng online (merit CTC) | **Server** (`resource_ledger`) | Thu từ `boss_receipts` server-side |
| Phần thưởng party/rescue | **Server** (`session_rewards` → ledger) | Combat session server-authoritative |
| Hoạt động CTC (tower/siege/…) quota | **Server** (`activity_events`) | Client **tự báo** `contribution` / `cleared` (có trần) |

**Kết luận:** Kinh tế idle cốt lõi (vàng, đồ, EXP cày map) vẫn **client-authoritative**. Lớp online đã có mảnh ghép tốt (ledger, quota, combat sessions, validate) nhưng **chưa nối** vào inventory/gold idle.

---

## 1. Nguồn sự thật theo lĩnh vực (kèm trích dẫn)

### 1.1 Nhân vật & save game

- **Runtime:** biến global `S` (client).
- **Persist:** `localStorage` qua `save()` / `load()` — khóa `jxidle`, `jxidle_2`, `jxidle_3` (`slotKey()`).
- **Định dạng:** `pack()` / `unpack()` + chữ ký `sigOf` (chống sửa tay **yếu**, secret trong client).
- **Server:** `POST /api/sync` nhận toàn bộ `save: pack(S)` và ghi `chars.snapshot` (`worker/src/account.js`).

```151:192:worker/src/account.js
export async function sync(req, env, body) {
  // ...
  const state = parseSave(body.save, env);
  // ...
  const updated = await env.DB.prepare(q).bind(...binds).first();
  // ...
  const v = await applyValidation(env, acc.id, state, +acc.play_sec || 0, updated.sync_rev);
  return { ok: true, lvl: Math.floor(state.lvl), play_sec: Math.floor(acc.play_sec), sync_rev: updated.sync_rev, ...v };
}
```

- **Giờ chơi (play_sec):** server đo qua heartbeat (`creditTime`), dùng cho validate cấp — **không** ràng buộc trực tiếp vàng/đồ.

```116:133:worker/src/account.js
export function creditTime(acc, now) {
  // ...
  if (gap <= HB_ONLINE_GAP) play += gap;
  else {
    // offline credit trên server (chỉ play_sec, không cấp item/gold)
    const credit = Math.min(OFFLINE_MAX, gap, Math.max(0, OFFLINE_DAY_MAX - offSec));
    offSec += credit;
    play += credit;
  }
  return { play_sec: play, off_t0: offT0 ?? null, off_sec: offSec, last_hb: now };
}
```

**Trạng thái:** Client = sự thật khi chơi; server = bản sao + kiểm định hậu kỳ.

### 1.2 Hành trang, trang bị, nguyên liệu

- Nằm trong `S.inv`, `S.eq`, `S.mats`, `S.ground` → cùng luồng save localStorage.
- `validateChar` kiểm tra **hình dạng** item, trần affix, enh, mode — **không** đối soát số lượng item theo thời gian/map.

```177:186:worker/src/validate.js
export function validateChar(state, playSec) {
  // ...
  for (const [slot, it] of Object.entries(state.eq || {})) if (it) checkItem(it, slot, flags, pending, mode);
  if (!Array.isArray(state.inv)) flags.push(["item_container", "Hành trang không phải danh sách"]);
  else state.inv.forEach((it, i) => checkItem(it, `inv[${i}]`, flags, pending, mode));
  // ...
}
```

**Trạng thái:** Client.

### 1.3 Vàng (`S.gold`)

- Cộng/trừ hoàn toàn client: combat, bán đồ, shop, `grant()` trong `rewards.js`, offline, workbench, stash, v.v.
- Server **merit** CTC (`economy.js`) tách biệt — **không** trừ `S.gold` local.

**Trạng thái:** Client (vàng in-game); server chỉ ledger merit/boss online.

### 1.4 Rơi đồ (drops)

- Sinh trên client khi hạ quái (`combat.js` + loot policy theo mode).
- Không có endpoint “drop report” được server xác nhận cho idle map.
- Party/rescue/trial/challenge: server **simulate** combat (`session_combat.js` + `sessions.js`) — **không** cấp item vào save, chỉ ledger rescue mark / merit.

```71:72:worker/src/sessions.js
    reward,transport:'polling',step_ms:STEP,catchup_max:MAX_CATCHUP,loot_policy:...:'Server merit only; no offline gold/items. ...
```

**Trạng thái:** Idle drops = client; online session = server (không loot item vào save).

### 1.5 EXP & cấp

- Idle: client (`gainXp`, wave, stage trong loop).
- Offline: `offlineGains()` trong `save.js` (logic tham chiếu sau khi format — file gốc 1 dòng minified):
  - Hằng số: `OFFLINE_MAX = 8h`, `OFFLINE_DAY_MAX = 12h` (khớp server `account.js`).
  - Thời gian: `(Date.now() - S.last)` → **đồng hồ thiết bị**.
  - Cập nhật: `S.xp`, `S.gold`, item qua mô phỏng local (~dòng 537–571 bản formatted).
- Server: so `lvl` với `play_sec` qua `levelCapForTime` → cờ `level_time`, **không rollback** snapshot.

```215:217:worker/src/validate.js
  if (effectiveSec != null && lvl > levelCapForTime(effectiveSec))
    flags.push(["level_time", `Cấp ${lvl} sau ${(playSec / 3600).toFixed(1)} giờ chơi (tối đa ${levelCapForTime(effectiveSec)})`]);
```

**Trạng thái:** Client; server chỉ phát hiện bất thường.

### 1.6 Stash (rương)

- Key `jxidle_stash` (+ `_bak`), read/write trong `stash.js` — **100% localStorage**, không sync server.

**Trạng thái:** Client.

---

## 2. Danh mục `localStorage` (client `js/`)

**Tổng:** 92 lần gọi `localStorage.*` trong **21 file** (không tính test/build shim).  
*(Dự án từng ước ~43 / ~10 file — có thể do đếm trước khi thêm telemetry, activity receipts, depth/collections, quick AFK.)*

**Chú thích cột Phân loại:**

| Mã | Ý nghĩa |
|----|---------|
| **ECO** | Ảnh hưởng trực tiếp vàng/đồ/EXP/save nhân vật |
| **ONL** | Token/session online, không nằm trong save pack |
| **META** | Tiến độ xuyên slot (collections, guild local, seal mode) |
| **UI** | Giao diện, không kinh tế |
| **OPS** | Telemetry, feedback, activity receipt queue |
| **DOC** | Chỉ comment (không gọi API) |

### 2.1 `js/save.js` — 19 lần (**ECO**)

| Dòng* | API | Mục đích |
|-------|-----|----------|
| 88 | getItem | Đọc `kps` per-slot (`kpsKey()`) |
| 96 | setItem | Ghi `S.kps` |
| 117–123 | get/set | `save()`: backup `_bak`, ghi `pack(S)`, `SLOT_PTR`, seal |
| 328, 337 | getItem | `slotInfo()` / slot menu |
| 362 | getItem | `pickSlot()` con trỏ slot |
| 375–379 | remove/set | `deleteSlot()` |
| 387 | setItem | `switchCharacter()` → menu |
| 394, 403 | getItem | `load()` primary + backup |
| 500–504 | get/set | `writeSlot()` import slot |

\*Dòng tham chiếu bản **logic** (prettier one-shot); repo ship file **minified 1 dòng** — cùng nội dung.

### 2.2 `js/stash.js` — 5 lần (**ECO**)

| Dòng* | API | Mục đích |
|-------|-----|----------|
| 52, 69 | getItem | `stashRead()` + backup |
| 77–83 | get/set | `stashWrite()` backup + pack stash |

### 2.3 `js/save_schema.js` — 5 lần (**ECO**)

| Dòng | API | Mục đích |
|------|-----|----------|
| 31, 35 | getItem | Migrate slot: đọc save + `_bak` |
| 44 | get/set | Backup `_pre_v2` trước migrate |
| 56 | getItem | Hook `load()` đọc raw |

### 2.4 `js/resource_summary.js` — 1 lần (**ECO** / audit client)

| Dòng | API | Mục đích |
|------|-----|----------|
| 34 | getItem | So sánh save trước/sau để ghi `S.extensions.resourceLedger` (client-only ledger) |

### 2.5 `js/depth.js` — 16 lần (**ECO** + **META**)

| Ngữ cảnh | Phân loại |
|----------|-----------|
| `clanKey()` / `guildKey()` — rep bang/clan local | ECO (buff meta) |
| `collKey()` collections merge backup/corrupt | META (ach cross-slot) |
| Quét `slotKey(i)` gom guild lv/gold max | META |

### 2.6 `js/modes.js` — 2 lần (**META**)

| API | Mục đích |
|-----|----------|
| `sealKey(i)` | Khóa **mode** đã chọn per slot (chống đổi mode trái phép) |

### 2.7 `js/modes_play.js` — 5 lần (**META** + **ECO**)

| Mục đích | Phân loại |
|----------|-----------|
| Merge collections khi chuyển mode | META |
| Merge guild/clan local keys | META |
| `SLOT_PTR` reload | ECO |

### 2.8 `js/online.js` — 3 lần (**ONL**)

| Dòng | API | Mục đích |
|------|-----|----------|
| 11–12 | get/set/remove | Token Bearer `saveKey()+"_online"` |

### 2.9 `js/online_sessions.js` — 2 lần (**ONL**)

| Mục đích |
|----------|
| Lưu `session_id` gắn `cid` cho polling combat |

### 2.10 `js/workflow_rules.js` — 2 lần (**ONL**)

| Mục đích |
|----------|
| `unlinkSlotOnline`: xóa `_online`, `_kps` |

### 2.11 `js/workflow_overrides.js` — 1 lần (**ECO**)

| Dòng 44 | getItem | Đọc save cũ trước workflow override |

### 2.12 `js/activity_hardening.js` — 2 lần (**OPS** → server quota)

| Dòng | API | Mục đích |
|------|-----|----------|
| 110, 118 | get/set | Hàng đợi receipt `activity/claim` (contribution client) |

### 2.13 `js/telemetry.js` — 10 lần (**OPS**)

| Keys | Mục đích |
|------|----------|
| `TELE_META_KEY`, `TELE_OPT_KEY`, `TELE_Q_KEY`, `TELE_NOTICE_KEY` | Cohort, opt-out, queue batch, notice |

### 2.14 `js/feedback.js` — 3 lần (**UI/OPS**)

| Mục đích |
|----------|
| Draft form feedback |

### 2.15 `js/main.js` — 2 lần (**UI**)

| Key `jxidle_ui` | Font size, saver, compact, tay trái/phải |

### 2.16 `js/quick.js` — 4 lần (**UI**)

| Key `jxidle_afk` | Khôi phục prefs khi treo máy UI |

### 2.17 `js/jxshell.js` — 2 lần (**UI**)

| `MINI_KEY` | Mini HUD bật/tắt |

### 2.18 `js/jxorig.js` — 1 lần (**UI**)

| `jxo` | Skin JX original on/off |

### 2.19 `js/build_advice_ui.js` — 3 lần (**UI**)

| `jx_advice_off` | Tắt gợi ý build |

### 2.20 `js/events.js` — 2 lần (**UI**)

| `jx_update_seen` | Modal cập nhật |

### 2.21 `js/ui.js` — 1 lần (**ECO** nhẹ)

| setItem `SLOT_PTR` | Chọn slot từ UI play |

### 2.22 `js/moderation_ui.js` — 0 gọi (**DOC**)

| Dòng 14 | — | Text: admin key **không** lưu localStorage |

### 2.23 Ngoài `js/` (tham khảo, không gameplay)

| File | Ghi chú |
|------|---------|
| `worker/build-game.mjs` | Stub localStorage cho bundle test |
| `test/*.mjs`, `scripts/browser-smoke.mjs` | Test harness |

---

## 3. Hành động server tin dữ liệu client & vector khai thác

### 3.1 `POST /api/sync` — toàn bộ save (**mức độ: critical**)

| Client gửi | Server làm | Khai thác |
|------------|------------|-----------|
| `save` (gold, inv, lvl, xp, …) | Ghi snapshot, `applyValidation` | Sửa localStorage → sync; `force` ghi đè; race 2 tab; spam sync (rate 20/h) |
| `base_rev` | OCC optimistic | Replay cùng rev sau khi admin unflag |

**Mitigation hiện có:** validate item/lvl/points; flag → mất ranked. **Thiếu:** từ chối apply nếu vượt ngân sách thời gian/tài nguyên.

### 3.2 `POST /api/activity/claim` (**high**)

```29:37:worker/src/activity.js
export function validateActivityClaim(body) {
  // ...
  const contribution = integer(body && body.contribution, 0, cap.contribution, "bad_contribution");
  const cleared = integer(body && body.cleared, 0, cap.cleared, "bad_cleared");
```

| Khai thác | Mô tả |
|-----------|--------|
| Payload giả | Gửi `contribution`/`cleared` tối đa cap **không cần chơi** |
| Replay | Cùng `event_key` → duplicate OK; key mới → tốn quota ngày/tuần |
| Race | INSERT quota atomic — ổn |
| Clock | Period UTC server — lách bằng đợi rollover |

Client build packet từ `activity_hardening.js` (kills/cleared local) → **server không simulate tower/siege**.

### 3.3 `POST /api/guild` `boss_attack` (**low–medium**)

- Server **tự tính** `damage = simulateGuildBossAttack(snapshot, week)` — client không gửi damage.
- Khai thác: sync snapshot build ảo (validate bắt item/lvl); replay `request_id` → idempotent; 3 lần/ngày cap.

### 3.4 `POST /api/economy` (**low**)

- `collect`: delta server từ `boss_receipts` — tốt.
- `donate`: client chọn `amount` 1–3 nhưng **trừ ledger** có điều kiện số dư + cap ngày.

### 3.5 `POST /api/sessions` (**low** cho item/gold**)

- Combat state server; chỉ nhận **commands** (seq/tick/kind/target), chống forged fields.
- Reward: ledger merit/rescue — **không** đẩy item vào save.
- Khai thác: bot command hợp lệ; multi-account claim cap.

### 3.6 `POST /api/guild-tech` (**critical nếu bật feature**)

```18:27:worker/src/guild_tech_api.js
    const accountId = req.headers.get('x-account-id') || 'anon';
    // ...
    const r = await guildTechContribute(env.DB, guild_id, accountId, node_id, gold, seasonIdx, nonce);
```

- **`gold` do client gửi**, không trừ snapshot/D1 wallet.
- Auth = header tùy ý → impersonation.
- `quotaClaim` chỉ chống duplicate nonce.

### 3.7 `POST /api/world-boss` (**medium**)

- Damage từ `snapshot.power` (DB từ sync) / 10 — build inflated qua sync + validate gap.
- Rewards text-only trong code — chưa thấy ghi vàng server-side vào save.

### 3.8 `POST /api/mentor` `claim` (**medium**)

- Tạo `mentor_rewards.gold` khi `chars.lvl` milestone (lvl từ **sync client**).
- Claim trả `{ gold }` — cần xác nhận client có cộng vào `S.gold` (nếu có → dup với sync).

### 3.9 Client-only (không API) — **critical cho người chơi offline**

| Hành động | Vector |
|-----------|--------|
| Trade stash ↔ inv | Sửa JSON stash/save |
| Enhance / sell / workbench | `workbenchExecute` local; receipt hash client |
| Offline / AFK | Chỉnh `S.last`, tăng tốc clock, patch `offlineGains` |
| Combat / drops | Sửa RNG, `ADMV`, loot tables |
| `grant()` quest/achievement | Sửa `S.rw.ach` |

---

## 4. Đánh giá mảnh ghép tái sử dụng (Milestone 2)

### 4.1 `worker/src/sessions.js` + migration `0007_combat_sessions`

| Khả năng | Đánh giá |
|----------|----------|
| Combat deterministic server | **Có** — dùng `GAME` + `session_combat.js` |
| Server tính drops idle map | **Chưa** — session không loot item; chỉ ledger |
| Mở rộng | Engine tick + RNG seeded có thể **tách** cho “idle session” per map, tách khỏi party |

### 4.2 `js/session_combat.js`

- Pure functions, versioned rules — **portable** sang worker (đã mirror trong tests).
- `sessionRandom`, wave/boss — mẫu cho server-side drop simulation nếu gắn loot tables từ `GAME`.

### 4.3 `worker/src/quota.js` + `0015_quota.sql`

- INSERT atomic idempotency — **sẵn sàng** cho trade/sell/enhance/transfer intents.
- Pattern: `quotaClaim` + ledger write trong **một batch**.

### 4.4 `0006_resource_ledger` + `economy.js`

- Mẫu **double-entry** theo `(account_id, mode, asset, request_id)`.
- Mở rộng asset: `gold`, `item_uid`, `mat_ht`, … hoặc bảng `inventory_rows` + ledger delta.

### 4.5 `worker/src/validate.js` + `applyValidation`

- Kiểm định snapshot mạnh cho **CTC online**.
- Dùng cho: migration import, sync gate (từ chối nếu `flagged`), anomaly telemetry.
- **Không** thay thế ledger — cần kết hợp cap tài nguyên theo thời gian.

### 4.6 `0014_telemetry` + `worker/src/telemetry.js`

- Bucket allowlist, không PII — phát hiện **shift phân phối** (`gold_total`, `gold_sink_spent`).
- Dùng flag tài khoản khi lệch chuẩn so với server wallet.

### 4.7 `js/activity_hardening.js`

- Receipt queue — **thay** bằng server-verified run hoặc bỏ contribution client khi migrate activity.

---

## 5. Kế hoạch Milestone 2 (ước lượng giờ)

### 5.1 Ledger + intent API (trade / sell / enhance / transfer)

| Công việc | Giờ |
|-----------|-----|
| Schema D1: `player_wallets`, `player_items` (hoặc snapshot shard), mở rộng ledger | 12–16 |
| API intent + `quotaClaim` + batch atomic (pattern `economy.js`) | 16–24 |
| Worker handlers gọi `GAME` cho enhance/sell pricing | 12–16 |
| Client: thay direct mutate → queue intent + reconcile | 20–28 |
| Test integration + race replay | 8–12 |
| **小计** | **68–96 h** |

### 5.2 Chuyển inventory/gold/drops idle lên D1

| Công việc | Giờ |
|-----------|-----|
| Server idle tick: map, stage, kps, time budget (server clock) | 24–32 |
| Drop table server (reuse loot.js logic trong `GAME`) | 16–24 |
| Sync protocol: server snapshot ↓ client render-only | 20–30 |
| Cap per-map/per-minute + anomaly flags | 8–12 |
| **小计** | **68–98 h** |

### 5.3 Idle rewards theo server time + validate + telemetry

| Công việc | Giờ |
|-----------|-----|
| Thay `S.last` offline bằng `accounts.last_hb` / session idle cursor | 12–16 |
| Hook `validateChar` từ chối sync vượt budget (không chỉ flag) | 8–12 |
| Telemetry counters vs server wallet drift | 6–8 |
| **小计** | **26–36 h** |

### 5.4 Migration người chơi hiện có

| Công việc | Giờ |
|-----------|-----|
| Import pipeline: upload save → validate + play_sec cap + clamp resources | 16–24 |
| Queue review accounts over-cap (không import full) | 8–12 |
| UI / comms + admin tooling | 8–12 |
| **小计** | **32–48 h** |

### Tổng Milestone 2 (song song một phần)

| Pha | Giờ (range) |
|-----|-------------|
| 5.1 | 68–96 |
| 5.2 | 68–98 |
| 5.3 | 26–36 |
| 5.4 | 32–48 |
| **Tổng** | **~194–278 h** (1 dev full-stack; giảm ~25% nếu 2 dev tách server/client) |

**Thứ tự đề xuất:** 5.3 (time base) → 5.1 (ledger intents) → 5.2 (drops server) → 5.4 (migration).

---

## 6. Acceptance tests (Milestone 2+)

Các thử nghiệm sau **phải không làm tăng** item hoặc vàng so với server wallet sau reconcile:

| # | Thao tác tấn công | Tiêu chí pass |
|---|-------------------|---------------|
| T1 | Sửa `localStorage` (`jxidle`, `jxidle_stash`) — gold max, thêm item vào `inv` | Sau sync/reconcile: server state unchanged hoặc account flagged; client bị overwrite |
| T2 | Chỉnh đồng hồ thiết bị (+24h) rồi mở game / offline modal | Offline grant = f(server time); không bonus từ clock |
| T3 | Replay cùng `request_id` / `idem_key` (economy donate, boss_attack, activity claim, session claim, mentor claim) | Một lần ghi ledger; lần 2 `duplicate`/`already` |
| T4 | Tamper `activity/claim` packet (`contribution` max, `cleared` max) | Reject hoặc 0 benefit unless server sim matches |
| T5 | Gửi `/api/sync` save dup item (copy uid) | validate `item_*` fail; sync rejected hoặc quarantine |
| T6 | Race: 2 tab `enhance` cùng lúc cùng `request_id` | Một thành công; không dup item |
| T7 | Client forge drop-report (nếu còn endpoint tạm) | Server ignore; chỉ accept server-computed drops |

**Automation gợi ý:** mở rộng `worker/test/online_invariants.test.js`, `economy.test.js`, `quota.test.js`; thêm browser-less script patch `localStorage` rồi gọi API.

---

## 7. Rủi ro & phụ thuộc

- **Gameplay feel:** authoritative idle cần latency thấp hoặc optimistic UI + rollback.
- **Migration:** người chơi over-cap sau nhiều năm local — cần chính sách clamp rõ (không ban hàng loạt).
- **Feature flags:** `guild_tech`, `world_boss` cần audit auth trước khi bật production.
- **Không deploy / migrate prod** trong Milestone 1 (tuân thủ).

---

## 8. Phụ lục: bảng API kinh tế nhanh

| Endpoint | Client state? | Server compute? |
|----------|---------------|-----------------|
| `/api/sync` | **Có (full save)** | Validate only |
| `/api/hb` | Không | play_sec |
| `/api/activity/claim` | contribution/cleared | Quota only |
| `/api/economy` | amount donate | Ledger + boss rows |
| `/api/guild` boss | request_id | Damage sim |
| `/api/sessions` | commands | Combat + ledger |
| `/api/guild-tech` | gold, nonce | **Trust gold** (lỗi) |
| `/api/mentor` claim | milestone, request_id | lvl từ DB snapshot |

---

---

## 9. Bổ sung gói nhỏ (post-M1, PR #25)

### Bật `/api/guild-tech`

| Lớp | Cách bật | Deploy? |
|-----|----------|---------|
| Client UI | `FEATURE_FLAGS` JSON (Wrangler **Variables**, ví dụ `{"guild_tech":true}`) → `/api/config` → `featureEnabled("guild_tech")` | **Không** cần deploy code nếu chỉ đổi biến môi trường |
| Worker route | `assertAccountFeature(..., "guild_tech")` — cùng `FEATURE_FLAGS` | Như trên |
| **Fail-closed mới** | `GUILD_TECH_SERVER_ENABLED=1` (biến Worker riêng) | Dashboard / wrangler vars |

Mặc định API trả **503** dù client flag bật, trừ khi `GUILD_TECH_SERVER_ENABLED=1`. Xem TODO trong `worker/src/guild_tech_api.js`.

### `/api/sync` guard

- `SYNC_GUARD_MODE`: **`log_only`** (mặc định) | `enforce` | `off`
- `log_only`: chấp nhận save, ghi `telemetry_events.event=sync_guard_would_reject` kèm account/deltas/lý do
- `enforce`: HTTP 409 `sync_budget_exceeded`

### Activity & offline

- `activity/claim`: điểm server (`serverActivityScores`), từ chối `activity_score_tamper`
- Offline: `idleNowMs()` / `S.idleClock` neo từ `server_now` (hb/sync)

*Tài liệu gốc Milestone 1; mục 9 mô tả gói triển khai nhỏ trên cùng PR.*
