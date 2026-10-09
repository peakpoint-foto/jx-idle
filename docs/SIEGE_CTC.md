# C07 — Công thành tổ đội CTC (DONE local)

Flag `party_siege` mặc định tắt, chỉ CTC, nằm trên nền C05/C06 (`party_lobby` + `party_combat`). Công thành đơn người (`js/siege.js`: 3 lớp NPC, Lệnh công thành, shop tuần, quota client) giữ nguyên; tổ đội dùng đường riêng do server quyết định mọi kết quả.

## Cơ chế (engine `js/session_combat.js`, activity `siege`)

- 3 điểm chiếm `p1`–`p3`, mỗi điểm cần 12 tiến độ. Lệnh `capture` cộng 1 cho điểm đích (cộng 2 nếu người chiếm đang được tiếp tế). Điểm chưa chiếm xong mà không ai chạm trong tick thì tụt 0.25 tick đó. Điểm đã chiếm là vĩnh viễn trong phiên.
- Chủ tướng bị khóa sau cổng: sát thương chỉ còn 20% và HP không xuống dưới 1 cho đến khi chiếm đủ 3 điểm. Do đó thắng bắt buộc phải chiếm điểm; chỉ gây sát thương thì không thắng được.
- Lệnh `supply` (đồng đội khác, không tự tiếp tế): hồi 10% nội lực tối đa của mục tiêu (chỉ khi mục tiêu thiếu), tốn 5 MP, hồi chiêu 6 giây; mục tiêu được chiếm nhanh +1 trong 8 tick. Contribution `logistics` bằng lượng nội lực thực sự hồi.
- Lệnh `capture` ghi contribution `capture`. `guard` và `support` giữ nguyên.
- `party` và `dungeon` không đổi từng bit: các trường `capture/logistics/points/gate/supplyUntil` chỉ tồn tại ở `siege`. Hằng số trong `SESSION_SIEGE`.

## Server (`worker/src/sessions.js`)

- `create` nhận `activity: 'siege'` khi `party_siege` bật; tắt thì 403 `feature_disabled`. Tắt flag khi đang chạy sẽ abort phiên và nhả roster, giữ nguyên state/receipt.
- Lệnh hợp lệ thêm `capture` (đích `p1`–`p3`) và `supply` (đích là thành viên khác); đích sai trả 400 `bad_session_command`. `capture`/`supply` bị từ chối ở phiên `party` và `dungeon`.
- Quota: mỗi tài khoản một phiên siege đang chạy hoặc đã hoàn thành trong mỗi tuần UTC (tuần bắt đầu Thứ Hai 00:00 UTC, cùng chỉ số tuần với `worker/src/activity.js`). Kiểm tra hai lần: trước khi tạo (trả 409 `siege_quota_used`) và nguyên tử trong chính câu lệnh `INSERT`. Phiên bị hủy (hết hạn, tắt flag, tất cả rời, bị hạ toàn bộ) hoàn lại lượt. Nếu bất kỳ thành viên nào của phòng đã dùng lượt thì cả phòng không tạo được. Tạo lặp từ chủ phòng trả về chính phiên đang chạy, không báo hết lượt.
- Thưởng: chung receipt và cap E04 như C05/C06 (tối đa 1 công trạng mỗi phiên, 3/ngày UTC, ví 30; cần contribution thật, người rời không nhận); nguồn sổ cái là `siege_completion`. Không cấp trang bị, không cấp Lệnh công thành. Claim lặp trả cùng receipt.
- Không cần migration: dùng bảng sẵn có; trạng thái siege nằm trong JSON `state`.

## UI (`js/online_sessions.js`, tab Khác)

Nút "Công thành tổ đội" chỉ hiện khi bật `party_siege`. Phiên đang chạy hiển thị trạng thái cổng, 3 điểm với tiến độ và nút Chiếm (ẩn khi đã chiếm), nút Tiếp tế cho từng đồng đội khác, đóng góp chiếm/tiếp tế. Lỗi hết lượt tuần có thông báo riêng và không để lệnh treo chờ thử lại.

## Kiểm chứng

- Engine: `worker/test/session_engine.test.js` (siege: chiếm điểm, suy giảm, cổng, tiếp tế, thắng; parity client–Worker 10 phái × 2/4 người).
- Server D1/SQLite: `worker/test/sessions.test.js` 3 case siege (default-off, validation đích lệnh, chiếm đồng thời, tiếp tế, hoàn thành và claim idempotent, quota tuần gồm ranh giới Thứ Hai 00:00 UTC, hoàn lượt khi hủy/tắt flag, tạo lặp).
- Client: `test/online_sessions.test.mjs` 2 case (panel, nút theo trạng thái, body lệnh, lỗi quota).
- Trình duyệt: `scripts/session-browser-smoke.mjs` hai context riêng (360/1280) chơi một phiên siege thật tới hạ chủ tướng, claim hai lần mỗi người, receipt đúng 2, nút chạm ≥44px.

## Giới hạn

- Số liệu (12 tiến độ, suy giảm 0.25, 20% sát thương, tiếp tế 10%/8 tick) là giá trị khởi điểm chưa playtest; chưa đo tải riêng cho siege (dùng chung polling C05).
- Engine vẫn chỉ có đánh thường/cơ bản và utility phiên, không di chuyển hay pet; chiếm điểm là lệnh, không phải vị trí trên bản đồ.
- Công thành đơn người vẫn tính điểm, Lệnh và trang bị phía client như trước; đường tổ đội không dùng chúng.
- Chưa deploy, chưa staging; không tuyên bố đo trên thiết bị thật.
