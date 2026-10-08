# Nền online — F06

Phạm vi CTC; không mở account PHLT/g2. Không deploy, không chạy test vào D1 production.

- Sync tăng revision trong SQL và trả revision từ RETURNING; CAS base_rev từ chối bản cũ. Force vẫn là thao tác ghi đè có chủ ý, không phải merge. Snapshot mới tạm pending cho tới khi validation đúng revision hoàn tất; validation cũ không sửa power hoặc thêm cờ vào snapshot mới.
- Legacy recover xác nhận lại character_id sau cập nhật có điều kiện. Register ghi cid vào cả snapshot và cột identity.
- Join kiểm tra capacity và membership ngay trong INSERT: phòng 4, bang 30. Membership phòng đóng/hết hạn được giải phóng khi chủ tài khoản thực hiện POST; presence stale không tự đuổi người khỏi phòng còn hiệu lực.
- Boss quota 3/ngày UTC và damage hữu ích nằm trong batch nguyên tử. boss_receipts khóa account_id/request_id; retry cùng request_id không giảm HP hoặc tăng bộ đếm lần nữa. UI tạo ID mới cho thao tác mới; client retry request phải giữ ID cũ. Thống kê không vượt HP boss còn lại. Reset tuần có điều kiện, không xóa damage của request chạy sau reset đầu tiên.
- Donate tự khai bị khóa bằng donation_disabled và nút disabled. Không thay bằng phí lấy từ snapshot offline vì đó chưa phải ledger sở hữu xác thực. E04/C02 mới mở nguồn đóng góp hợp lệ.
- Duel challenge chặn cặp đang chờ ngay trong INSERT. Accept claim CAS; score chỉ được thêm khi status resolving trong cùng batch rồi chuyển resolved. Retry resolving phục hồi batch thất bại, không thêm điểm hai lần. Pending/flagged/quá 30 ngày không được đấu ranked hoặc đánh boss.
- Các POST social giới hạn 60 request/tài khoản/phút; sync giữ 20/giờ, đăng ký 5/IP hash/giờ. Middleware capability kiểm tra stored mode trước handler. Heartbeat giữ CAS thời gian thực.

Kiểm chứng: npm test dùng SQLite thực với D1-shaped adapter; npm run test:d1 chạy cùng integration cases trên D1 binding của Miniflare/workerd local. Không đồng nhất kết quả local với benchmark tải production hoặc mạng nhiều thiết bị.

Receipt boss hiện không có cleanup tự động: không xóa receipt khi chưa chốt retry horizon. O04/E04 phải bổ sung retention/backup và cost trước mở quy mô lớn. Phòng vẫn là lobby polling, boss/duel vẫn bất đồng bộ; không quảng cáo combat realtime. C05 bổ sung authoritative combat/result/reward và transport riêng.
