# Sửa merge PR — 08/10/2026

PR #19 đã được merge vào main tại `053e3b5`; commit `3ea445f` đã xử lý các xung đột trong ảnh. Nhánh có thay đổi mới sau PR này nên cần PR mới để review.

CI tại `4ba5a60` thất bại ở session browser smoke: vòng chờ reload đọc document cũ rồi gọi `setFeatureFlags` trong document mới chưa tải. Sửa bằng chuyển qua about:blank và chờ đúng URL, document complete cùng các hàm game trước khi kiểm tra reconnect. Giữ toàn bộ assertion và receipt checks.

Sửa kích thước nút progression bằng selector scoped có specificity cao hơn CSS nút nhỏ, giữ ngưỡng 44px. Công việc G05 đang có trong workspace được bảo toàn và kiểm tra cùng bản sửa.

Kiểm chứng local: contracts pass; 260/260 test pass; 4/4 progression test pass; Chromium cả ba mode/mobile/desktop pass; hai client D1 pass shared state, mất ACK/retry, reload reconnect, hạ boss thật và receipt một lần.

Đã merge main không xung đột và push `51c1905`; xác nhận remote SHA bằng git ls-remote. D1 suite 38/38 pass. CI mới: https://github.com/peakpoint-foto/jx-idle/actions/runs/37784364781 (đang chạy khi ghi).

GitHub API trả Forbidden cả lần thử thông thường và escalated khi đọc/tạo PR; Git HTTPS fetch/push hoạt động. Chưa tạo được PR mới. Không coi CI remote mới là pass trước khi có kết quả. Chưa deploy hoặc tự merge PR mới.
