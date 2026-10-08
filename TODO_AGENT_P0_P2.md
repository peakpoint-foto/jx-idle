# Runbook thực thi P0–P2 cho agent

Nguồn backlog: `TODO_PLAYER_FEEDBACK.md`, ba ảnh góp ý ngày 08/10/2026 và mã nguồn hiện tại. Đây là hướng dẫn thực thi, không phải xác nhận các báo cáo đã tái hiện. Các mục checkbox bên dưới chưa hoàn thành, kể cả khi đã có một phần code.

## 1. Hợp đồng thực thi

- Đọc `AGENTS.md` áp dụng, kiểm tra branch/status/diff trước làm việc. Giữ thay đổi có sẵn, không reset worktree. Bản sửa drop/affix hiện có trong worktree là đầu vào cần review.
- Giữ ba mode CTC/PHLT/2.0 khác nhau theo luật hiện tại. Không tự cân bằng lại mục tiêu cuối game, tăng EXP, đổi sức chứa túi hoặc tỷ lệ rơi đồ ngoài yêu cầu đã chốt.
- Lệnh bài Triệu hồi = `0.0005` (0,05%) trên mỗi quái đủ điều kiện. CTC không rơi trang bị xanh; trang bị thường rơi màu vàng. Kiểm kê riêng đồ bộ/quà/rèn/shop, không xóa đồ cũ để đạt điều kiện này.
- Trần +1 áp dụng cho **mỗi dòng cộng cấp kỹ năng hệ trên trang bị**. Không tự áp trần +1 cho tổng nhiều món, `allskill_v` hay mọi loại affix. Phải xác minh đơn vị dữ liệu trước đổi thuộc tính khác.
- Tất cả sửa công thức/hiệu ứng/nhánh/UI kỹ năng và DPS phải gom vào một lượt ở môi trường **local**. Cloud có thể làm audit, chuẩn bị fixture và sửa tính toàn vẹn item; không triển khai lại skill trên cloud.
- Chuyển sinh online thiếu checkpoint cấp 180: chờ xác minh, không gắn cờ gian lận, chưa xếp hạng. Đồ lỗi do game cũ cũng không tự quy kết gian lận.
- D1 preview và production tách biệt. Không chạy migration/backfill production khi chỉ được giao sửa code. Chuẩn bị dry-run, backup/rollback và báo rõ việc nào chưa được triển khai.
- Các dòng góp ý bị cắt hoặc thiếu dữ liệu phải ghi hạn chế. Không đoán phần còn thiếu, không đóng ticket chỉ vì không tái hiện một lần.

## Trạng thái thực thi đợt hiện tại — 08/10/2026

| Nhóm | Trạng thái | Bằng chứng |
|---|---|---|
| B0 | đang làm | Đã kiểm tra script order/override, fixture game và diff; test hiện tại 66/66 pass. Còn thiếu Safari/D1 preview thật. |
| P0-01 | code xong phần policy đã xác nhận | Drop/affix/potion/Thiên Vương đã có regression; audit mọi nguồn và semantics skill vẫn mở. |
| P0-02 | code xong local | `eq/inv/ground/stash` normalize + version marker; còn ca import/rương đầy trên thiết bị thật. |
| P0-03 | code xong boundary | Validator soi snapshot đầy đủ, pending không rank, sync CAS; chưa chạy backfill remote. |
| P0-04 | hardening một phần | Bounds/replay/quota đã khóa; combat claim vẫn client-reported, chưa phải server-authoritative. |
| P1/P2 | thực thi chọn lọc | Tower progression, Thiên Vương, auto potion, offline gains và giữ map khi luyện công đã có code/test; perf/shop/mount/skill cần fixture hoặc thiết bị theo acceptance. |
| R0 | chưa nghiệm thu | Chưa deploy/remote smoke/manual PC+iOS. |

Evidence notes: `docs/fixes/P0-01.md` đến `docs/fixes/P0-04.md`. Không đánh dấu toàn bộ checkbox bên dưới khi acceptance còn thiếu.

## 2. Quy trình và thứ tự

1. **B0**: kiểm kê source/override, baseline, fixture và bằng chứng.
2. **P0-01 → P0-02 → P0-03 → P0-04**: quy tắc item, migration, server và nguồn thưởng.
3. **P1-01/P1-02/P1-05/P1-06**: mất đồ, lọc, map và offline. Đo hiệu năng P1-07 trước và sau các thay đổi.
4. **LOCAL-01 → LOCAL-02/03/04 → LOCAL-05/06 → LOCAL-07**: một lượt toàn bộ skill trên local. Freeze iOS được ưu tiên đầu lượt này.
5. **P1-03/P1-04/P1-08**, rồi **P2-01…P2-05**; các đề xuất thiết kế chưa chốt chỉ làm báo cáo/giải pháp, không tự sửa luật.
6. **R0**: nghiệm thu tích hợp, hướng dẫn release và rollback.

Có thể song song audit server và UI nếu không cùng sửa file. `stats.js`, `save.js`, data skill và file override phải có một owner tích hợp. Không mở nhiều bản sửa công thức skill độc lập.

## 3. Mẫu bằng chứng bắt buộc cho mỗi ticket

Ghi vào `docs/fixes/<ID>.md` khi bắt đầu thực thi (chưa cần tạo file trống):

```text
ID / trạng thái: chưa làm | đang làm | chờ dữ liệu | code xong | nghiệm thu
Commit baseline, môi trường, thiết bị/trình duyệt, mode, cấp, nhánh
Bước tái hiện + expected/actual
Nguyên nhân: xác nhận hoặc giả thuyết; file/hàm và bằng chứng
Quyết định triển khai; tác động save cũ / online / ba mode
File đã sửa; test đã chạy; kết quả và ca chưa chạy
Điều kiện đóng ticket; cách rollback
```

Chỉ tick hoàn thành khi đạt acceptance và test liên quan. Đánh dấu “chờ dữ liệu” cho test cần iOS thật, save thật hoặc credential remote; tiếp tục các ticket độc lập.

## B0 — baseline và bản đồ thực thi

- [ ] Ghi `git status --short`, HEAD và diff sẵn có; chạy `npm test`, giữ kết quả baseline. Bản test gần nhất được báo 57/57 nhưng phải đo lại trên HEAD thực tế.
- [ ] Đọc thứ tự `<script>` của `index.html`, `worker/build-game.mjs` và `test/helpers/game.mjs`; xác định hàm nào bị ghi đè trong `workflow_overrides.js`, `activity_hardening.js`, `ge_patch.js`, `jxorig.js` và các patch khác. Không sửa một hàm không còn được runtime gọi.
- [ ] Lập bảng feedback → ticket dưới đây; lưu ảnh/ghi chép, không đưa dữ liệu riêng tư hoặc recovery token vào fixture.
- [ ] Chuẩn bị fixture: CTC/PHLT/g2 cấp 10/60/120/180; trang bị +38, túi/rương đầy, ground có đồ quý; save cũ và mới; hai tài khoản preview cho online.
- [ ] Kiểm tra client/worker cùng policy item. Không commit `worker/gen/game.js`; thay đổi build phải đi qua `worker/build-game.mjs`.

Acceptance: có baseline và bản đồ các hàm thực sự chạy; mỗi báo cáo có ticket, chưa tái hiện được ghi rõ.

## P0-01 — quy tắc thuộc tính và toàn bộ nguồn tạo đồ

**Điểm vào:** `js/loot.js` (`rollMagic`, `makeItem`, `rollDrops`), `js/sets.js` (`geValue`), `js/forge.js`, `js/recipes.js`, `js/rewards.js`, `js/shop.js`, `js/events.js`, `js/depth.js`, `js/auto.js`, `js/stats.js`.

- [ ] Kiểm kê `mag`, `ext`, `base`: ID, tên canonical, đơn vị, khoảng giá trị và nguồn sinh. Đối chiếu năm thuộc tính `metal/wood/water/fire/earthskill_v`; không coi mô tả nguồn “tăng sát thương” là bằng chứng đủ để biến nó thành cấp.
- [ ] Đặt policy dùng chung cho per-line cap +1. Áp ở mọi nguồn item, kể cả cực phẩm, đồ bộ, max-roll, reroll/khảm, quà và offline; tooltip/so sánh/lọc/stat đều đọc cùng giá trị.
- [ ] Cường hóa/Bạch Kim/lineScale không nhân cấp kỹ năng. Phân biệt cấp với damage/%; kiểm tra base skill affix nếu dữ liệu có.
- [ ] Review CTC: bảo đảm không phát item xanh do `rollMagic` thiếu candidate; ưu tiên tạo đủ affix hợp lệ thay vì chỉ bỏ item. Đo số lượt rơi trước/sau để nhận diện việc vô tình giảm tổng drop.
- [ ] Audit mọi nguồn loot rơi xuống đất trong CTC; giữ đồ bộ được phép theo luật mode. PHLT/g2 giữ luật màu của chúng.
- [ ] Test ngưỡng Triệu hồi bằng RNG kiểm soát ngay dưới/bằng/trên `0.0005`, đang buff, đầy 5 lệnh, đường farm và hoạt động; không chỉ test giá trị constant.

**Test:** seed cố định, cấp thấp/cao, bình thường/tinh anh/boss, lucky cực trị; mỗi nguồn tạo đồ có invariant; mẫu đủ lớn đo màu và số món. Không dùng test xác suất dễ flaky.

**Acceptance:** không dòng kỹ năng hệ nào vượt +1 ở nguồn đã kiểm kê; không xanh CTC; không thay luật mode khác; có đo tác động drop. Nếu dữ liệu nguồn cần đổi nghĩa skill thì đưa phần đó sang LOCAL-02.

## P0-02 — migration trang bị cũ và rương

**Phụ thuộc:** P0-01. **Điểm vào:** `js/save.js`, `js/stash.js`, `js/online.js`; `migrateCore`, `stashClean`, `stashRead`, `stashImport`, recovery/import.

- [ ] Liệt kê nơi giữ item: eq, inv, ground, stash, file export/import, snapshot online và cấu trúc khác tìm được. Duyệt tất cả `mag/ext/base` có cấp kỹ năng hệ.
- [ ] Migration có version và idempotent: +38 → +1 theo policy; giữ UID, tên, thuộc tính khác, khóa, số món và số tiền. Không nhân bản đồ hoặc reset quota.
- [ ] Normalize tại đọc/nạp; không vô tình mutate object chia sẻ giữa slot/rương khi transaction thất bại.
- [ ] Chụp backup save/rương trước lần nâng phiên bản; nếu localStorage đầy/chặn thì giữ bản trước, hiển thị lỗi rõ và không tiếp tục chuyển đồ.
- [ ] Đồ cũ sửa chỉ số phải tính lại stat/equip-plan cache; không xóa đồ xanh đã sở hữu.

**Test:** migrate hai lần; đủ eq/inv/ground/stash; import save/rương cũ; UID trùng; item thiếu/null; write thất bại; đổi slot; recover online. Đếm item/tiền trước và sau.

**Acceptance:** mọi đường load xử lý +38, không mất/dup đồ, lần thứ hai không thay đổi thêm; rollback phục hồi backup được.

## P0-03 — snapshot server, validation và bảng xếp hạng

**Phụ thuộc:** P0-01/02. **Điểm vào:** `worker/src/account.js`, `validate.js`, `ladder.js`, `db.js`, `worker/build-game.mjs`.

- [ ] Kiểm định đầy đủ base/mag/ext, duplicate affix, kiểu số, NaN/Infinity, ID không tồn tại, giới hạn enh và policy per-line. Không chỉ lấy max toàn bảng rồi bỏ qua loại món/cấp/hệ nếu kiểm định cần ràng buộc đó.
- [ ] Phân biệt migration lỗi phiên bản cũ với vi phạm mới: dùng version/provenance đáng tin hoặc snapshot trước trên server; không tin cờ version client để bỏ mọi validation.
- [ ] Normalize bản cũ được xác minh trước tính lực chiến; dữ liệu chưa đủ bằng chứng ở trạng thái chờ xác minh và không xếp hạng. Không tạo sticky fraud flag chỉ do +38 do game sinh.
- [ ] Recovery/me/profile/ladder trả trạng thái thống nhất; sync revision/CAS tránh bản cũ ghi đè bản đã sửa; hai request đồng thời không mất sửa đổi.
- [ ] Chuẩn bị backfill preview: dry-run số dòng/giá trị trước-sau, transaction hoặc cập nhật có CAS, audit chỉ trường cần thiết, resume/idempotent. Không log token/save riêng tư đầy đủ.
- [ ] Chuẩn bị rollback theo backup/version. Production backfill chỉ thực thi khi được giao triển khai rõ ràng.

**Test:** snapshot +38 cũ, +1 hợp lệ, +38 mới có sửa client, ext giả, số lỗi, thiếu version; sync song song/recover/ladder; chuyển sinh thiếu checkpoint vẫn pending.

**Acceptance:** client/worker cùng stat trên fixture hợp lệ; sửa lỗi cũ không quy oan; item giả không tăng rank; chưa chạy remote phải ghi rõ.

## P0-04 — API và quyền nhận thưởng

**Phụ thuộc:** P0-03. **Điểm vào:** `worker/src/activity.js`, `account.js`, `social.js`, `http.js`, `js/online.js`, `js/activity_hardening.js`.

**Bằng chứng cần xử lý:** ledger hiện giới hạn quota/idempotency nhưng `contribution`, `cleared`, `won` còn do client báo. Ledger không tự chứng minh đã thắng.

- [ ] Lập bảng register/hb/sync/activity claim/duel/guild/room: auth, owner, điều kiện cấp, quota, đầu vào tin cậy, tài sản/thưởng được thay đổi.
- [ ] Tái hiện giả kết quả thắng, sửa snapshot thưởng, reuse event key, đổi activity với cùng key, claim trước bắt đầu, đồng thời hai tab, đổi giờ máy, reconnect và replay.
- [ ] Với hoạt động có thưởng online: server cấp run ID gắn account/activity/period và trạng thái; start/claim tiêu quota và cấp thưởng atomically, một lần. Không dùng run ID client tự tạo làm bằng chứng chiến thắng.
- [ ] Chỉ cấp thưởng dựa trên dữ kiện có thể kiểm chứng. Nếu chưa có combat server thì ghi rõ mức kiểm chứng, dùng pending/giới hạn hợp lý; không tuyên bố chống mọi gian lận hoặc bịa chiến thắng từ thời gian đã trôi.
- [ ] Rate limit và ràng buộc owner áp dụng trước mutation; client chỉ áp delta server đã nhận. Giữ trải nghiệm chơi local theo thiết kế.
- [ ] Ledger duplicate trả kết quả ban đầu, không trả thưởng mới; idempotency phải kiểm tra cùng loại hoạt động và nội dung gắn key.

**Test:** request thật trên D1 local/preview với cạnh tranh insert/CAS; không chỉ mock SELECT/INSERT. Token sai, account khác, hết quota, UTC boundary, retries, timeout sau commit.

**Acceptance:** không nhân thưởng/quota qua replay/concurrency; ghi rõ những gì server chưa xác minh. Schema thay đổi dùng migration thêm mới, không sửa migration đã áp dụng.

## P1-01 — loot tháp biến mất

**Điểm vào:** `js/loot.js`, `js/depth.js`, `js/save.js`, override hoạt động; `R.ground`, `GROUND_MAX`, `saveGround/restoreGround`.

- [ ] Theo dõi item UID qua đổi tầng/chết/thoát/reload/chuyển map. Tìm từng chỗ reset ground, bán do quá giới hạn và lưu không kịp.
- [ ] Chọn cơ chế nhất quán với thiết kế có sẵn: ground còn lưu theo nơi hoặc chuyển loot vào túi/hàng chờ; túi đầy vẫn giữ tài sản. Không tự bán đồ quý để giải quyết tràn.
- [ ] Bán tự động phải có điều kiện, số tiền và thông báo; đồ khóa/đồ ưu tiên không mất im lặng.
- [ ] Save trước chuyển tầng, xử lý ghi thất bại; reload không nhặt hai lần.

**Test/acceptance:** túi đầy, >40 món, nhiều tầng, death/exit/reload; phương trình số món vào = còn giữ + đã nhặt + đã bán hợp lệ, tiền khớp; không biến mất/dup UID.

## P1-02 — lọc, bán và túi/rương đầy

**Điểm vào:** `js/gear_policy.js`, `loot.js`, `ui.js`, `stash.js`; lootMatch/lootWanted/roomCandidate/sweepJunk.

- [ ] Làm rõ minLvl là cấp item 1–10; kiểm tra nhu cầu “cấp yêu cầu nhân vật” và thêm tiêu chí riêng nếu cần, không đổi nghĩa trường cũ.
- [ ] Tạo bảng quyết định lọc + auto-pick + auto-sell + upgrade + locked; các bước dùng cùng policy, không nhặt rồi bán trái rule.
- [ ] Đầy túi có thông báo/cách xử lý rõ; không tự bán rương. Khóa, item equipped, upgrade và preferred item được bảo vệ.
- [ ] Lưu cài đặt qua reload, phản hồi số món khớp ngay khi đổi ngưỡng; rule any/all và active-only đúng hidden lines.

**Test/acceptance:** tổ hợp filter/upgrade/all × túi đầy/chưa đầy × locked/upgrade/preferred/junk, minLvl và cấp yêu cầu; không bán đồ được bảo vệ; giải thích UI đúng.

## P1-03 — Thiên Vương không rơi chùy

- [ ] Đọc FAC.wcode, weaponCode, particular, nhánh hiện hành, FACTION_WEAPON_SHARE và bảng drop/shop. Xác nhận chùy có mẫu hợp lệ và có đường chọn.
- [ ] Dùng seed tạo ≥10.000 lượt cho nhánh thương/chùy, phân loại toàn bộ output; báo bảng tỷ lệ và item bị loại do yêu cầu/giới tính/mode.
- [ ] Sửa mapping hoặc bias theo nhánh nếu xác nhận sai; không tăng tỷ lệ tổng drop. Đổi nhánh phải đổi bias đúng lúc.

**Acceptance:** cả hai nhánh có vũ khí đúng trong nguồn cho phép, không xuất item invalid; test chuyển nhánh và giữ luật CTC vàng. Nếu phải sửa hệ nhánh thì chuyển implementation sang LOCAL-04.

## P1-04 — đề xuất một món một ô

- [ ] Audit mô hình sức chứa hiện tại, UI footprint và rương chung, so sánh PC/iOS; xác định đây là UI hay tăng sức chứa thực.
- [ ] Viết đề xuất migration và ảnh wireframe, tác động kinh tế/loot/túi đầy; giữ implementation hiện tại tới khi mục tiêu thiết kế được chốt.

**Acceptance của ticket khảo sát:** có phương án cụ thể và tradeoff; không đánh dấu feature đã làm. Đây không phải blocker cho bugfix khác.

## P1-05 — map tự chuyển và thiếu nút chuyển map

**Điểm vào:** `js/combat.js`, `depth.js`, `modes_play.js`, `uihub.js`, `quick.js`, `jxshell.js`, `workflow_overrides.js`.

- [ ] Truy stage/wave/push/auto-advance khi luyện công, kết thúc hoạt động và load; phân biệt map farm với hoạt động có chuyển tầng hợp lệ.
- [ ] Khi người dùng chọn giữ map, wave mới vẫn ở map đó. Bảo toàn tùy chọn push khi đi/ra hoạt động và reload.
- [ ] Khôi phục đường chuyển map trên PC/mobile: nút có label, map đã mở được chọn; khóa có lý do; không bị canvas/overlay che.
- [ ] Chặn chuyển map trong hoạt động tại tầng logic chung; không chỉ disable nút UI.

**Test/acceptance:** ba mode × push bật/tắt × kết thúc wave/hoạt động/reload; desktop/mobile portrait/landscape. Không nhảy map khi farm, không mở map vượt tiến độ.

## P1-06 — offline không nhận EXP

**Điểm vào:** `js/save.js` offlineGains, `js/combat.js` expFor/gainXp, UI nhận thưởng và heartbeat server.

- [ ] Fixture đồng hồ cố định, ghi last/raw/capped/quota/kps/cấp-map/xp trước-sau và XP cần lên cấp; xác định thưởng đã áp dụng hay chỉ lỗi hiển thị.
- [ ] Tách tính delta và commit nếu cần; timestamp/quota/XP/tiền/lượt thưởng lưu nhất quán. Retry/reload không nhân hoặc mất thưởng.
- [ ] Điều kiện không có EXP (dưới ngưỡng thời gian, cấp tối đa, hết quota) có giải thích; không báo nhận thành công nhưng delta bằng 0 không rõ lý do.
- [ ] Đồng hồ máy lùi/tiến không cộng vượt giới hạn; online dựa giờ server. Giữ giới hạn 8h mỗi lần và 12h/ngày theo luật hiện tại.

**Test/acceptance:** 59/60 giây, 2h/8h/>8h, quota còn/hết, đổi ngày, cap cấp, write lỗi, nhận rồi reload, hai tab; tổng delta đúng, một lần.

## P1-07 — PHLT lag

- [ ] Chọn thiết bị đại diện và ghi viewport, FPS/frame p50/p95, heap và số enemy/projectile/listener; đo không hiệu ứng, đông quái, Triệu hồi, boss và auto-equip.
- [ ] Profile combat/render/doll/UI/calc; chỉ tối ưu điểm nóng đã đo. Cache có invalidation khi đổi gear/skill/buff/map; hạn chế quét đồ hoặc dựng DOM mỗi frame.
- [ ] Test 30 phút foreground và background/resume; observer/listener/timer không tăng vô hạn. Chế độ tiết kiệm pin không đổi số hit/loot/EXP.
- [ ] Đề xuất ngân sách theo thiết bị, mục tiêu mặc định 30 FPS ổn định trên máy yếu; ghi tiêu chí đo trước nghiệm thu, không cam kết mọi thiết bị khi chưa đo.

**Acceptance:** báo trước/sau cùng scene/thiết bị; p95 đạt ngân sách đã chốt, không thoái lui combat/reward; nếu chưa có thiết bị thì chỉ nghiệm thu profiling và ghi thiếu manual run.

## P1-08 — cày quá lâu

- [ ] Mô phỏng/đo ba build yếu/trung bình/mạnh ở ba mode: giờ tới mốc cấp, tỷ lệ thiếu vũ khí, EXP online/offline và phần thưởng hoạt động.
- [ ] Tách bug (EXP mất, hỗ trợ không hoạt động, weapon sai) khỏi cân bằng; đo lại sau các ticket đó.
- [ ] Đề xuất mục tiêu progression và thay đổi kèm mô phỏng lạm dụng. Chưa có mục tiêu được duyệt thì không đổi multiplier hoặc nới quota.

**Acceptance:** báo cáo định lượng và đề xuất; thay luật là ticket follow-up sau khi chốt thiết kế.

## LOCAL — toàn bộ skill trong một lượt local

**Điểm vào chung:** nguồn skill trong data/ref, `js/stats.js`, `combat.js`, `builds.js`, `ui.js`, `render.js`, `jxshell.js`, file override; worker bundle cần cùng công thức.

### LOCAL-01 — iOS mở sách kỹ năng bị đơ

- [ ] Safari thật: mở sách khi combat/pause, mở-đóng 30 lần, xoay màn hình, background/resume; thu lỗi console, long task và trạng thái overlay/focus.
- [ ] Sửa listener trùng, vòng render/recalc, touch/click double-fire hoặc modal không đóng theo nguyên nhân xác nhận; nút đóng/backdrop/back có đường phục hồi.
- [ ] Không tính test DOM stub là kiểm chứng iOS. Acceptance: thao tác được sau từng chu kỳ, không tăng listener/heap vô hạn, PC không thoái lui.

### LOCAL-02 — chuẩn hóa cấp/đơn vị và ma trận skill

- [ ] Lập bảng từng môn/nhánh: skill ID, attack/passive/buff, vũ khí, học tối đa, cấp hiệu lực, nguồn tăng cấp, đơn vị từng attribute, cap và hỗ trợ nối tới chiêu nào.
- [ ] Tách learned level với effective level; không dùng cap học để âm thầm bỏ bonus hợp lệ. Trần per-line item và tổng bonus được mô tả rõ.
- [ ] Đối chiếu data với tài liệu/nguồn gốc đáng tin; chỗ thiếu dữ liệu ghi assumption, không hardcode từ một câu góp ý.
- [ ] Tooltip, lực tay, DPS và worker calc thống nhất. Test cấp 0/1/max/max+1, gear/buff bật tắt, hidden activation.

### LOCAL-03 — Thiếu Lâm và Võ Đang

- [ ] Xác định ID La Thiên Điệp/La Hán Trận; kiểm tra passiveApplies/buff duration/target và calc/combat. So sánh chỉ số/hit trước sau học và kích hoạt.
- [ ] Võ Đang Quyền Pháp: xác minh “25%” đang chỉ thuộc tính nào, không đoán câu bị cắt; kiểm tra cấp 20/21 và gear bonus. Clamp đúng đại lượng theo luật xác nhận, không clamp mọi nội lực về 25%.
- [ ] Test thời hạn buff, hết mana, kháng/giảm damage, đổi chiêu/vũ khí; hỗ trợ phải có tác dụng đúng loại.

### LOCAL-04 — Côn Lôn và nhánh vũ khí

- [ ] Truy skill kiếm bị thiếu qua ID/data/name/branch/equip/UI/slots; fix điều kiện lọc hoặc mapping đã xác nhận.
- [ ] Hỗ trợ nội công: kiểm tra dependency tới chiêu và source damage; tăng hỗ trợ phải đổi đúng chỉ số chiến đấu, UI thể hiện đúng.
- [ ] Tích hợp P1-03 nếu bias drop phụ thuộc nhánh; test học/đổi nhánh/đổi vũ khí/reload và branch không hợp lệ.

### LOCAL-05 — đồ mạnh hơn nhưng damage thấp hơn

- [ ] Dùng mục tiêu cố định, cùng cấp/kháng/vũ khí/chiêu và seed; tách raw damage, expected DPS, crit/hit/multi-hit và mana sustain.
- [ ] Nếu đồ làm mất hidden source/buff hoặc đổi vũ khí, UI giải thích tradeoff. Nếu formula/cache sai thì sửa và thêm regression.
- [ ] bestEquipPlan ở ưu tiên damage không chọn upgrade chỉ nhờ survival score; balanced/survival giữ mục tiêu riêng. Test hai nhẫn và đồ khóa.

### LOCAL-06 — Thúy Yên Băng Tung Vô Ảnh

- [ ] Xác minh ID, vùng đánh, hit count, animation hoa sen/asset; tách bổ sung hình ảnh khỏi sửa hit thực.
- [ ] Projectile/multi-hit không gây double damage hay xuyên quota target; thêm fallback asset, giới hạn hiệu ứng phù hợp P1-07.
- [ ] Test hitbox/targets/kháng/mana/cooldown trên PC và iOS, hiệu ứng tắt vẫn cùng damage.

### LOCAL-07 — nghiệm thu toàn bộ skill

- [ ] Mỗi môn/nhánh có fixture attack/passive/buff/support; dữ liệu trước-sau, cấp học và effective level được assert theo công thức xác nhận.
- [ ] So sánh client/worker trên cùng save, kiểm định server chấp nhận đồ hợp lệ; chuyển sinh pending giữ nguyên chính sách.
- [ ] Chạy PC + iOS thật; 30 lần modal, 30 phút combat, đổi nhánh/gear/reload/offline. Một PR tích hợp skill với bảng coverage và các ca còn thiếu.

**Acceptance LOCAL:** không đóng cả lượt khi chỉ sửa một môn; ca không có thiết bị/nguồn gốc để xác minh phải ghi rõ trạng thái.

## P2-01 — Kỳ Trân Các trống

- [ ] Truy shop data, feature flag mode/cấp và render; phân biệt chưa mở, hết quota, không có catalog và lỗi render.
- [ ] Nội dung hợp lệ hiển thị; trạng thái khóa có lý do. Mua kiểm tra tài nguyên/túi/quota trước commit, double click chỉ một lần.
- [ ] Test ba mode, cấp dưới/đủ, thiếu/đủ tiền, túi đầy, quota tuần, reload và retry. Acceptance: item/tiền/quota khớp và không mất tiền khi không nhận đồ.

## P2-02 — hình ảnh cưỡi ngựa

- [ ] Audit asset/license/source hiện có, mount state và đường render; dùng asset có sẵn nếu hợp lệ.
- [ ] Tải/fallback đúng, vị trí sprite/di chuyển/collision không lệch; không tự thêm combat bonus hoặc bán mount mới.
- [ ] Test PC/iOS, asset lỗi/chậm, mount/unmount/đổi map; acceptance: visual đúng, gameplay và hiệu năng không đổi ngoài ngân sách cho phép.

## P2-03 — ngưỡng auto potion

- [ ] Xác minh threshold hiện tại, schema save và shared usePotion; thêm lựa chọn % rõ cho auto HP (mana riêng nếu đã có), giá trị bounded và migration mặc định giữ hành vi cũ.
- [ ] Mọi đường manual/auto/hoạt động dùng cùng kiểm tra cooldown/stock/nopot/cap siege; không bypass do slider mới.
- [ ] Test dưới/bằng/trên ngưỡng, min/max, đầy máu, hết bình, spam, nopot và cap công thành, reload; acceptance: đúng ngưỡng, trừ một bình và lưu được cài đặt.

## P2-04 — đường vào PvP và mô tả

- [ ] Theo `worker/src/social.js` và `js/online.js` xác minh điều kiện cấp/bậc/auth/quota. Đặt entry/link rõ trong UI và giải thích thách đấu bất đồng bộ.
- [ ] Chưa online/chưa đủ điều kiện có hướng dẫn hành động; profile chọn đối thủ đúng bậc; phòng presence không được mô tả thành combat realtime.
- [ ] Test hai account preview, đối thủ hết hạn/khác bậc, resolve/retry; acceptance: người dùng tới được tính năng, mô tả đúng khả năng đã triển khai.

## P2-05 — lấy dữ liệu/xuất save

- [ ] Kiểm tra export/import/file/recovery hiện có; phân biệt save cá nhân, data game và dữ liệu người chơi khác.
- [ ] Trước khi mở API mới, viết đề xuất rõ mục đích/quyền truy cập; không tự công khai snapshot riêng/token hoặc thêm data endpoint do góp ý mơ hồ.
- [ ] Sửa UX xuất save hiện có nếu lỗi: file đúng UTF-8, version/mode/checksum, import thông báo lỗi rõ, không ghi đè slot sai.
- [ ] Test round-trip tiếng Việt, đồ/rương, save lỗi/khác mode, download iOS; acceptance: save cá nhân khôi phục được và không rò credential. Yêu cầu dữ liệu chưa rõ ở trạng thái cần làm rõ, không chặn bugfix.

## R0 — tích hợp, release và rollback

- [ ] `npm test` và `git diff --check` đạt; test bổ sung kiểm tra hành vi, không chỉ lặp constant/implementation.
- [ ] Kiểm tra schema D1 mới và DB đã có, idempotency và concurrency thực; production/preview binding đúng. Dry-run build không chứng minh API remote hoạt động.
- [ ] Manual smoke ba mode: tạo/load/import, farm, activity, map, loot/túi/rương, potion/offline; PC/mobile và phần skill theo LOCAL-07.
- [ ] Phân nhóm release có thể rollback: policy+save, server schema/validation, gameplay/UI, skill local. Schema thêm mới tương thích rollback; không downgrade save version tùy tiện.
- [ ] PR mô tả bug → hành vi sau sửa, migration và test; báo rõ đã commit/push hay chưa, có deploy/remote test hay chưa. Không nói bản live đã hết lỗi từ kết quả unit test.
- [ ] Sau release theo dõi lỗi migration/sync/claim, item count và damage/drop; nếu rollback, bảo toàn đồ và thưởng đã nhận, không chạy lại thưởng.
- [ ] Cập nhật checkbox cả runbook và backlog nguồn; các ticket thiết kế/chưa tái hiện giữ trạng thái đúng. Bàn giao danh sách cần dữ liệu/thiết bị, không ghi “fix toàn bộ” nếu còn ticket mở.

**Điều kiện hoàn thành tổng:** P0 được nghiệm thu về dữ liệu và online; P1/P2 bug đã có bằng chứng fix; toàn bộ skill đã chạy lượt local; đề xuất thiết kế có quyết định hoặc follow-up rõ; không còn lỗi mất/dup tài sản ở ca đã liệt kê.
