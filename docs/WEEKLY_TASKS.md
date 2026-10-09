# R02 — Nhiệm vụ tuần và quà quay lại (đang triển khai)

`js/weekly_tasks.js` thêm ba lựa chọn theo mode: CTC đóng góp trận/ải, PHLT checkpoint/hành trình, 2.0 bí cảnh/phép đo build. Trong một tuần UTC, tiến trình khóa theo mode đầu tiên; đổi mode không đổi task hay cho cộng tiến trình chéo. Tối đa ba claim mỗi tuần, claim state và lượng/Phúc Duyên ghi cùng một lần save; lỗi save phục hồi toàn bộ state/currency. Quà quay lại là một receipt duy nhất cho mỗi nhân vật khi `S.last` cách lần quan sát gần nhất ít nhất bảy ngày.

UTC week index chỉ tiến về trước trong save; clock rollback giữ tuần/claim đã ghi, không tạo tuần mới. Namespace malformed/future bị giữ nguyên. Kiểm thử cover mode lock, quest completion, weekly rollover, rollback clock, return receipt one-shot, storage failure, legacy save, PHLT expedition và G2 rift completion. Browser smoke sáu tổ hợp mode/viewport xác nhận card, claim UI và target chạm 44px.

Giới hạn nghiệm thu: progression và đồng hồ offline là client-side, save có thể sửa được; không dùng cho xếp hạng/server reward. Nếu cần chống clock forward/tamper cho reward cạnh tranh, cần timestamp/server authority riêng cho từng mode. UI chưa có bản tóm tắt hoạt động khi quay lại. Vì vậy R02 chưa đóng.
