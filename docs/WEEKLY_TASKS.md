# R02 — Nhiệm vụ tuần và quà quay lại (DONE local)

`js/weekly_tasks.js` thêm ba lựa chọn theo mode: CTC đóng góp trận/ải, PHLT checkpoint/hành trình, 2.0 bí cảnh/phép đo build. Trong một tuần UTC, tiến trình khóa theo mode đầu tiên; đổi mode không đổi task hay cho cộng tiến trình chéo. Tối đa ba claim mỗi tuần, claim state và lượng/Phúc Duyên ghi cùng một lần save; lỗi save phục hồi toàn bộ state/currency. Quà quay lại là một receipt duy nhất cho mỗi nhân vật khi `S.last` cách lần quan sát gần nhất ít nhất bảy ngày.

UTC week index chỉ tiến về trước trong save; clock rollback giữ tuần/claim đã ghi, không tạo tuần mới. Namespace malformed/future bị giữ nguyên. Kiểm thử cover mode lock, quest completion, weekly rollover, rollback clock, return receipt one-shot, storage failure, legacy save, PHLT expedition và G2 rift completion. Browser smoke sáu tổ hợp mode/viewport xác nhận card, claim UI và target chạm 44px.

**Gợi ý khi quay lại.** Game đã có tóm tắt offline (`offlineGains` + `showOffline` trong `js/main.js`: quái hạ, EXP, vàng, cấp, vật phẩm, rương tu luyện). R02 bổ sung phần hướng dẫn: `weeklyReturnGuideHTML()` được nhúng vào modal "Chào mừng trở lại" (có kiểm tra `typeof`), liệt kê tối đa ba dòng: quà quay lại đang chờ, thưởng nhiệm vụ tuần đã đủ chưa nhận, hoặc tuần này chưa chọn nhiệm vụ. Không hiện khi đồng hồ lùi so với tuần đã lưu, khi nhiệm vụ tuần khóa theo mode khác, hoặc khi sandbox. Hàm chỉ đọc; duy nhất `weeklyObserveReturn()` ghi trạng thái eligibility vào bộ nhớ và lần lưu kế tiếp mới ghi bền.

Kiểm thử: 9 case trong `test/weekly_tasks.test.mjs` (5 case cũ + 4 case guide: dòng theo trạng thái, quà một lần, im lặng khi lùi đồng hồ/khác mode/sandbox, nhúng vào `showOffline`).

Giới hạn nghiệm thu: progression và đồng hồ là client-side, save có thể sửa được. Tua đồng hồ tiến chỉ vượt được nhịp tuần (mỗi tuần mới vẫn phải hoàn thành đủ nhiệm vụ để nhận, tối đa ba claim) và quà quay lại chỉ có một lần cho mỗi nhân vật, nên không có thưởng miễn phí; nhưng nhịp theo tuần có thể bị bỏ qua. Không dùng cho xếp hạng hay thưởng server. Nếu cần chống tua đồng hồ cho thưởng cạnh tranh thì cần timestamp do server giữ, riêng từng mode; đó là việc ngoài R02.
