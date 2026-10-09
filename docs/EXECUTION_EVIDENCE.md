# Evidence thực thi

E03 DONE local — `equipment_playstyles` default-off capability theo mode, dùng chung `calc()` client/Worker. PHLT đạt 2 món cùng bộ Hoàng Kim: +8% regen, +5 điểm kháng poison/cold/light; 2.0 đạt 2 món cùng bộ Bạch Kim: +5% tốc độ đánh, giữ clamp ASPD hiện có. Không áp dụng CTC, sai họ trang bị, hoặc khi flag off. Bonus là passive xác định nên không có proc/cooldown và không sửa DOT tick; kiểm tra unequip trả chỉ số về gốc, mode transfer, cap/flag/family guards. `node --test test/equipment_playstyles.test.mjs` (3/3), `node --test worker/test/equipment_playstyles.test.js` (1/1) xác nhận client/Worker parity, `npm run test:d1` (43/43), `npm run check:contracts` (43 task, 35 done). Flag vẫn tắt mặc định; cần cân bằng gameplay trước khi bật.

Baseline HEAD68124fe, nhánh feat/online-multiplayer. Lệnh mới08/10/2026 (Asia/Saigon) tiếp tục toàn backlog từ27task; hiện30/43 DONE local sau C05/G02/G05. PR https://github.com/peakpoint-foto/jx-idle/pull/19; CI push37764665755/PR37764672297 xanh tại9e54e66. Chưa deploy production. Đoạn checkpoint/historical phía dưới giữ số liệu đúng thời điểm, không thay snapshot mới.

O01 DONE local: `js/field_search.js` bổ sung tìm kỹ năng/vật phẩm và hoạt động khả dụng trong mode hiện tại, `/` mở tìm kiếm toàn cục, skill mở đúng hàng, item đặt từ khóa Hành trang, CTC activities mở đúng tab quà; markup dùng `textContent`, results giới hạn 12 và target ≥44px. Chromium kiểm tra CTC/PHLT/2.0 × 360×800 portrait/800×360 mobile landscape/1280×800 desktop, tay thuận và reduced-motion. `activity_hardening.js` queue tối đa16 receipt CTC, retry tuần tự theo event key idempotent; unit 3/3 và hai client+D1 browser smoke xác minh offline→online nhận một event. Mô phỏng 20 phút (`simulate(300, .25)`) trong cả 9 mode/viewport: 19–59ms, log0 (≤40). Không tuyên bố đo trên thiết bị thật.

C06 DONE local: `party_dungeon` riêng, CTC-only/default-off. Shared session engine có encounter dungeon với kết trận ở 66%/33% boss HP, yêu cầu hai actor khác nhau dùng Guard để phá; contribution control/heal tính từ hành động server-side. Reward không đổi khỏi C05 (merit cap/receipt, không item), roster đóng băng, outsider/late join bị từ chối, leader rời lobby không dừng session, flag-off abort/release, wipe không thưởng và session mới cho retry. Engine tests chạy 10 phái × 2/4; integration xác minh rollback/replay; browser hai context+D1 kiểm tra encounter và touch targets ở 360/1280. Xem [CTC_DUNGEON.md](CTC_DUNGEON.md).

C07 DONE local: `party_siege` CTC-only/default-off thêm objective session với đánh cổng, capture 0–100 (mỗi lệnh tối đa +25), ba tiếp tế hữu hạn hồi đồng đội, và score server tách assault/control/logistics. Capture race qua seq/idempotency + tick/CAS; thắng bằng hạ cổng hoặc capture; reward dùng receipt/cap C05, không tạo shop token/quota mới. D1 integration kiểm tra default-off, race retry, server completion/claim/rollback; browser D1 hai client xác minh UI/score/shared capture/touch. Phạm vi là PvE objective MVP; chưa có đối thủ PvP realtime hay seasonal ladder. Xem [SIEGE_OBJECTIVES.md](SIEGE_OBJECTIVES.md).

C08 DONE local: /api/season dùng weekly UTC index đúng cutoff, leaderboard ranked duel theo faction/bracket hiện đã xác minh, RANK tie giữ đồng hạng. Top10 title được server claim một lần cho mùa vừa đóng; migration 0011 có receipt. Task bang “Tiền tuyến” cộng từ objective contribution của siege session đã hoàn thành, receipt session/account idempotent, cap 50/member/tuần và target 250/guild. UI panel hiển thị rank/title/task, capability CTC-only/default-off. Test SQLite/D1 cover ties, cutoff/rollover, claim retry, disabled/g2 guards, guild dedupe/cap; browser D1 hai client xác minh progress 10/250. Xem [CTC_SEASONS.md](CTC_SEASONS.md).

O03 IN_PROGRESS: migrations 0008–0010 + D1-local moderation APIs/UI and room/guild chat. `/api/chat` checks current membership and per-mode capability, bounds body/rate/read/retention, supports idempotent requests, and filters mute/block in each reader's view. Report cap is 5/account and 20/hashed-IP per day; report text stays admin-only, IP raw value is not persisted. `ADMIN_KEYS` supports per-admin audit actors with fail-closed config; legacy `ADMIN_KEY` remains a single shared actor until environment secret is changed. D1 tests cover IP cap across 21 accounts and distinct admin identities. `npm test` 266/266; `npm run test:d1` 41/41; two-client D1 browser smoke passed moderation, room/guild chat, and offline-to-online activity receipt retry. Remaining: owner review of report/retention operations, configure actual per-admin secrets, remote release gate. Public online stays closed.

O04 local checkpoint at `4cc74d8`: clean Git archive, `npm ci` 40 packages, contracts (102 scripts/43 tasks), 266/266 unit, 41/41 D1, regular skill audit and Chromium six mode/viewport all pass. Additional release contract now runs additive migrations 0001–0010 twice on legacy schema and passes SQLite+D1; must rerun clean archive after committing this test update. Remote staging, host CI result and flag-off rollback remain blocked until a separate staging Worker/D1 and credentials are provisioned.

E05 SPIKE DONE / implementation BLOCKED: [TRADE_ESCROW_ADR.md](TRADE_ESCROW_ADR.md) defines server-owned inventory prerequisites, 1:1 CTC escrow state/receipts, atomic accept/cancel/expiry, fraud/concurrency checks and rollback. No trade endpoint or UI; current client-authored snapshot cannot prove item ownership. Backfill policy and server-owned inventory must precede implementation.

R02 IN_PROGRESS: `js/weekly_tasks.js` provides three selectable mode-specific tasks, mode lock per UTC week, max three reward claims, small atomic local reward, a one-shot seven-day return receipt, weekly forward rollover and backward-clock guard. Unit test 5/5; Chromium browser smoke passes all six mode/viewport scenarios. Actual PHLT expedition checkpoints and G2 rift completion are hooked to progress. Limitations: local clock/save are editable (forward-clock anti-farm needs trusted time per mode); offline return summary is not yet present. Not used as ranked/server reward.

C05 DONE local:250/250 full tests,38/38 D1,6mode/viewport browser regression và demo hai context browser tách storage dùng D1/HTTP thật. Boss thật hoàn thành, lost-ack command retry1row, reload reconnect và mỗi người1receipt khi claim lặp. Party engine parity10phái ×2/4actor, DOT attribution/useful clip; migration0001–0007 lặp2lần. PARTY_SESSIONS.md ghi load120s/2và4người, SQL/rows/bytes/p50/p95 thực đo và budget units; SESSION_TRANSPORT_ADR.md chọn polling1s/D1, ghi rõ chưa đo DO/production. C05 chưa mở PHLT/g2 account hoặc deploy.

G02 DONE local:256/256 full tests,38/38 D1 regression; RIFT.md và6test riêng, bao gồm native5stage completion với build phân bổ điểm hợp lệ và pure stats/damage parity10phái. Browser6mode/viewport kiểm tra UIchoice/native step/pause/resume/exit/assets/touch/flag/mode; không dùng forced kill để chứng minh native full run. Combat/eq/skill/world/shop/quota không bị đổi bởi modifiers sau exit, storage/reload/future guard đã kiểm chứng.

## F01–F07

| Task | Implementation/evidence | Phạm vi kiểm chứng |
|---|---|---|
| F01 | MODE_CONTRACT.md; test/mode_contract.test.mjs | 15 case, ba mode: rarity/provenance/quota/sanitize/sandbox/chuyển mode |
| F02 | SKILL_AUDIT.md; scripts/skill-audit.mjs; js/skill_graph.js; skill_graph tests client/Worker | 106 dòng phân loại; 76 liên kết × 3 mode tăng/rút damage; child không cộng trùng, cap cấp, weapon warning; 15 missing ghi unsupported |
| F03 | js/skill_graph_ui.js; scripts/browser-smoke.mjs | Browser Chromium thực 10 phái × 3 mode × 360/1280 px; mở tab qua navigation, graph có layout, source/target/% và modal; 6 kiểm tra cụ thể ID thiếu/linked modal |
| F04 | COMBAT_CONTRACT.md; js/combat_contract.js; worker/test/combat_contract.test.js | Calc parity 30 fixture; attack parts/HP/mana/kháng/crit/bonus; mitigation/hit/shield parity; DTO damage/overkill/private-field allowlist |
| F05 | SAVE_SCHEMA.md; js/save_schema.js; test/save_schema.test.mjs | 11 case: v2, backup, idempotency, future/extension guard, quota reload, token unlink/storage lỗi/sandbox |
| F06 | ONLINE_INVARIANTS.md; worker/test/online_invariants.test.js | 11 case trên SQLite thực và D1 binding Miniflare/workerd local: CAS/force sync, stale validation, recover/heartbeat, cap phòng/bang, donate, boss receipt/quota/reset/overkill, duel concurrent/retry/timeout/rollback/pending/expiry |
| F07 | CAPABILITIES.md; js/capabilities.js; worker/src/capabilities.js; worker/test/capabilities.test.js | Boolean allowlist, config version/mode, default-off tính năng mới, sandbox và stored-mode guard, handler không chạy khi denied |

## Lệnh kiểm chứng

- npm test: 227/227 pass tại checkpoint tạm dừng, không skipped/todo. Build lại Worker trước test; generated bundle không commit.
- npm run test:d1: 32/32 pass tại checkpoint qua Miniflare/workerd local, không dùng database_id remote. Chạy thêm riêng C05 bằng JX_D1_RUNTIME=1 node --test worker/test/sessions.test.js: 5/5 pass; chưa tích hợp C05 vào lệnh D1 chuẩn. Helper hỗ trợ cả API Miniflare cũ và convertV4MiniflareOptions của phiên bản đang cài.
- node scripts/browser-smoke.mjs: pass; graph width 324 px ở viewport 360, 442 px ở 1280; mỗi mode/viewport xác minh đủ 10 phái. Cần static server 8088 và Chromium CDP 9229 như hướng dẫn trong script.
- npm run audit:skills: report 106 = 76 learnable + 15 child + 15 missing; malformed 0. audit:skills:strict vẫn phải exit 1 do missing, không phải regression test pass.
- git diff --check: không lỗi whitespace ở các thay đổi tracked.

Wrangler dev --local lần trước lỗi ghi cấu hình home khi chỉ đổi log path. O04 đã khởi động lại thành công bằng XDG_CONFIG_HOME=/tmp/jx-idle-wrangler-config cùng WRANGLER_LOG_PATH/tmp và metricsfalse: local8787 index/config HTTP200. Request.cf warning/fallback không ngăn local runtime. Không sửa home hoặc dùng DB remote; không suy ra đã kiểm chứng deploy/staging.

## Không nằm trong nghiệm thu hiện tại

16task chưa nghiệm thu. C05 có backend/shared engine/migration0007 và5case API, chưa có ADR/client UI/demo hai browser/parity/cost, không tính hoàn tất multiplayer. P01–P04 và E02/E04 đã nghiệm thu local: hành trình/đường/tri thức, bàn chế tác nguyên tử, ledger công trạng CTC và summary offline. Donation vàng tự khai vẫn bị khóa; donation công trạng chỉ qua ledger server. Room/duel/boss nền vẫn bất đồng bộ; bí cảnh G02 chưa xây.

Không xác nhận game gốc đã đủ skill/projectile; nguồn gốc 15 ID thiếu vẫn cần bổ sung. Chưa benchmark tải/mạng production, kiểm chứng staging rollout/rollback, moderation hoặc server inventory/escrow. Tất cả tính năng mới ngoài nền vẫn default-off.

## Bước tiếp theo đủ điều kiện

Hiện PAUSED theo lệnh người dùng; các đoạn phía dưới là lịch sử nghiệm thu tại thời điểm từng task, không phải lệnh tiếp tục. Snapshot gần nhất: P03 204tests, P04 208tests, E02 215tests, E04 222tests +32D1cases; browser sáu mode/viewport qua route/knowledge/workbench/local summary/server wallet nonce retry. Chi tiết tại EXPEDITION_ROUTES.md, EXPEDITION_KNOWLEDGE.md, SAFE_WORKBENCH.md, RESOURCE_ECONOMY.md. C05 backend checkpoint có5SQLite cases; kiểm tra lại toàn bộ trước commit được ghi tại SESSION_CHECKPOINT.md sau khi hoàn tất.

O04 phần local: clean source archive /tmp/jx-idle-validation.tBAbLD không .git/node_modules/generated bundle, npm ci--offline từ cache cài40packages với lockfile không đổi; check:contracts79scripts/43acyclic tasks, npm test199/199, D1 runtime28/28, regular audit và Chromium sáu mode/viewport pass. Đây là archive của worktree candidate, chưa phải GitHub clean checkout của commit đã push. 2release tests oldschema/additive repeat và feature rollback; RELEASE_RUNBOOK.md + workflow không tự deploy. O04 còn mở do chưa staging/remote rollout/rollback/host CI; làm tiếp các task độc lập.

P02 hoàn thành local: npm test197/197; 7 case, Chromium sáu mode/viewport native pharmacy fee/finite medicine/rest/canvas circles/retreat hold/receipt/owned-assets/mode denial. EXPEDITION_TRAVEL.md ghi economy experimental, elite-native loot cap6, cost/goldcap, nopot/policy/path/failure/future guards. O04 CI local/release handoff đang triển khai, còn release/staging gate; expedition_travel default-off.

P01 hoàn thành local: npm test190/190; 6 test mới native combat/transitions/death/retry/reload/schema/ground/flags; Chromium sáu mode/viewport prepare/depart/modal pause/rest/withdraw/HUD/touch/world assets và mode denial. EXPEDITION.md ghi zero reward scope P01 và interrupted-on-reload policy. Guard cả thuốc manual/auto và Thổ Địa Phù, restore obstacle/world/camera; recovery không ghi đè ground trước restoreGround. P02 đang triển khai; expedition default-off.

C04 hoàn thành local: npm test184/184, D1 runtime26/26; Chromium sáu mode/viewport roles/ready/leader permissions/offline/input preservation/escaping/touch. PARTY_LOBBY.md ghi migration0005, stale-slot/TTL policy và không combat. P01 đang triển khai; party_lobby default-off.

C03 hoàn thành local: npm test 180/180; D1 runtime 22/22; Chromium sáu mode/viewport kiểm tra CTC friendly selector/match/estimate/tie/escaping/touch và mode denial. DUEL_MODES.md ghi migration0004, legacy rollout, snapshot/model/cap/TTL/season và heuristic scope. Sửa fixture advice ngẫu nhiên thành HP affix hợp lệ cố định, CSS duel44px. C04 đang triển khai; duel_modes default-off.

C02 hoàn thành local: npm test175/175; D1 runtime17/17 (11invariants+4guild+2feedback); browser CTC mobile/desktop manager/member UI, calendar timezone/escaping/touch/mode denial. GUILD_MANAGEMENT.md ghi migration0003, receipts/role races và contribution scope. C03 đang triển khai; guild_management default-off.

C01 hoàn thành local: 5 case và Chromium CTC warning circle/HUD/abort/contribution, mode khác denied; npm test170/170 pass. PHASED_BOSS.md ghi rule v1 và solo/reward scope. O02 thêm D1 runtime Miniflare 2/2 pass. C02 đang triển khai; phased_boss default-off.

O02 hoàn thành local: npm test 165/165 pass; client/server consent/schema/privacy/rate/retention/metrics và browser sáu mode/viewport offline explicit retry. FEEDBACK_DIAGNOSTICS.md ghi giới hạn redaction/lazy retention/webhook. C01 đang triển khai; feedback_diagnostics default-off.

R01 hoàn thành local: 4 case và Chromium sáu mode/viewport; npm test 161/161 pass. CONTEXT_GUIDE.md ghi eligibility và guide namespace mode/phái. O02 đang triển khai; context_guide default-off.

E01 hoàn thành local: 4 case và browser sáu mode/viewport; npm test 157/157 pass. LOOT_CODEX.md mô tả source config và wishlist. R01 đang triển khai. loot_codex default-off.

G03 hoàn thành local: 4 case và browser g2 mobile/desktop/mode denial; npm test 153/153 pass. BUILD_LIBRARY.md ghi schema/recipe/no item import và measurement bounds. E01 đang triển khai. build_library default-off, không tạo dịch vụ chia sẻ external.

B05 đã hoàn thành local: 5 case, Chromium sáu mode/viewport; npm test 149/149 pass. COMBAT_POLICY.md mô tả manual/training bypass, CC/mana/rotation, HOT/cooldown/quota và ngưỡng giữ vật tư PHLT. G03 đang triển khai. combat_policy default-off; không deploy.

B03 đã hoàn thành local: 6 case và browser sáu mode/viewport; npm test 144/144 pass, không skipped/todo. BUILD_ADVICE.md ghi heuristic, hidden-line calc, locks/mode/weapon và apply qua atomic profile validation. B05 đang triển khai. build_advice default-off; không deploy.

Nhận C02 (bang), C03 (duel), P01 (expedition), G02 (bí cảnh). Các task này đã đủ nền nhưng còn phải tự nghiệm thu content/UX/API. O04 có thể làm CI local song song về mặt phụ thuộc, nhưng checkbox release chỉ đóng khi O02 và staging/rollback đủ evidence. Không coi thiếu nguồn mapping là lý do dừng các task độc lập; không mở feature để vượt dependency gate.

## B02 — build profiles

BUILD_PROFILES.md mô tả schema/migration/guard và flag. 10 case mới pass, gồm ba mode roundtrip/reload, thiếu gear, ngân sách sai, locks/rarity/requirements, activity guards, storage rollback/sandbox, legacy/flag-off, đầy túi và không đổi quota/gold. Browser thực sáu mode/viewport bấm Lưu–Xem–Dùng, gear UID và skill khôi phục, preview chưa áp dụng, không overflow; nút 44×44 trở lên. Advanced gear vẫn default-off, không deploy. Võ học legacy được validate và persist an toàn.

Browser smoke bổ sung Network.setCacheDisabled/Page.reload và readiness buildCandidate. Static server cũ có pipe log bị đóng sau đổi turn khiến empty reply; đã khởi động lại server local với log /tmp. Không dùng kết quả cache cũ làm bằng chứng B02. Các kết quả trên là lần chạy lại sau sửa.

## B01 — training lab g2

TRAINING_LAB.md mô tả điều kiện/cadence/seed/sustain/report và state isolation. 8 case pass; tất cả 10 phái chạy, pause/chunk và fractional duration tái lập, zero reward/không đổi live state/storage/RNG, AoE/DOT/overkill/mana/admin normalization. Worker/browser status-tick parity bổ sung vào contract tests. Browser Start/Pause/Retry/flag-off pass cho g2 ở hai viewport, CTC/PHLT không xuất hiện panel. Retry giữ build lúc bắt đầu dù build hiện tại bị thay đổi.

Combat model v2, DOT cuối chỉ tick thời gian còn và enemyAI không đánh sau khi DOT hạ. Không sửa rarity/quota hoặc deploy; training_lab vẫn default-off. B04 đã bổ sung event producer live và tách mana shield/mana-on-hit theo nguồn; báo cáo phòng luyện B01 vẫn dùng net delta theo tài liệu TRAINING_LAB.md.

## B04 — live combat reports

## G01 — so sánh build

BUILD_COMPARISON.md mô tả API/UI và giới hạn bài đo. 3 test mới pass: A/B deterministic và giữ S/R/storage, sandbox write spy/network isolation, thiếu item/bộ trống và mode/flag guard. Chromium g2 360/1280 px chọn current/saved, bấm so sánh, thấy seed/delta và lỗi bộ trống; mode khác không có panel. npm test 138/138 pass; không skipped/todo. UI dùng training_lab default-off. Kết quả runtime không lưu vào archive, không ranked/reward. Chưa benchmark thiết bị thật.

## Chi tiết B04

COMBAT_REPORTS.md mô tả producer, namespace/history/timeline cap và privacy. 12 case pass; browser sáu mode/viewport mở journal → mode summary → export timeline chọn, không mặc định stats/identity. DOT không cộng lúc cast; survival counter không âm; pet nguồn riêng; shield/spend/hit-recover tách; CC ghi alive ticks. Archive tối đa 5, timeline 128, payload history 64 KiB UTF-8. Lethal reason cần event thật; abort không bị gán won, revival có phase. Capture combat_reports default-off, không deploy/network export.
