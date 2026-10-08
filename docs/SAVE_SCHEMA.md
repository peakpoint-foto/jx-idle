# Save schema v2 — F05

P01 extensions.expedition v1 có chính sách reload kết thúc interrupted, không resume/reward; cold recovery giữ ground đã lưu. Xem EXPEDITION.md cho atomic phase transitions/retry/future namespace và world pause.

Nạp js/save_schema.js sau js/save.js, trước UI/main; Worker cũng nhúng đúng helper này. SAVE_V nâng từ 1 lên 2; extension namespace khởi tạo {v:1} mà không thay inventory/combat/point fields.

## Migration và tương thích

- Legacy không có v được hiểu là v1; v1/v2 dùng migrateSaveSchema rồi migrate cũ, giữ luật sanitize hiện tại. Migration clone dữ liệu đầu vào và chạy lặp an toàn.
- Trước load/writeSlot/import, bản cũ có chữ ký hợp lệ được lưu một lần ở <slotKey>_pre_v2. Nếu primary lỗi hoặc thiếu, bảo toàn bản _bak hợp lệ trước khi recovery.
- Không migrate khi backup không ghi được: giữ nguyên raw save và khóa ghi trong phiên. Save có v lớn hơn hoặc extension version chưa hiểu cũng fail closed, không để sanitize bán gear của phiên bản mới.
- Token online vẫn ngoài save. writeSlot chỉ unlink token sau khi ghi thành công; validation/storage failure không gỡ liên kết nhân vật cũ.
- Quota và state S.siege giữ nguyên khi migration/reload. Hoạt động tower/Tống Kim dùng runtime R và quota đã lưu: migration không cấp lại lượt. Mỗi task session mới P01/G02/C05 phải định nghĩa và test resume riêng trước khi mở feature; v2 không tự tạo hoặc resume hoạt động chưa được xây.
- Save conflict online giữ cơ chế base_rev/cid hiện tại. Schema v2 không bỏ kiểm tra character_id hoặc mở account cho phlt/g2.
- Bản client cũ chưa có guard v2 có thể không hiểu schema tương lai. Đây không phải cam kết downgrade an toàn; dùng backup gốc nếu cần phục hồi. Không tự xóa _pre_v2 trong thao tác dọn dữ liệu.

## Khôi phục khi bị khóa

Nếu window.__saveBlocked được đặt, phiên không ghi tiến trình. Người chơi phải giữ dữ liệu gốc, cập nhật game nếu save mới hơn hoặc giải phóng storage rồi tải lại khi backup thất bại. Không nhập save mới hơn để cố bypass guard.
Backup chứa dữ liệu nhân vật, không có bearer token. Khi phục hồi thủ công về bản cũ phải dùng luồng import/writeSlot để kiểm tra mode/cid; không dán raw token vào mã build hoặc báo lỗi.

## Kiểm chứng

test/save_schema.test.mjs: ba mode, backup bất biến, migration idempotent, storage failure, future version, malformed extension, corrupt/missing primary, import/replacement token guard, activity và quota qua reload. npm test cũng build Worker và chạy validation regression.
