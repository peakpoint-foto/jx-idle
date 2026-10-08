# O02 — Góp ý và metric có consent

Feedback text hiện có vẫn dùng được. feedback_diagnostics default-off ba mode; checkbox context và diagnostics mặc định không chọn. Diagnostics consent không nhớ giữa lần mở; context preference trong draft chỉ là lựa chọn trước đó của người chơi. Preview chụp lúc mở form, send dùng cùng snapshot. Diagnostics v1 có mode/phái/model, build fingerprint không phải ID tài khoản, activity allowlist và tối đa 32 event numeric/skill ID có thật. Không gửi actor/name/cid/token/save/item/extension/raw reason.

Client/server cùng helper redaction: ẩn mã có nhãn Bearer/token/ADMIN_KEY/recovery và email/số liên hệ phổ biến ngoài ô Liên hệ. Không bảo đảm nhận ra mọi bí mật vô nhãn trong văn bản tự do; người chơi kiểm tra mô tả trước gửi. Context keys allowlist, string 200 ký tự. Payload client tối đa 16 KiB, diagnostics đầu vào 16 KiB, request API feedback 32 KiB. Server yêu cầu diagnosticConsent=true và capability cho mode độc lập client; mode là phân loại self-report, không dùng xác thực progression.

Gửi chỉ theo nút người chơi, một request/nhấn, timeout10s và giữ draft khi offline; không auto retry/queue. Nút gửi khóa khi pending; server IP-hash 5/giờ. Retry sau timeout chưa có idempotency receipt, có thể tạo hai góp ý nếu request cũ thực sự thành công; cap chặn lặp vô hạn. Sandbox không ghi/xóa draft trước đó.

Retention90 ngày: purge lazy khi POST feedback/admin read/metrics; expired row không trả qua các endpoint đó. Không có cron hoặc hứa xóa physical đúng giờ nếu host không có truy cập. Webhook nếu host đã cấu hình vẫn chỉ gửi bản đã redact; lưu trữ của dịch vụ ngoài cần chính sách riêng. Không cấu hình/gửi webhook trong nghiệm thu local.

GET /api/admin/feedback/metrics dùng admin header server, trả số góp ý theo mode/category trong90ngày; unknown khi không có diagnostics consent. self_reported=true, không gọi đây là baseline toàn population hoặc kết quả ranked. Không trả contact/token trong metrics. Dùng bảng feedback hiện có, không migration destructive.

2 client +2 server case mới: opt-in/allowlist/bounds, snapshot/redaction, server consent/schema, local D1 feature/rate/metrics/retention. Chromium sáu mode/viewport kiểm tra không preselect, preview, offline/manual retry và redaction bằng fetch stub local; không gửi góp ý ra ngoài. npm test 165/165 pass. D1 runtime evidence ghi riêng sau kiểm chứng.
