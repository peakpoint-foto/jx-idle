# G01 — So sánh build trong phòng luyện 2.0

Phụ thuộc B01/B02/F07; dùng capability `training_lab` mặc định tắt, chỉ g2. UI nằm trong phòng luyện ở tab kỹ năng. Chọn A/B từ build hiện tại hoặc các bộ đã lưu; bấm So sánh dùng toàn bộ điều kiện mục tiêu và seed đang nhập.

`buildCompare(a,b,input)` kiểm tra cả hai build trước mô phỏng. Index -1 là hiện tại; index còn lại qua buildPreview/buildCandidate để kiểm tra điểm, môn phái, mode, ownership UID và điều kiện mặc. Build chứa trang bị cần `build_profiles` bật; thiếu item hoặc bộ trống trả lỗi, không thay đồ đang mặc.

Mỗi bài đo chạy trainingRun trên bản sao riêng, cùng seed/parameters và combat model. Bảng hiển thị DPS hữu ích, damage/DOT thực, mana còn, HP mất/hồi, thời gian thiếu mana và thời gian sống/đo; chênh lệch B − A. Dấu dương không luôn tốt (HP mất/thiếu mana). Kết quả hiện trạng thái hoàn tất/tử trận và điều kiện kháng/HP/def/hệ/mana đầu/damage vào.

Không apply build, ghi save hoặc archive kết quả; không cấp EXP/vàng/đồ, gửi mạng hoặc đóng góp bang. Sandbox dùng bản sao trạng thái thử nghiệm đang có, chuẩn hóa god/damage theo B01 và không ghi storage. Kết thúc bài đo giữ nguyên nhân vật/runtime/admin của phiên hiện tại; thoát sandbox vẫn theo luồng admin có sẵn, G01 không thay save gốc.

Bài đo chỉ mô phỏng mục tiêu đứng sát, không di chuyển; không chứng minh build tốt nhất trong chiến trường. Mana hồi còn dùng net delta của B01. Kết quả không dùng ranked. Thời lượng tối đa 180 giây mô phỏng, 8 mục tiêu; thao tác so sánh chạy đồng bộ và chưa có benchmark thiết bị thật ngoài Chromium local.

Kiểm chứng: test/build_compare.test.mjs kiểm tra deterministic A/B, state/storage/network isolation, sandbox write spy, thiếu item/bộ trống và mode/flag. scripts/browser-smoke.mjs kiểm tra chọn A/B, nút thật, điều kiện hiển thị, lỗi bộ trống và không apply build ở g2 mobile/desktop; mode khác không mở panel.
