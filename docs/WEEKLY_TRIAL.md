# P06 — Thử thách tuần PHLT (DONE local)

Flag `weekly_trial` (chỉ PHLT, mặc định tắt, online, `requires: coop_rescue`). Chạy trên hạ tầng phiên của C05/P05, nên cần thêm `party_lobby` và `party_combat`. CTC và 2.0 không thấy gì.

## Vì sao kết quả tin được

Máy chủ **tự mô phỏng** toàn bộ chuyến chạy từ snapshot đã xác thực (`calc` phía Worker) và trạng thái đóng băng của phiên; không có endpoint nào nhận điểm, kết quả hay replay từ client (thân request có trường lạ bị từ chối `forged_session_action`). Điểm chỉ được ghi khi **mô phỏng của máy chủ** kết thúc phiên; phiên bị hủy bởi vận hành (tắt flag) hoặc hết hạn khi chưa chạy hết mô phỏng giữ trạng thái `active` nên không bao giờ được ghi.

## Luật tuần

- Tuần UTC bắt đầu Thứ Hai 00:00 UTC (07:00 giờ Việt Nam), cùng chỉ số tuần với các hệ thống tuần khác (`worker/src/activity.js`).
- **Seed là hàm thuần của phiên bản luật và tuần** (FNV-1a trên `trial-v1:<tuần>`), nên mọi người cùng một chuỗi ngẫu nhiên và nó không đổi giữa tuần. Phiên giữ tuần lúc bắt đầu: chạy vắt qua nửa đêm Chủ Nhật vẫn ghi vào tuần cũ.
- Luật tuần chọn từ danh sách cố định 4 mục theo `tuần mod 4`: `iron` (phòng thủ chủ tướng ×2), `swift` (chủ tướng đánh mỗi 0,75 giây), `tough` (HP ×1,25), `ward` (sát thương chủ tướng ×0,9). Bảng gắn nhãn `trial-v1:<luật>`; nếu sau này đổi phiên bản luật giữa tuần thì bảng tuần đó bắt đầu lại (kết quả cũ giữ nguyên nhãn cũ).
- **Chuỗi chủ tướng tuyệt đối** (không co theo sức người chơi): HP chặng k = `1200 × 1,35^k × (luật)`, sát thương tăng 30% mỗi chặng. Các build mạnh hơn đi sâu hơn. Chuyến **ngắn 3 chặng**, **dài 6 chặng**, tối đa 480 nhịp (120 giây thực).
- Người chơi chỉ điều khiển Phòng thủ và Hồi phục; mô phỏng tự đánh phần còn lại.

## Bảng và hạn mức

- Điểm = số chặng đã hạ + phần trăm HP đã trừ ở chặng đang đánh (hoàn thành là đúng số chặng). Mỗi tài khoản giữ kết quả tốt nhất theo (tuần, chuyến, nhãn luật); lần tệ hơn không hạ điểm. Hòa điểm thì ai đạt trước xếp trước, tiếp đến theo mã tài khoản; kết quả của phiên chỉ được tính một lần (`trial_recorded`).
- Chỉ nhân vật PHLT đã xác thực, không bị gắn cờ mới hiện trên bảng; bị gắn cờ thì biến mất khỏi bảng và không xem được (`trial_locked`).
- Tối đa **5 lượt mỗi ngày UTC**, kiểm tra nguyên tử trong chính câu lệnh tạo phiên (`trial_attempts_used`); tạo lặp trả về phiên đang chạy. Chuyến chỉ chạy **một mình** (`trial_solo_only`); nhân vật không phải PHLT bị từ chối.
- **Không có thưởng**; `claim` bị từ chối và sổ cái không được ghi.

## Dữ liệu

`migrations/0012_weekly_trial.sql` (cũng trong `ensureSchema`): `trial_results` và `trial_recorded`. Chỉ thêm bảng. Rollback = tắt flag; kết quả giữ nguyên.

## Giao diện

Panel "Thử thách tuần PHLT" trong tab Khác: cửa sổ tuần theo giờ Việt Nam, luật tuần, lượt còn lại, hai bảng (thoát HTML), nút chạy ngắn/dài. Nút tự chuẩn bị phòng một người (tạo nếu chưa có, sẵn sàng, từ chối nếu đang ở phòng nhóm). Phiên hiển thị chặng và điểm, không có nút nhận thưởng.

## Kiểm chứng

- `worker/test/session_engine.test.js` (+2): chỉ solo PHLT, chuỗi chủ tướng không phụ thuộc người chơi, bốn luật tuần đúng điều đã hứa, chuyển chặng và hoàn thành, parity client–Worker 10 phái.
- `worker/test/weekly_trial.test.js` (7 case, SQLite và D1 runtime): hàm tuần/seed/luật, guard cờ-mode-chiều dài-solo, cùng chuỗi chủ tướng và xếp hạng theo kết quả do máy chủ làm, hòa điểm và lần tệ hơn, hạn mức lượt và reset nửa đêm UTC, đổi tuần (bảng mới, phiên giữ tuần cũ), loại người bị gắn cờ và chặn mọi đường gửi kết quả.
- `test/weekly_trial.test.mjs` (6 case): danh tính, giờ Việt Nam, thoát HTML, throttle và bỏ phản hồi cũ, luồng bắt đầu (phòng → sẵn sàng → phiên), panel phiên không thưởng.
- `scripts/session-browser-smoke.mjs`: chạy một chuyến ngắn thật trên Worker, cả hai trình duyệt thấy cùng bảng, nút chạm ≥44px, không tràn ngang, không ghi sổ cái.
- Mô phỏng hiệu chỉnh: 10 phái ở cấp 60/100, độ sâu 0–3 với phòng thủ giúp ích; không build nào thoát hết hay chết ngay toàn bộ.

## Giới hạn

- Hệ số cân bằng (HP gốc 1.200, tăng 1,35, sát thương +30%, bốn luật) chưa playtest với người chơi thật; mô phỏng dùng nhân vật dựng sẵn từ bộ sinh đồ của game.
- Không có thưởng hay danh hiệu; chưa có chốt tuần/cosmetic như C08.
- Phụ thuộc vào xác thực nhân vật PHLT (ngưỡng giờ chơi rộng, xem ONLINE_MODES.md); build gian lận tinh vi nằm trong dung sai đó có thể lên bảng.
- Mỗi lượt tốn tối đa 120 giây phiên polling 1 giây; chưa đo tải; chưa staging.
