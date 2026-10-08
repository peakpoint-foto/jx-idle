# Backlog thực thi — Võ Lâm Idle, ba mode

Ngày soạn: 08/10/2026 (Asia/Saigon). Baseline kiểm tra: branch `feat/online-multiplayer`, commit `68124fe`.
Đây là đặc tả bàn giao, không phải xác nhận toàn bộ tính năng đã hoàn thành. Tiến độ hiện tại nằm trong AGENT_TODO.md và EXECUTION_EVIDENCE.md. Agent phải kiểm tra HEAD và trạng thái PR trước khi làm; lần tạo PR trước bị lỗi xác thực, chưa có URL PR được xác nhận.

## Mục tiêu và luật bắt buộc

- CTC (`ctc`): tiến trình dài hạn, Xanh/Vàng (`rarMax=2`), không Hoàng Kim/Bạch Kim/Tím, không lab/rforge/admin; tốc độ 1, difficulty cố định. Phát triển phối hợp và cạnh tranh sau khi có xác thực server.
- PHLT (`phlt`): khó, săn Tím/Hoàng Kim (`rarMax=4`), có lab/rforge, không Bạch Kim/admin; tốc độ 1. Hành trình sinh tồn là hoạt động thêm có flag, không thay toàn bộ mode hoặc xóa đồ lâu dài.
- 2.0 (`g2`): tiến trình nhanh, tới Bạch Kim (`rarMax=5`), có lab/rforge/admin, tốc độ theo config. Sandbox không lưu phải tách tiến trình thường và mọi bảng hạng.
- Giữ quota hiện tại từ code. Mọi đề xuất lượt mới/catch-up/season cần config và nghiệm thu riêng; không suy ra từ mô tả brainstorming.
- Không chuyển ngược từ g2 về CTC/PHLT; không nhập reward, điểm ranked hoặc tài nguyên thử nghiệm vào kinh tế CTC.
- Tài khoản/API hiện chỉ phục vụ CTC: `parseSave` từ chối mode khác. PHLT/g2 online là phần mở rộng cần schema, mode authorization và migration riêng.
- Duel/bang/boss/phòng đã có MVP trong baseline, cần gia cố; phòng polling không đồng nghĩa combat realtime.
- `js/modes.js` là nguồn kiểm chứng luật hiện tại, README là tài liệu đối chiếu; khi khác nhau, đọc code và ghi lại sai lệch trước sửa.

## Kết quả audit kỹ năng làm đầu vào

Audit tái kiểm tra ngày 08/10/2026: 106 dòng addskilldamage, gồm 76 tới kỹ năng học được cùng phái, 15 tới ID có tồn tại nhưng không nằm trong danh sách học của phái và 15 tới ID thiếu. Số 18 dòng thiếu trong báo cáo trước là lỗi tổng hợp, đã sửa tại đây.
15 dòng thiếu gồm: Thiếu Lâm 271→1083/1055; Đường Môn 249→340; Ngũ Độc 384→383, 71→354; Nga Mi 82→331, 385→329; Thúy Yên 105→382, 113→338, 111→338, 337→1065/1093; Thiên Nhẫn 148→363; Võ Đang 158→162; Côn Lôn 176→373.
76 liên kết học được đã tăng sát thương trong kiểm tra công thức; điều đó chưa chứng minh cân bằng, UI, mana, combat thực tế hay tất cả kỹ năng con đúng. Các ID tồn tại ngoài danh sách học phải kiểm tra quan hệ cha/con, không tự coi là lỗi.
Không đoán ID thay thế. Nếu thiếu nguồn gốc, tách phần có bằng chứng để sửa và đánh dấu mapping chưa giải quyết.

## Cách đọc và nhận task

Ưu tiên: P0 nền/cổng phát hành; P1 MVP có giá trị; P2 mở rộng sau MVP; P3 chỉ làm khi đủ nền.
`none` nghĩa là không có phụ thuộc task, vẫn phải tuân thủ luật mode. Mỗi task hoàn thành cần implementation, kiểm chứng và tài liệu nếu hành vi thay đổi.
File dưới đây là điểm bắt đầu tìm mã, không phải danh sách giới hạn hay bảo đảm mọi tính năng nằm trong một file. File mới phải được nối đúng thứ tự script trong index.html và bundle Worker khi ảnh hưởng calc/validation.
Không dùng thời gian ước tính như cam kết; C05/E05 cần spike để biết hạ tầng, chi phí và quy mô trước khi chia implementation tiếp.

## Phạm vi và cổng quyết định

- Các task địa phương, không tiền tệ, dùng luật sẵn có có thể triển khai theo thứ tự phụ thuộc.
- Mapping skill không có bằng chứng, thay rarity/quota, mất đồ khi chết, chuyển tài nguyên giữa mode: ghi quyết định cần giải quyết; không tự đổi luật.
- C05 phải kết thúc bằng ADR và prototype local có số đo. Chọn hạ tầng cần dịch vụ/tài khoản/ngân sách mới hoặc triển khai external phải chốt cấu hình/ủy quyền trước bước đó.
- E05 khóa cho đến khi có server inventory/ledger; không mở chợ chỉ dựa snapshot save.
- Chưa đưa thanh toán/monetization vào backlog. README hiện giới hạn sử dụng phi thương mại.
- Các phần chưa có tài sản gốc dùng placeholder được phép, không thêm tài sản không rõ nguồn.

## Backlog chi tiết

### F01 — Chốt hợp đồng luật ba mode

- Ưu tiên: P0; mode: shared; phụ thuộc: none.
- Điểm bắt đầu: js/modes.js; js/workflow_rules.js; README.md.
- Thực hiện: Lập ma trận rarity, tốc độ, quota, chuyển mode, tính năng online và sandbox từ code; thêm tài liệu về capability mới, mặc định tắt.
- Nghiệm thu: Không đổi rarity/quota hiện có; mọi tính năng mới có mode áp dụng và chính sách reward rõ; PHLT expedition là hoạt động tùy chọn.
- Kiểm chứng bắt buộc: Kiểm tra modeItemOk, modeSanitize, quota và chuyển sang g2; save cũ vẫn hợp lệ.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### F02 — Audit và sửa trục bổ trợ kỹ năng

- Ưu tiên: P0; mode: shared; phụ thuộc: F01.
- Điểm bắt đầu: data.js; js/core.js; js/stats.js; worker/test/validate.test.js.
- Thực hiện: Xuất đồ thị addskilldamage theo 10 phái; phân loại đích học được, kỹ năng con và ID thiếu; đối chiếu nguồn trước khi sửa, ghi provenance cho từng mapping.
- Nghiệm thu: 76 liên kết học được giữ hiệu lực; 15 dòng thiếu được khôi phục có bằng chứng hoặc ghi unsupported rõ; không nối nhánh bằng tên gần giống; không cộng trùng bonus cha/con.
- Kiểm chứng bắt buộc: Kiểm thử từng liên kết, kỹ năng con, chưa học, đúng/sai vũ khí, bonus cấp và cả ba mode; client/Worker tính giống nhau.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### F03 — Cây kỹ năng và mô tả bổ trợ thật

- Ưu tiên: P0; mode: shared; phụ thuộc: F02.
- Điểm bắt đầu: js/ui.js; js/jxorig.js; js/stats.js.
- Thực hiện: Hiển thị trục theo phái, kỹ năng nguồn/đích, % theo cấp thực, điều kiện vũ khí, lý do chưa kích hoạt; giữ danh sách đọc được trên mobile.
- Nghiệm thu: UI lấy cùng dữ liệu resolver với tính toán; phân biệt nội tại/buff/bùa/unsupported; tăng/rút điểm cập nhật ngay; không báo hiệu lực khi không có.
- Kiểm chứng bắt buộc: Đối chiếu UI với bonus tính được; thử 10 phái, mobile, skill chưa học và ID unsupported.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### F04 — Hợp đồng combat và tương thích server

- Ưu tiên: P0; mode: shared; phụ thuộc: F01,F02.
- Điểm bắt đầu: js/combat.js; js/stats.js; worker/build-game.mjs; worker/src/validate.js.
- Thực hiện: Định nghĩa damage, hit, kháng, khống chế, mana, snapshot và version công thức; kiểm tra thứ tự script và bundle Worker khi thêm module.
- Nghiệm thu: Không có công thức gameplay riêng bị lệch giữa client/server; damage event đủ phân biệt sát thương thô/hữu ích/độc/hồi phục.
- Kiểm chứng bắt buộc: Fixture cố định so client với GAME.calc; ngoại công/nội công, shield, DOT và thay đổi mode.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### F05 — Save có phiên bản, migration và phục hồi

- Ưu tiên: P0; mode: shared; phụ thuộc: F01.
- Điểm bắt đầu: js/save.js; js/modes.js; js/workflow_overrides.js; worker/src/account.js.
- Thực hiện: Thêm migration cho build/hoạt động mới; backup trước migration; định nghĩa resume hoạt động, chuyển mode và xung đột nhiều thiết bị.
- Nghiệm thu: Giữ cid, điểm, đồ và token đúng nhân vật; migration chạy lặp không đổi dữ liệu; không làm modeSanitize bán đồ do schema mới bị hiểu sai.
- Kiểm chứng bắt buộc: Save cũ của ba mode, dữ liệu lỗi, storage đầy, reload giữa hoạt động, conflict và chuyển mode.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### F06 — Gia cố nền online hiện có

- Ưu tiên: P0; mode: ctc; phlt/g2 opt-in sau; phụ thuộc: F01,F04,F05.
- Điểm bắt đầu: worker/src/social.js; worker/src/account.js; worker/src/db.js; js/online.js.
- Thực hiện: Audit duel/guild/room/sync: CAS revision, idempotency, giới hạn request, quyền, room hết hạn, capacity và boss quota khi concurrent.
- Nghiệm thu: Hai request đồng thời không nhận thưởng trùng, vượt cap phòng/bang hoặc 3 lượt boss/ngày; không tăng XP bang vô hạn bằng donate miễn phí; room hết hạn không khóa tài khoản.
- Kiểm chứng bắt buộc: Integration D1: concurrent join/attack/accept/sync, retry, timeout, token sai, flagged và pending_verification; kiểm tra đổi ngày/tuần.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### F07 — Capability và feature flags theo mode

- Ưu tiên: P0; mode: shared; phụ thuộc: F01,F04.
- Điểm bắt đầu: js/modes.js; worker/src/index.js; js/uihub.js.
- Thực hiện: Định nghĩa registry tính năng, scope mode, config version và mặc định; server kiểm tra quyền mode độc lập UI; không hard-code bật cả ba mode.
- Nghiệm thu: Tắt feature không xóa save; mode không được phép bị API từ chối; offline vẫn mở game khi config lỗi.
- Kiểm chứng bắt buộc: Flag on/off, config cũ/mất mạng, request giả mode và reload giữa hoạt động.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### B01 — Phòng luyện DPS có điều kiện cố định

- Ưu tiên: P1; mode: g2 đầu; shared sau; phụ thuộc: F02,F04,F07.
- Điểm bắt đầu: js/stats.js; js/combat.js; js/admin.js; js/ui.js.
- Thực hiện: Chọn target, kháng, số lượng, seed, thời lượng; báo DPS hữu ích, mana và bonus theo nguồn; không dùng hệ số sandbox để đo ranked.
- Nghiệm thu: So sánh hai build cùng điều kiện lặp lại được; không cấp EXP/vàng/đồ; số đo DOT và thời gian thiếu mana đúng.
- Kiểm chứng bắt buộc: Cùng seed cho cùng kết quả; DOT, AoE, sustain, pause/retry và không ghi reward.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### B02 — Lưu và đổi cấu hình build

- Ưu tiên: P1; mode: shared; phụ thuộc: F03,F05.
- Điểm bắt đầu: js/builds.js; js/save.js; js/quick.js; js/ui.js.
- Thực hiện: Lưu điểm, ID trang bị, main skill, hotbar và rotation; validate mode/phái/ngân sách; chỉ đổi ở trạng thái cho phép.
- Nghiệm thu: Không nhân đồ, cộng thêm điểm hoặc né quota; item thiếu báo lỗi/preview; cấm đổi khi đang trận ranked hoặc expedition.
- Kiểm chứng bắt buộc: Thiếu item, sai phái/mode, respec, reload, đang siege/tower và storage lỗi.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### B03 — Gợi ý build và trang bị theo mục tiêu

- Ưu tiên: P1; mode: shared; phụ thuộc: B01,B02.
- Điểm bắt đầu: js/builds.js; js/gear_policy.js; js/stats.js.
- Thực hiện: DPS boss/farm/sống sót cho CTC; kháng/mana/vật tư cho PHLT; combo/thử nghiệm cho g2; giải thích lợi ích và điều kiện.
- Nghiệm thu: Chỉ dùng skill/đồ có thật và được mode cho phép; không tự phân điểm/mặc nếu chưa chọn áp dụng; giữ item khóa.
- Kiểm chứng bắt buộc: Đúng/sai vũ khí, dòng ẩn, đồ bị khóa, từng rarity cap và chỉ số trước/sau.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### B04 — Báo cáo trận và nguyên nhân tử trận

- Ưu tiên: P1; mode: shared; phụ thuộc: F04,F05.
- Điểm bắt đầu: js/combat.js; js/journal.js; js/activities.js.
- Thực hiện: Thu thập damage/heal/control/mana và timeline giới hạn dung lượng; mode có màn tổng kết riêng; xuất chẩn đoán có lựa chọn.
- Nghiệm thu: Không coi overheal/overkill là đóng góp; DOT không cộng hai lần; chỉ kết luận nguyên nhân từ event thật.
- Kiểm chứng bắt buộc: Nhiều nguồn damage, shield, DOT, hồi sinh, abort và giới hạn bộ nhớ khi chạy lâu.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### B05 — Tự chiến đấu theo chính sách

- Ưu tiên: P1; mode: shared; phụ thuộc: B02,B04.
- Điểm bắt đầu: js/auto.js; js/control.js; js/quick.js.
- Thực hiện: Profile ưu tiên mục tiêu, thuốc, buff và giữ khống chế; điều kiện theo mode; manual có ưu tiên, cho xem lý do chọn hành động.
- Nghiệm thu: CTC ưu tiên mục tiêu nhiệm vụ; PHLT bảo toàn vật tư; g2 thử rotation; không spam skill/thuốc khi không đủ tài nguyên.
- Kiểm chứng bắt buộc: Cooldown, thiếu mana, potion quota, target chết, chuyển manual và ngừng hoạt động.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C01 — Boss có pha và vai trò đóng góp

- Ưu tiên: P1; mode: ctc; phụ thuộc: F04,F07,B04.
- Điểm bắt đầu: js/activities.js; js/combat.js; js/rewards.js.
- Thực hiện: MVP một boss với báo vùng nguy hiểm, trận kỳ và ngắt hồi; role từ build, không khóa phái; reward theo việc hoàn thành.
- Nghiệm thu: Một cơ chế có thể hoàn thành bằng nhiều phái; hỗ trợ được ghi nhận; abort không thưởng chiến thắng.
- Kiểm chứng bắt buộc: 10 phái, telegraph mobile, phase threshold, wipe/abort và reward một lần.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C02 — Bang online hoàn chỉnh

- Ưu tiên: P1; mode: ctc; phụ thuộc: F06,F07,B02.
- Điểm bắt đầu: worker/src/social.js; worker/src/db.js; js/online.js.
- Thực hiện: Owner/officer/member, chuyển quyền, kick/leave, nhật ký, lịch và contribution có nguồn xác thực; giữ bang local tách biệt.
- Nghiệm thu: Owner không bị mắc kẹt; chỉ role hợp lệ quản lý; API không nhận số đóng góp tự khai; migration giữ thành viên cũ.
- Kiểm chứng bắt buộc: Quyền chéo bang, owner leave/transfer đồng thời, retry, cap và nguồn đóng góp.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C03 — Duel giao hữu và ranked có giải thích

- Ưu tiên: P1; mode: ctc; phụ thuộc: F06,F07.
- Điểm bắt đầu: worker/src/social.js; js/online.js; worker/src/ladder.js.
- Thực hiện: Tách giao hữu/ranked; dùng snapshot/version hợp lệ; ghép cùng bracket và sức mạnh; lịch sử phân xử; giữ async là async.
- Nghiệm thu: Ranked không dùng snapshot flagged/pending hoặc quá cũ; accept trùng không cộng điểm trùng; có mùa và TTL rõ.
- Kiểm chứng bắt buộc: Challenge/accept/decline/expiry concurrent; self-duel, abuse cặp lặp, season boundary và tie.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C04 — Bạn bè, mời phòng và sảnh sẵn sàng

- Ưu tiên: P1; mode: ctc; mode khác flag riêng; phụ thuộc: F06,F07,C02.
- Điểm bắt đầu: worker/src/social.js; worker/src/db.js; js/online.js.
- Thực hiện: Friend/invite TTL, phòng 4 người, mục tiêu, role, ready, leader transfer, reconnect; chỉ làm lobby trong task này.
- Nghiệm thu: Presence stale hiển thị đúng; invite chỉ người nhận sử dụng; đồng thời join không vượt 4; không quảng cáo combat realtime.
- Kiểm chứng bắt buộc: Join/leave/reconnect/expiry concurrent, chủ phòng mất mạng, invite replay và người khác mode.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C05 — Server quản lý phiên trận và phần thưởng

- Ưu tiên: P0 gate multiplayer; mode: ctc đầu, phlt/g2 qua capability riêng; phụ thuộc: F04,F05,F06,F07,C04.
- Điểm bắt đầu: worker/src/index.js; worker/src/db.js; worker/build-game.mjs; wrangler.jsonc.
- Thực hiện: Spike so sánh polling/session store với Durable Objects; ADR chọn transport; authoritative seed/tick/action validation/result và receipt idempotent.
- Nghiệm thu: Có demo 2 client cùng trạng thái; retry/reconnect không thưởng trùng; client không tự gửi kết quả thắng để nhận reward; có chi phí vận hành đo được.
- Kiểm chứng bắt buộc: Forged action, action trễ/trùng, disconnect, room crash, resume và completion retry.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C06 — Phụ bản tổ đội đầu tiên

- Ưu tiên: P2; mode: ctc; phụ thuộc: C01,C04,C05.
- Điểm bắt đầu: js/activities.js; js/combat.js; js/online.js; worker/src/social.js.
- Thực hiện: Một map, một boss, 2-4 người; nhiệm vụ giữ boss/phá trận/hỗ trợ; loot policy hiển thị trước ready.
- Nghiệm thu: Có thể hoàn thành bằng nhiều tổ hợp phái; contribution hỗ trợ hợp lệ; reconnect đúng; đồ/reward theo cap CTC.
- Kiểm chứng bắt buộc: 2/4 client, leader rời, wipe/retry, late join, loot receipt và exploit đứng ngoài.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C07 — Công thành và Tống Kim theo mục tiêu

- Ưu tiên: P2; mode: ctc; phụ thuộc: C02,C05,C06.
- Điểm bắt đầu: js/siege.js; js/activities.js; worker/src/social.js.
- Thực hiện: MVP chiếm điểm/phá cổng/tiếp tế; lệnh nhanh; contribution theo vai trò; giữ quota hiện tại; mở thử theo flag.
- Nghiệm thu: Không tiêu lượt hai lần; phòng thủ/hậu cần có đóng góp; thắng không chỉ dựa damage; server quyết định score/reward.
- Kiểm chứng bắt buộc: Capture race, abort, reconnect, quota concurrent và reward/shop tuần.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### C08 — Mùa xếp hạng và hậu cần bất đồng bộ

- Ưu tiên: P2; mode: ctc; phụ thuộc: C03,C05,C07.
- Điểm bắt đầu: worker/src/ladder.js; worker/src/db.js; js/rewards.js.
- Thực hiện: Bảng theo phái/bracket, cosmetic/title; task bang bất đồng bộ có cap; mùa có giờ bắt đầu/kết thúc rõ.
- Nghiệm thu: Không chuyển tài nguyên g2 vào ranked; cutoff và claim idempotent; người ít thời gian có đóng góp nhưng không farm vô hạn.
- Kiểm chứng bắt buộc: Season rollover, timezone, claim retry, tied scores và snapshot validation.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### P01 — Hành trình sinh tồn tùy chọn

- Ưu tiên: P1; mode: phlt; phụ thuộc: F01,F05,F07,B04.
- Điểm bắt đầu: js/survival.js; js/modes_play.js; js/save.js.
- Thực hiện: Thiết kế session expedition: chuẩn bị/chặng/nghỉ/rút/kết thúc; vật tư chuyến đi riêng; không đổi identity săn Hoàng Kim của mode.
- Nghiệm thu: Đồ đang mặc/kho lâu dài không mất khi fail; reload resume hoặc kết thúc có chính sách; không ghi đè activity khác.
- Kiểm chứng bắt buộc: State transitions, save giữa chặng, crash/reload, siege conflict và failure migration.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### P02 — Vật tư, địa hình và rút lui

- Ưu tiên: P1; mode: phlt; phụ thuộc: P01,F04,B05.
- Điểm bắt đầu: js/survival.js; js/mapobs.js; js/combat.js.
- Thực hiện: Thuốc session, điểm nghỉ, đường rút, cơ chế truy đuổi; quyết định lấy thưởng/đi tiếp; MVP 3 chặng có cơ chế khác nhau.
- Nghiệm thu: Vật tư không âm; dùng thuốc session không trừ kho hai lần; rút hợp lệ chốt loot một lần; có telegraph/đường thoát khả thi.
- Kiểm chứng bắt buộc: No-pot, thuốc hết, đường bị chặn, rút/fail đồng thời, reload và reward duplicate.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### P03 — Chọn đường, hợp đồng rủi ro và đồ sinh tồn

- Ưu tiên: P1; mode: phlt; phụ thuộc: P02,B03.
- Điểm bắt đầu: js/survival.js; js/journal.js; js/loot.js.
- Thực hiện: Chọn 2 đường với enemy/loot preview; hợp đồng tùy chọn; đồ theo kháng/hồi phục; giữ cap Tím/Hoàng Kim, không Bạch Kim.
- Nghiệm thu: Mỗi lựa chọn có đánh đổi; thưởng nêu trước; kỹ năng khống chế giúp tiết kiệm tài nguyên; không ép một phái độc tôn.
- Kiểm chứng bắt buộc: Seed cố định, reward cap, roll range, nhiều build và exploit reset đường.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### P04 — Tiến trình tri thức và nhật ký chuyến đi

- Ưu tiên: P2; mode: phlt; phụ thuộc: P03,F05.
- Điểm bắt đầu: js/rewards.js; js/journal.js; js/save.js.
- Thực hiện: Mở công thức/thông tin kẻ địch/checkpoint cosmetic từ hành trình; fail giữ một phần progress đã xác định; báo cáo tài nguyên.
- Nghiệm thu: Không cộng chỉ số vô hạn làm mất thách thức; giới hạn unlock rõ; fail/abort khác nhau và không farm abort lấy progress.
- Kiểm chứng bắt buộc: Retry, unlock idempotent, bounds meta progress và migrate save.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### P05 — Co-op sinh tồn và cứu viện

- Ưu tiên: P2; mode: phlt; phụ thuộc: C05,P03,F07.
- Điểm bắt đầu: js/survival.js; js/online.js; worker/src/social.js.
- Thực hiện: Mở tài khoản PHLT qua task riêng có migration, không bỏ parseSave guard; 2-4 người, cứu đồng đội và chia loot/vật tư có luật.
- Nghiệm thu: Mode/session/reward tách CTC; rescue có chi phí; chủ phòng không tự gán loot; điểm cứu viện bất đồng bộ có cap.
- Kiểm chứng bắt buộc: API mode guard, cross-mode invite, rescue concurrent, disconnect và nguồn vật tư.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### P06 — Thử thách tuần đồng điều kiện

- Ưu tiên: P2; mode: phlt; phụ thuộc: P04,C05.
- Điểm bắt đầu: js/survival.js; worker/src/ladder.js; worker/src/db.js.
- Thực hiện: Seed/luật tuần, board theo độ sâu/mục tiêu; chọn chuyến ngắn/dài; kết quả do server xác thực.
- Nghiệm thu: Không dùng save g2/sandbox; mọi người cùng bộ luật đã version; timezone reset thống nhất; không thay seed giữa tuần.
- Kiểm chứng bắt buộc: Weekly rollover, submitted replay/forgery, ties, config changes và reconnect.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### G01 — Phòng thí nghiệm và so sánh build

- Ưu tiên: P1; mode: g2; phụ thuộc: B01,B02,F07.
- Điểm bắt đầu: js/admin.js; js/builds.js; js/ui.js.
- Thực hiện: UI A/B, mục tiêu, seed, chỉ số sustain/DPS; tách thử build bình thường khỏi phiên sandbox không lưu hiện có.
- Nghiệm thu: Sandbox không ghi save/kho/bang/collections/token; A/B ghi rõ điều kiện; thử không cấp reward.
- Kiểm chứng bắt buộc: Storage write spy sandbox, deterministic result, item missing và exit về save.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### G02 — Bí cảnh biến chiêu roguelike

- Ưu tiên: P1; mode: g2; phụ thuộc: F04,F05,F07,G01.
- Điểm bắt đầu: js/depth.js; js/activities.js; js/stats.js.
- Thực hiện: MVP 5 chặng, lựa chọn modifier theo trục; modifier chỉ sống trong session; replay thuận tiện.
- Nghiệm thu: Không sửa vĩnh viễn SK/data gốc; mọi modifier hết hiệu lực khi rời; không stack vô hạn; giữ quota/shop khác.
- Kiểm chứng bắt buộc: Session reset, modifier combinations, death/reload, damage parity và reward retry.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### G03 — Mã chia sẻ build và thư viện

- Ưu tiên: P1; mode: g2; phụ thuộc: G01,B02,F05.
- Điểm bắt đầu: js/builds.js; js/save.js; js/online.js.
- Thực hiện: Schema version chứa điểm/skill/hotbar/recipe đồ, không save/token; preview và validate trước import; lưu lịch sử đo.
- Nghiệm thu: Không import đồ/vàng từ mã; unknown ID báo lỗi; khác phái/version không tự áp; không gọi API CTC mặc định.
- Kiểm chứng bắt buộc: Tampered/oversized code, token leakage, unknown version và point budget.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### G04 — Giao hữu chuẩn hóa và thử thách cộng đồng

- Ưu tiên: P2; mode: g2; phụ thuộc: C05,G02,G03.
- Điểm bắt đầu: js/online.js; worker/src/social.js; worker/src/db.js.
- Thực hiện: Mode account riêng; chuẩn hóa chỉ số; preset luật có version; chia sẻ challenge, retry, moderation; chưa cho user chạy code tùy ý.
- Nghiệm thu: Sandbox bị loại khỏi board; reward không sang CTC; challenge chỉ chọn luật allowlist; kết quả có verification.
- Kiểm chứng bắt buộc: Malicious config, mode mismatch, reset spam, version drift và server outcomes.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### G05 — Tiến trình thử nhiều build

- Ưu tiên: P2; mode: g2; phụ thuộc: G02,G03,F05.
- Điểm bắt đầu: js/rewards.js; js/journal.js; js/save.js.
- Thực hiện: Achievement theo trục/thử thách/bộ sưu tập; reset session tùy chọn; hướng dẫn mở hệ thống nhanh mà không xóa tiến trình.
- Nghiệm thu: Reward một lần theo ID ổn định; reset không xóa collection ngoài phạm vi; không khuyến khích farm một build duy nhất.
- Kiểm chứng bắt buộc: Claim/reset/reload, duplicate achievement và migrate collection.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### E01 — Cẩm nang nguồn rơi và mục tiêu săn đồ

- Ưu tiên: P1; mode: shared; phụ thuộc: F01,F07,B03.
- Điểm bắt đầu: js/loot.js; js/guide.js; js/gear_policy.js.
- Thực hiện: Nguồn rơi thật theo mode, wishlist theo thuộc tính/build; loot filter tích hợp; không hứa tỷ lệ chưa có dữ liệu.
- Nghiệm thu: CTC không gợi ý Hoàng Kim; PHLT không gợi ý Bạch Kim; g2 đầy đủ; đồ khóa giữ nguyên; nguồn được lấy từ config.
- Kiểm chứng bắt buộc: Mode rarity, hidden lines, locked item, filter AND/OR và stale wishlist.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### E02 — Tái chế, chế tạo và chỉnh thuộc tính

- Ưu tiên: P1; mode: shared capability riêng; phụ thuộc: E01,F05.
- Điểm bắt đầu: js/forge.js; js/recipes.js; js/modes.js; js/stash.js.
- Thực hiện: PHLT/g2 dùng các hệ rèn được phép; CTC chỉ nghiên cứu sink tương thích, không tự bật rforge/lab/đồ bộ; preview chi phí và bảo vệ đồ.
- Nghiệm thu: Craft không vượt cap; thiếu tài nguyên không mất đồ; rollback lỗi lưu; chỉnh dòng có cap; bảo đảm tiến độ chỉ khi kinh tế đã thiết kế.
- Kiểm chứng bắt buộc: Concurrent click, storage failure, locked/equipped items, rarity and mode guards.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### E03 — Hiệu ứng trang bị theo lối chơi

- Ưu tiên: P2; mode: phlt/g2; ctc chỉ đồ hợp lệ; phụ thuộc: F02,F04,E02.
- Điểm bắt đầu: js/sets.js; js/stats.js; js/combat.js.
- Thực hiện: PHLT set giúp sinh tồn; g2 set đổi combo; CTC dùng dòng/đồ Xanh-Vàng được phép, không mở Hoàng Kim bằng task này.
- Nghiệm thu: Hiệu ứng có nguồn/điều kiện rõ; không đổi chỉ số nền ngoài mode; tránh stack feedback vô hạn.
- Kiểm chứng bắt buộc: Proc cooldown, DOT interactions, equip/unequip, mode transfer và Worker parity.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### E04 — Ledger tài nguyên và cân bằng sink/source

- Ưu tiên: P1; mode: shared; online economy riêng; phụ thuộc: F06,F07,E02.
- Điểm bắt đầu: js/rewards.js; worker/src/db.js; worker/src/social.js.
- Thực hiện: Danh mục nguồn/chi và cap; server ledger cho tài nguyên online; offline summary cục bộ; donation phải gắn nguồn hợp lệ.
- Nghiệm thu: Không tin delta balance từ client; receipt idempotent; PHLT session resource tách kho; g2 tách CTC; không ghi token trong log.
- Kiểm chứng bắt buộc: Duplicate claims, rollover, balance underflow, rollback và migration.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### E05 — Spike và MVP giao dịch có escrow

- Ưu tiên: P3 gated; mode: ctc trước; mode khác quyết định riêng; phụ thuộc: C05,E04,O03.
- Điểm bắt đầu: worker/src/db.js; worker/src/index.js; js/online.js.
- Thực hiện: ADR quyền sở hữu item, escrow, phí, rollback, audit và xử lý dispute; chỉ implement sau server inventory; ưu tiên giao dịch trực tiếp trước chợ.
- Nghiệm thu: Không trade item local tự khai; không dup/lost item khi retry; mode isolation; không mở payment/monetization.
- Kiểm chứng bắt buộc: 2-sided accept/cancel concurrent, crash midway, fraud, rollback và expiry.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### R01 — Onboarding và gợi ý việc tiếp theo

- Ưu tiên: P1; mode: shared UI khác mode; phụ thuộc: F03,B03,E01.
- Điểm bắt đầu: js/guide.js; js/uihub.js; js/quick.js.
- Thực hiện: CTC: build/hoạt động/bang; PHLT: gear/kháng/vật tư; g2: thử build; context hints dẫn đến đúng màn.
- Nghiệm thu: Không gợi ý tính năng bị flag tắt/chưa đủ điều kiện; tutorial lưu riêng; không chặn chơi bởi dialog lặp.
- Kiểm chứng bắt buộc: New/returning save, mode transfer, mobile, flag off và guide completion.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### R02 — Nhiệm vụ linh hoạt và thưởng người quay lại

- Ưu tiên: P2; mode: shared luật riêng; phụ thuộc: F01,F05,E04.
- Điểm bắt đầu: js/rewards.js; js/workflow_rules.js; js/events.js.
- Thực hiện: Mục tiêu tuần nhiều lựa chọn; tích lũy có cap; CTC đóng góp, PHLT hành trình, g2 thử build; offline summary/return guide.
- Nghiệm thu: Không tự đổi quota hiện có; mọi quota mới có cấu hình riêng; không farm đổi mode/đổi giờ để nhận lặp.
- Kiểm chứng bắt buộc: Clock backwards, week boundary, claim retry, quest cap and old save.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### R03 — Thành tựu, ngoại hình và chuyển sinh

- Ưu tiên: P2; mode: shared tách progression; phụ thuộc: F05,C08,P04,G05.
- Điểm bắt đầu: js/rewards.js; js/journal.js; js/doll.js; js/save.js.
- Thực hiện: CTC prestige/role; PHLT tri thức; g2 thư viện build; chuyển sinh đề xuất unlock ngang có ngân sách, tài liệu review trước chỉnh.
- Nghiệm thu: Không vô hạn điểm/kháng; không phá validate ngân sách skill/attr; legacy reborn không bị gắn cờ sai.
- Kiểm chứng bắt buộc: Multiple rebirth, budget validation, migrate, cosmetics mode and achievement claims.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### O01 — UX mobile và giảm thao tác

- Ưu tiên: P1; mode: shared layout riêng; phụ thuộc: F03,B04,R01.
- Điểm bắt đầu: js/uihub.js; js/jxshell.js; js/quick.js; ui/jx2.css.
- Thực hiện: Dashboard theo mode, search skill/item/activity, touch targets, tay thuận, reduced effects; batch nhận thưởng qua receipt hợp lệ.
- Nghiệm thu: Không che combat mobile; keyboard vẫn dùng; tác vụ batch không bỏ điều kiện/quota; UI phản ánh cap đúng mode.
- Kiểm chứng bắt buộc: Viewport dọc/ngang nhỏ, touch/keyboard, reduced motion, batch retry và hiệu năng dài phiên.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### O02 — Góp ý và telemetry có ngữ cảnh

- Ưu tiên: P1; mode: shared opt-in; phụ thuộc: F05,F07,B04.
- Điểm bắt đầu: js/feedback.js; worker/src/feedback.js; js/journal.js.
- Thực hiện: Mode/phái/version/build ID/activity/timeline rút gọn có consent; không gửi save/token mặc định; đo metric theo mode.
- Nghiệm thu: Redact token/contact ngoài mục cho phép; bounded payload; không gửi lặp vô hạn offline; player preview được dữ liệu.
- Kiểm chứng bắt buộc: Consent, redaction, payload size, rate limit, offline/retry và retention.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### O03 — Quản trị và moderation

- Ưu tiên: P1 trước public online; mode: shared; online theo mode được bật; phụ thuộc: F06,C02,C04,O02.
- Điểm bắt đầu: worker/src/feedback.js; worker/src/ladder.js; worker/src/social.js; js/admin.js.
- Thực hiện: Quyền admin tách sandbox, audit log, block/mute/report, xử lý cờ pending/flagged; chat scope phòng/bang sau khi moderation sẵn.
- Nghiệm thu: Không lộ ADMIN_KEY qua client bundle; block chặn invite/chat; có rate limit; user không chạy HTML/JS qua chat.
- Kiểm chứng bắt buộc: Permission checks, XSS, spam, report abuse, private data và audit trail.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

### O04 — CI, release flags và rollback

- Ưu tiên: P0 release gate; mode: shared; online theo mode được bật; phụ thuộc: F05,F07,O02.
- Điểm bắt đầu: package.json; worker/build-game.mjs; test/; worker/test/; wrangler.jsonc.
- Thực hiện: Check mode contracts/skill graph/save/API, local D1 integration, script order, generated bundle; staging rollout từng mode; tài liệu rollback.
- Nghiệm thu: Không deploy production khi chỉ làm task local; deploy là task được ủy quyền riêng; flag off phục hồi gameplay; migration additive trước destructive.
- Kiểm chứng bắt buộc: CI clean checkout, old DB/schema, rollback config, config outage và smoke cả 3 mode.
- Đầu ra: thay đổi nhỏ có thể review, bằng chứng kiểm chứng, cập nhật TODO; nếu bị chặn ghi nguyên nhân và phần đã hoàn thành.

## Definition of Done dùng chung

1. Scope task và mode đúng; không mở capability ở mode khác do dùng chung UI.
2. Chạy kiểm tra phù hợp thay đổi; với công thức/save/API: test hồi quy có tình huống lỗi, không chỉ happy path. UI cần kiểm tra thủ công mobile/desktop; không ghi “đạt” khi chưa chạy.
3. `npm test` hiện build bundle và chạy test ở `test/`, `worker/test/`; baseline lần trước 49/49, phải ghi kết quả mới. Local D1 smoke/integration riêng cho API/migration.
4. Reward/ownership/quota phải chịu được retry/concurrency; storage failure không mất đồ/điểm; save cũ có fixture migration.
5. Worker/client parity được kiểm chứng khi thay calc/skill. Không sửa hoặc commit `worker/gen/game.js` tự sinh.
6. Không ghi secret/token/save riêng vào log, telemetry, mã chia sẻ hoặc PR body.
7. Cập nhật mô tả/guide khi hành vi thay đổi; đánh dấu hạn chế còn tồn tại và task theo sau.
8. Diff không chứa thay đổi ngoài scope. Commit/PR/deploy theo yêu cầu phiên giao việc; không xem backlog là lệnh tự deploy/merge.

## Cổng nghiệm thu theo đợt

- Nền: F01–F07 và O04 phần CI local; skill graph có provenance/unsupported, migration giữ save và mode guard hoạt động.
- Build: B01–B05 + G01/G03; so sánh lặp lại, không reward từ phòng luyện, không leak token và sandbox không ghi.
- CTC MVP: C01–C04 + O03; lobby/async/bang ổn định, chưa gắn nhãn realtime khi chưa C05.
- PHLT solo: P01–P04; chết/rút/reload không mất gear lâu dài hoặc duplicate loot.
- 2.0 content: G02/G05; modifiers chỉ sống trong phiên, không lan CTC.
- Online phối hợp: C05–C08/P05–P06/G04 theo flag; máy chủ xác thực action/outcome/reward và có evidence nhiều client.
- Economy mở: E05 chỉ sau ledger và ownership, spike rõ chi phí/rủi ro/rollback.

## Đo lường nghiệm thu sản phẩm

Không đặt KPI phần trăm chưa có baseline. O02 ghi baseline trước, sau đó so sánh theo mode:
- CTC: số build khả thi theo phái, contribution hỗ trợ, chênh sức mạnh matchmaking, reward duplicate=0 trong test.
- PHLT: nguyên nhân chết, vật tư dùng, tỷ lệ rút so với chết, đường chọn, tiến độ fail giữ lại đúng luật.
- g2: số build thử, thời gian đến lần thử đầu, tỷ lệ replay challenge, độ lặp lại bài đo.
- Chung: crash/save failure, thời gian UI, network/request volume, reconnect và chi phí mỗi phiên online.

