# O03 — moderation online (đang thực hiện)

Migration `0008_player_moderation.sql` thêm block, report và admin audit tables. `/api/moderation` chỉ nhận tài khoản online CTC đã xác thực; report giới hạn lý do allowlist, chi tiết tối đa 500 ký tự và block tự loại friendship/lời mời đang chờ. Friend request/accept và room invite/accept kiểm tra block ở Worker.

`/api/admin/moderation` đọc report và đổi trạng thái `open/reviewing/closed`; yêu cầu `x-admin-key` khớp Worker secret `ADMIN_KEY` và rate limit 120 request/phút. UI trong tab Khác yêu cầu admin nhập khóa theo phiên; không lưu khóa trong localStorage/save, render nội dung báo cáo bằng `textContent`, và không gửi qua webhook. Mỗi lần admin đổi trạng thái report tạo bản ghi audit chỉ gồm action, target và report ID.

Đã kiểm chứng 1 test D1 local: report trùng trả cùng ID, block ngăn kết bạn, admin key sai bị từ chối, đổi trạng thái tạo audit record. Browser smoke của UI chung qua 3 mode × 2 viewport; UI moderation chỉ xuất hiện cho CTC có account và render report bằng text node. Còn thiếu retention report/audit, spam/report-abuse review và private-data audit; O03 chưa nghiệm thu và online public chưa được mở.
