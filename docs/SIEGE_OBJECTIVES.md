# C07 — Mục tiêu Công thành/Tống Kim CTC

`party_siege` là feature flag riêng, mặc định tắt và chỉ CTC. MVP mở encounter 2–4 người đã xác thực, có ba cách đóng góp: đánh cổng NPC, chiếm điểm và tiếp tế. Hạ cổng hoặc chiếm đủ 100 điểm sẽ kết thúc phiên. Mỗi lệnh chiếm hợp lệ tăng tối đa 25 điểm; điểm không thể vượt trần. Capture và resupply là lệnh có sequence/idempotency, được xếp vào tick server, không nhận score từ client.

Tiếp tế có 3 kiện dùng chung; mỗi kiện hồi tối đa 5% sinh lực cho đồng đội đang thiếu máu, không tiêu kiện khi cả đội đầy máu. Điểm server tách công (sát thương hữu ích lên cổng), chiếm (điểm capture) và hậu cần (kiện hữu ích). Lệnh nhanh có nút chạm ≥44px. Mỗi actor vẫn có thể chọn Phòng thủ/Hỗ trợ; không bắt buộc vai trò hay môn phái.

Thắng dùng đúng claim/receipt C05: tối đa 1 công trạng/phiên, cap 3/ngày UTC và ví 30; không phát điểm ranked, vật phẩm hay tài nguyên local. Idempotency, roster snapshot, outsider guard, disconnect, abort, retry và rollback kế thừa session engine. `party_siege=false` dừng encounter và nhả roster; feature mới không sửa quota công thành cục bộ hoặc shop tuần cũ.

Kiểm chứng local: engine chiếm cổng/điểm/tiếp tế hữu hạn; D1 integration kiểm tra default-off, replay đồng thời cùng sequence, capture server-complete, claim idempotent/cap, flag rollback; Chromium hai client/D1 kiểm tra capture 2 người, state chung, render ở mobile/desktop và kích thước nút. C07 là đội tấn công phối hợp với mục tiêu PvE; không tuyên bố đã có đối thủ PvP thời gian thực, bản đồ di chuyển hoặc bảng xếp hạng mùa (C08).
