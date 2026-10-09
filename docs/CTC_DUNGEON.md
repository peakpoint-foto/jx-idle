# C06 — Phụ bản tổ đội CTC

`party_dungeon` là feature flag riêng, mặc định tắt và chỉ dùng CTC. Phụ bản dùng roster 2–4 người đã sẵn sàng, snapshot server đã kiểm tra và transport/reconnect/expiry của C05. Sau khi tạo phiên, roster được đóng băng; tài khoản ngoài roster không đọc được session. Người lập phòng rời lobby không làm hủy encounter.

Phiên có một bản đồ chiến đấu tĩnh và một boss. Boss dựng kết trận khi máu xuống 66% và 33%; khi kết trận còn hiệu lực, đòn đánh chỉ gây 20% sát thương. Hai actor khác nhau dùng Phòng thủ trong cửa sổ 8 giây sẽ phá kết trận. Một actor không thể tự đếm hai lần. Hết cửa sổ thì kết trận tự tan để tránh khóa mềm. Hồi trợ đồng đội chỉ tiêu MP khi có lượng hồi hữu ích và ghi contribution thực; phòng thủ vẫn chặn sát thương theo cơ chế C05. Không khóa vai trò hoặc môn phái.

Loot policy hiện ra trước khi bắt đầu: phụ bản chưa rơi vật phẩm; chỉ có thể nhận tối đa 1 công trạng server khi thắng và có contribution, chung cap 3/ngày UTC/ví 30 của C05/E04. Rời phiên hoặc wipe không có thưởng. Claim tiếp tục dùng receipt idempotent hiện hữu. Có thể retry sau khi wipe bằng phiên mới; retry cùng request ID phải giữ nguyên loại activity. Tắt `party_dungeon` abort phiên đang chạy và nhả roster; không xóa lịch sử/reward.

Kiểm chứng local: engine phá trận cho 10 phái × party 2/4; integration kiểm tra default-off, activity-bound retry, leader rời lobby, outsider/late join bị từ chối, hai actor guard, flag rollback, wipe không thưởng và retry phiên mới. Browser hai context + D1 kiểm tra start/render/formation/reconnect ở 360/1280 và nút chạm ≥44px. C05 vẫn chịu trách nhiệm kiểm tra combat command, CAS, contribution, reconnect, receipt và cap.

Giới hạn: bản đồ là encounter tĩnh trên canvas hiện tại, không thêm tài sản/di chuyển hay quái phụ. C06 không cấp loot vật phẩm; cần hệ inventory server-owned và thiết kế kinh tế riêng trước khi mở loại thưởng đó.
