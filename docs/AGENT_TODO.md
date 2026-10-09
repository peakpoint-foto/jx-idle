# TODO bàn giao agent — Võ Lâm Idle

Nguồn đặc tả: [AGENT_BACKLOG.md](AGENT_BACKLOG.md). Ngày: 08/10/2026 (Asia/Saigon).
Tiến độ thực thi: 35/43 task đã nghiệm thu local; 8 task còn mở hoặc bị chặn. F02 dùng nhánh unsupported được backlog cho phép, không tuyên bố khôi phục 15 target thiếu. Không ghi nhận mục tiêu 100% hoặc đủ điều kiện public online. Xem [evidence](EXECUTION_EVIDENCE.md) và [mapping còn thiếu](SKILL_AUDIT.md). Các đợt là nhóm phạm vi, không phải cam kết thời gian; phụ thuộc quyết định thứ tự thực tế.

## Trạng thái và cách nhận

**ACTIVE theo lệnh mới ngày09/10/2026 (UTC): tiếp tục từ task 31 đến 43.** C05–C08, O01, E03 đã nghiệm thu local; 35/43 DONE local, 8 task còn mở. Rollout production vẫn cần staging và lệnh deploy riêng.

- `[ ]`: chưa xong. Ghi `IN_PROGRESS` cạnh task khi nhận; vẫn để ô trống.
- `[x]`: đạt toàn bộ nghiệm thu và đã ghi evidence; không dùng cho task chỉ mới viết code.
- `BLOCKED: lý do; phần thiếu; cách tiếp tục`: giữ ô trống. F02 có thể hoàn thành phần resolver/UI và ghi ID unsupported; không coi dữ liệu thiếu đã sửa.
- Mỗi agent ghi nhánh/worktree và file dự kiến ở nhật ký bên dưới trước chỉnh.
- Không nhận task khi phụ thuộc chưa đạt; có thể đọc/spike phần độc lập nhưng không bật tính năng phụ thuộc.
- O04 chia CI local sớm, staging/rollback theo từng đợt; checkbox chỉ đóng khi scope release được bàn giao đầy đủ.

## Danh sách thực thi

### Đợt 0 — khóa luật, sửa nền và xác thực

- [x] **F01** Chốt hợp đồng luật ba mode — P0, shared; phụ thuộc: none. Evidence: MODE_CONTRACT.md và test/mode_contract.test.mjs.
- [x] **F02** Audit và sửa trục bổ trợ kỹ năng — P0, shared; phụ thuộc: F01. Evidence: SKILL_AUDIT.md, production resolver và regression; 15 target ghi unsupported, không remap.
- [x] **F03** Cây kỹ năng và mô tả bổ trợ thật — P0, shared; phụ thuộc: F02. Evidence: js/skill_graph_ui.js, test/skill_graph.test.mjs; Chromium 10 phái × 3 mode × 2 viewport.
- [x] **F04** Hợp đồng combat và tương thích server — P0, shared; phụ thuộc: F01,F02. Evidence: COMBAT_CONTRACT.md, worker/test/combat_contract.test.js; event contract không thay thế server session C05.
- [x] **F05** Save có phiên bản, migration và phục hồi — P0, shared; phụ thuộc: F01. Evidence: SAVE_SCHEMA.md và test/save_schema.test.mjs; session mới phải bổ sung migration/resume trong task tạo session.
- [x] **F06** Gia cố nền online hiện có — P0, ctc; phlt/g2 opt-in sau; phụ thuộc: F01,F04,F05. Evidence: ONLINE_INVARIANTS.md; 11 integration case trên SQLite và D1 runtime local; chưa benchmark production.
- [x] **F07** Capability và feature flags theo mode — P0, shared; phụ thuộc: F01,F04. Evidence: CAPABILITIES.md, worker/test/capabilities.test.js; tính năng mới vẫn tắt.
- [ ] **O04** CI, release flags và rollback — P0 release gate, shared; online theo mode được bật; phụ thuộc: F05,F07,O02. IN_PROGRESS — local clean archive: contracts, full unit/D1 suites, regular audit, Chromium 6 mode/viewport; release contract lặp migration 0001–0010 hai lần trên schema cũ. BLOCKED: chưa có Worker/D1 staging, credential, CI run trên host hoặc rollout/rollback remote; cần cấp staging riêng và thực hiện theo RELEASE_RUNBOOK.md.

### Đợt 1 — công cụ build và chất lượng trải nghiệm

- [x] **B01** Phòng luyện DPS có điều kiện cố định — P1, g2 đầu; shared sau; phụ thuộc: F02,F04,F07. Evidence: TRAINING_LAB.md, 8 case và Worker DOT parity, browser g2 mobile/desktop; mode/flag guards và zero reward.
- [x] **B02** Lưu và đổi cấu hình build — P1, shared; phụ thuộc: F03,F05. Evidence: BUILD_PROFILES.md, 10 test, Chromium sáu mode/viewport; equipment capture theo flag default-off, võ học legacy vẫn dùng.
- [x] **B03** Gợi ý build và trang bị theo mục tiêu — P1, shared; phụ thuộc: B01,B02. Evidence: BUILD_ADVICE.md, 6 case và Chromium sáu mode/viewport.
- [x] **B04** Báo cáo trận và nguyên nhân tử trận — P1, shared; phụ thuộc: F04,F05. Evidence: COMBAT_REPORTS.md, 12 test, browser sáu mode/viewport; capture default-off, bounded/opt-in export.
- [x] **B05** Tự chiến đấu theo chính sách — P1, shared; phụ thuộc: B02,B04. Evidence: COMBAT_POLICY.md, 5 case và browser sáu mode/viewport; manual/HOT/quota guards.
- [x] **G01** Phòng thí nghiệm và so sánh build — P1, g2; phụ thuộc: B01,B02,F07. Evidence: BUILD_COMPARISON.md, 3 test isolation/determinism/guards; Chromium mobile/desktop.
- [x] **G03** Mã chia sẻ build và thư viện — P1, g2; phụ thuộc: G01,B02,F05. Evidence: BUILD_LIBRARY.md, 4 case, Chromium mobile/desktop; no item/token import.
- [x] **E01** Cẩm nang nguồn rơi và mục tiêu săn đồ — P1, shared; phụ thuộc: F01,F07,B03. Evidence: LOOT_CODEX.md, 4 case và browser sáu mode/viewport; AND/OR/hidden/stale guards.
- [x] **R01** Onboarding và gợi ý việc tiếp theo — P1, shared UI khác mode; phụ thuộc: F03,B03,E01. Evidence: CONTEXT_GUIDE.md, 4 case và browser sáu mode/viewport; namespace riêng, không popup.
- [x] **O01** UX mobile và giảm thao tác — P1, shared layout riêng; phụ thuộc: F03,B04,R01. DONE local — tìm skill/item/activity theo mode, shortcut `/`, filter Hành trang, activity route, target 44px; browser ba mode × portrait/mobile landscape/desktop, tay thuận và reduced-motion. Receipt CTC queue tối đa 16, retry tuần tự theo event key idempotent; hai client+D1 kiểm chứng offline→online. Mô phỏng 20 phút trên cả 9 mode/viewport: 19–59ms, log bounded (0 trong fixture). Evidence: browser smoke và session browser smoke; không tuyên bố đo trên thiết bị thật.
- [x] **O02** Góp ý và telemetry có ngữ cảnh — P1, shared opt-in; phụ thuộc: F05,F07,B04. Evidence: FEEDBACK_DIAGNOSTICS.md, client/server tests và Chromium consent/offline flows; rate/retention local.

### Đợt 2 — MVP riêng từng mode

- [x] **C01** Boss có pha và vai trò đóng góp — P1, ctc; phụ thuộc: F04,F07,B04. Evidence: PHASED_BOSS.md, 5 case, 10 phái phá kỳ, browser warning circle/abort/contribution; solo/default-off.
- [x] **C02** Bang online hoàn chỉnh — P1, ctc; phụ thuộc: F06,F07,B02. Evidence: GUILD_MANAGEMENT.md, 4 D1 case và client nonce/browser tests; role/transfer/leave/calendar receipts, resource donate còn khóa.
- [x] **C03** Duel giao hữu và ranked có giải thích — P1, ctc; phụ thuộc: F06,F07. Evidence: DUEL_MODES.md; 5 SQLite/D1 case, browser hai viewport; snapshot/model, daily pair cap, season/TTL, tie và retry.
- [x] **C04** Bạn bè, mời phòng và sảnh sẵn sàng — P1, ctc; mode khác flag riêng; phụ thuộc: F06,F07,C02. Evidence: PARTY_LOBBY.md; 4 SQLite/D1 case, browser roles/ready/offline/input/touch/escaping; lobby only.
- [x] **P01** Hành trình sinh tồn tùy chọn — P1, phlt; phụ thuộc: F01,F05,F07,B04. Evidence: EXPEDITION.md; 6 case, browser hai viewport; native combat/session/atomic transitions/world pause/reload interruption; thưởng/vật tư usable chờ P02.
- [x] **P02** Vật tư, địa hình và rút lui — P1, phlt; phụ thuộc: P01,F04,B05. Evidence: EXPEDITION_TRAVEL.md; 7 case, browser hai viewport; supplies/cost/terrain/rest/path/pursuit/receipt/rollback/flags/future guards.
- [x] **P03** Chọn đường, hợp đồng rủi ro và đồ sinh tồn — P1, phlt; phụ thuộc: P02,B03. Evidence: EXPEDITION_ROUTES.md; 5 case (10 phái), Chromium hai viewport; native caps/atomic fee/frozen route/future/flag/reward guards.
- [x] **P04** Tiến trình tri thức và nhật ký chuyến đi — P2, phlt; phụ thuộc: P03,F05. Evidence: EXPEDITION_KNOWLEDGE.md; 4 case, Chromium hai viewport; finite/no-stat/abort guards, atomic reward/meta retry and migration.
- [x] **G02** Bí cảnh biến chiêu roguelike — P1, g2; phụ thuộc: F04,F05,F07,G01. Evidence: RIFT.md; native5chặng,6case/10phái stats+damage parity, pause/retry/reload/future guards, Chromium mobile/desktop và mode denial. Modifiers session-only, no ranked reward.
- [x] **G05** Tiến trình thử nhiều build — P2, g2; phụ thuộc: G02,G03,F05. Evidence: test/build_progression.test.mjs (4 pass), Chromium mobile/desktop; bộ sưu tập hữu hạn, cosmetic local, claim retry/rollback và reset giữ bộ sưu tập.
- [x] **E02** Tái chế, chế tạo và chỉnh thuộc tính — P1, shared capability riêng; phụ thuộc: E01,F05. Evidence: SAFE_WORKBENCH.md; 7 case, Chromium PHLT/g2 mobile/desktop, CTC denied; pure preview/native caps/receipt/atomic retry/locked/equipped guards.
- [x] **E04** Ledger tài nguyên và cân bằng sink/source — P1, shared; online economy riêng; phụ thuộc: F06,F07,E02. Evidence: RESOURCE_ECONOMY.md; 3 client +4 SQLite/D1 cases; ledger/wallet/donation/rollback/UTC/rejoin quota and browser ack-loss nonce.
- [ ] **O03** Quản trị và moderation — P1 trước public online, shared; online theo mode được bật; phụ thuộc: F06,C02,C04,O02. IN_PROGRESS — Codex / feat/online-multiplayer; migrations 0008–0010, report cap 5/account + 20/hashed-IP/day, block/timed mute, room/guild chat guards, self-service/admin UI, `ADMIN_KEYS` per-admin audit identity; còn cấu hình secrets thật, chủ game duyệt quy trình report/retention và staging release gate.

### Đợt 3 — chơi chung và tiến trình dài hạn

- [x] **C05** Server quản lý phiên trận và phần thưởng — P0 gate multiplayer, ctc đầu, phlt/g2 qua capability riêng; phụ thuộc: F04,F05,F06,F07,C04. Evidence: PARTY_SESSIONS.md, SESSION_TRANSPORT_ADR.md; UI thật/hai browser context/API-D1, parity10phái, nonce/CAS/expiry/receipt, migration0007/CI và load2/4người. Không đóng O04 remote bằng kết quả local.
- [x] **C06** Phụ bản tổ đội đầu tiên — P2, ctc; phụ thuộc: C01,C04,C05. DONE local — [CTC_DUNGEON.md](CTC_DUNGEON.md): arena/boss phá trận server-authoritative, contribution guard/support, loot policy C05, frozen roster, flag rollback và retry; 10 phái × 2/4 người, D1 integration và hai browser context.
- [x] **C07** Công thành và Tống Kim theo mục tiêu — P2, ctc; phụ thuộc: C02,C05,C06. DONE local — [SIEGE_OBJECTIVES.md](SIEGE_OBJECTIVES.md): capture/gate/supply server-authoritative encounter, typed score, quota C05, replay/race/rollback and 2-client D1 browser smoke. MVP là đội PvE theo mục tiêu; PvP realtime thuộc phạm vi mùa/transport sau.
- [x] **C08** Mùa xếp hạng và hậu cần bất đồng bộ — P2, ctc; phụ thuộc: C03,C05,C07. DONE local — [CTC_SEASONS.md](CTC_SEASONS.md): UTC season board theo phái/bậc, rank tie, title claim receipt, guild async siege task cap/member, migration 0011 và CTC/flag guards.
- [ ] **P05** Co-op sinh tồn và cứu viện — P2, phlt; phụ thuộc: C05,P03,F07.
- [ ] **P06** Thử thách tuần đồng điều kiện — P2, phlt; phụ thuộc: P04,C05.
- [ ] **G04** Giao hữu chuẩn hóa và thử thách cộng đồng — P2, g2; phụ thuộc: C05,G02,G03.
- [x] **E03** Hiệu ứng trang bị theo lối chơi — P2, phlt/g2; ctc chỉ đồ hợp lệ; phụ thuộc: F02,F04,E02. DONE local — PHLT cùng bộ Hoàng Kim ≥2 món: hồi phục +8%, kháng trạng thái +5 điểm; 2.0 cùng bộ Bạch Kim ≥2 món: tốc độ đánh +5% (cap hiện hành). Chỉ số tĩnh, flag `equipment_playstyles` mặc định tắt và chỉ cho PHLT/g2; không có proc/cooldown và không thay đổi tick DOT. Có kiểm tra equip/unequip, đổi mode, family sai, flag off, CTC và client/Worker parity; xem EXECUTION_EVIDENCE.md.
- [ ] **R02** Nhiệm vụ linh hoạt và thưởng người quay lại — P2, shared luật riêng; phụ thuộc: F01,F05,E04. IN_PROGRESS — [WEEKLY_TASKS.md](WEEKLY_TASKS.md), mode-specific selectable tasks, one-mode lock, UTC rollover/rollback guard, 3 weekly claims and one-shot return receipt; 5 unit tests + 6 browser mode/viewport smoke. Còn server-trusted time để chặn forward-clock farming và offline return summary; hiện là progression client-side, không dùng cạnh tranh.
- [ ] **R03** Thành tựu, ngoại hình và chuyển sinh — P2, shared tách progression; phụ thuộc: F05,C08,P04,G05.

### Đợt 4 — giao dịch sau xác thực quyền sở hữu

- [ ] **E05** Spike và MVP giao dịch có escrow — P3 gated, ctc trước; mode khác quyết định riêng; phụ thuộc: C05,E04,O03. SPIKE DONE — [TRADE_ESCROW_ADR.md](TRADE_ESCROW_ADR.md) chốt ownership model, atomic accept/cancel/expiry, receipts, fraud cases và rollback. IMPLEMENTATION BLOCKED: chưa có server-owned inventory hoặc policy backfill legacy; không bật trade từ snapshot client.

## Thứ tự nhận việc từ trạng thái hiện tại

Các hàng dưới là lớp phụ thuộc, không phải yêu cầu chạy nhiều agent cùng lúc. Trong một lớp, chọn task theo ưu tiên và tránh xung đột file. Chỉ chuyển lớp khi phụ thuộc của task cụ thể đã được nghiệm thu; task bị chặn không chặn nhánh độc lập.

| Lớp | Task còn trống | Mục tiêu bàn giao |
|---|---|---|
| 1 | C05, G02, E03, R02, O03, O01, O04 | Session server/bí cảnh/đồ/nhiệm vụ/moderation/mobile; O04 còn gate remote. Chỉ nhận khi người dùng cho tiếp tục |
| 2 | C06, P05, P06, G04, G05 | Tổ đội, co-op/thử thách mode riêng và tiến trình build sau các phụ thuộc lớp1 |
| 3 | C07, E05 | Chiến trường mục tiêu và escrow sau session/ledger/moderation |
| 4 | C08 | Mùa ranked và hậu cần có server xác thực |
| 5 | R03 | Thành tựu/ngoại hình/chuyển sinh sau tiến trình của cả ba mode |

O04 local gates đã được chạy trong source archive; task còn remote staging/rollback. C05/E05 phải tách spike/ADR, prototype, implementation và kiểm chứng; E05 ADR xong nhưng thiếu server-owned inventory, không đóng task bằng ADR hoặc UI placeholder.

## Checklist cho từng ticket được nhận

- [ ] Ghi ID, owner, branch, file dự kiến và phụ thuộc đã đạt trong nhật ký.
- [ ] Chốt input/output, schema version, mode/capability, luật thưởng và trường hợp thất bại trước sửa.
- [ ] Hoàn thành logic và nối UI/Worker cần thiết; không chỉ dựng nút hoặc stub.
- [ ] Kiểm tra flag off, mode sai, save cũ và sandbox; bổ sung retry/concurrency khi có quyền sở hữu hoặc thưởng.
- [ ] Chạy nghiệm thu riêng của task và regression phù hợp; ghi command/kết quả thực tế.
- [ ] Với UI, kiểm tra mobile/desktop; với API/schema, kiểm tra local D1 và quyền truy cập.
- [ ] Cập nhật evidence, migration/rollback, hạn chế; chỉ sau đó đóng checkbox task.
- [ ] Bàn giao task kế tiếp đủ phụ thuộc và commit/PR thực tế nếu phiên giao việc yêu cầu.

## Việc agent đầu tiên thực hiện

1. Đọc hướng dẫn repo/AGENTS nếu có, kiểm tra HEAD/worktree và đọc luật mode thực tế.
2. Chỉ tiếp tục khi có lệnh mới: đọc SESSION_CHECKPOINT.md và evidence của 27 task đã hoàn tất; kiểm tra regression phù hợp thay đổi. Nhận C05 hoặc G02/O03/O01 theo phụ thuộc; không làm lại nền hoặc đoán mapping thiếu để làm strict pass.
3. Ghi nguồn đối chiếu mapping skill; nếu không có nguồn, ghi unsupported và tiến hành phần an toàn, không đoán đích.
4. Chia PR/commit nhỏ theo task khi phiên giao việc cho phép; không gom toàn bộ backlog thành một thay đổi.
5. Cập nhật TODO, evidence và blockers trước bàn giao.

## Nhật ký nhận việc

35 task DONE local — Codex / feat/online-multiplayer: F01–F07, B01–B05, G01/G02/G03/G05, E01–E04, R01/O01/O02, C01–C08, P01–P04. Remaining: P05, P06, G04, R02, R03, O03, O04, E05. O04 requires remote staging/rollback evidence; do not close with local CI alone.

| Task | Trạng thái | Agent / nhánh | File sở hữu | Evidence / blocker |
|---|---|---|---|---|
| F01 | DONE | Codex / feat/online-multiplayer | docs/MODE_CONTRACT.md, test/mode_contract.test.mjs | 15 test hợp đồng; luật mode không thay đổi |
| F02 | DONE theo nhánh unsupported | Codex / feat/online-multiplayer | scripts/skill-audit.mjs, js/skill_graph.js, tests | 106 liên kết; 15 thiếu được ghi rõ; data.js không đổi |
| F03 | DONE local | Codex / feat/online-multiplayer | js/skill_graph_ui.js, index.html, scripts/browser-smoke.mjs | 60 kiểm tra phái/mode/viewport; modal thật |
| F04 | DONE contract nền | Codex / feat/online-multiplayer | js/combat_contract.js, worker/build-game.mjs, tests | parity calc/mitigation/shield và diagnostic DTO; C05 chưa làm |
| F05 | DONE (schema nền) | Codex / feat/online-multiplayer | js/save.js, js/save_schema.js, js/workflow_overrides.js, loaders | v2, backup trước migration, future-save guard, không unlink khi ghi lỗi |
| F06 | DONE local | Codex / feat/online-multiplayer | worker/src/account.js, ladder.js, social.js, db.js, js/online.js | CAS, quota/cap, receipt, retry, donate disabled; D1 runtime 11/11 |
| F07 | DONE local | Codex / feat/online-multiplayer | js/capabilities.js, worker/src/capabilities.js, index.js | mode từ stored snapshot, boolean allowlist, flags không xóa state |
| B02 | DONE local | Codex / feat/online-multiplayer | js/build_profiles.js, index.html, style.css, test/helpers/game.mjs, tests | atomic save, preview, UID/budget/mode/phase guards; 10 test và sáu browser flows |
| B01 | DONE local | Codex / feat/online-multiplayer | js/training.js, js/training_ui.js, js/combat_contract.js, js/combat.js, tests | mode g2, default-off; seed/state cô lập, actual DOT, zero reward, browser verified |
| B04 | DONE local | Codex / feat/online-multiplayer | js/combat_reports.js, js/combat.js, js/rewards.js, survival/final, js/capabilities.js, tests | actual event producers, 5/128/64KiB caps, shield/CC/DOT/pet, mode summary và export verified |

## Mẫu evidence hoàn thành

G01 DONE local — Codex / feat/online-multiplayer; sở hữu js/build_compare.js, js/training_ui.js, loaders và tests. A/B cùng điều kiện/seed, preflight UID, không apply/reward/storage/network; 3 case và browser mobile/desktop. training_lab default-off; chưa benchmark thiết bị thật.

- Task:
- HEAD / branch:
- Mode kiểm tra:
- Thay đổi và migration:
- Test/command thực chạy, kết quả:
- Kiểm tra UI/API thủ công:
- Hạn chế còn lại / task tiếp theo:
- Commit/PR nếu được giao tạo:

