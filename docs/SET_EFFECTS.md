# E03 — Hiệu ứng trang bị theo lối chơi (đề xuất, chưa implement)

Trạng thái: đề xuất thiết kế. Chưa thay đổi calc, Worker hay dữ liệu. Lý do: E03 thay đổi chỉ số chiến đấu, cần Worker/client parity và các con số cân bằng do người dùng quyết định.

## 1. Cơ chế bộ trang bị hiện có (đã đối chiếu code)

- `js/sets.js`: đồ bộ có `kind` (`gold` hoặc `platina`), `set.grp` (nhóm bộ), `set.n1` (ngưỡng nâng cấp) và `set.n2` (ngưỡng kích hoạt).
- `setCounts(eq)` đếm số món theo nhóm, bỏ qua ngựa và không tính trùng nhẫn cùng một bộ.
- `enoughToActive(eq)` trả về true khi có một nhóm đạt `n2` món. `goldEnhance(it, eq)` trả về `GOLD_EXT = 2` khi đủ ngưỡng kích hoạt, hoặc một phần theo `n1` khi chưa đủ.
- `js/stats.js` dùng `enoughToActive` 4 lần và `goldEnhance` 1 lần. Đây là nơi bộ đã kích hoạt ảnh hưởng chỉ số.
- Worker: `worker/build-game.mjs` đóng gói `js/sets.js` và `js/stats.js` vào bundle calc. Parity Worker–client đi qua cùng mã này.

Tức là **bộ trang bị đã có một hiệu ứng nền** (nhân đôi phần mở rộng khi kích hoạt). E03 là lớp hiệu ứng theo lối chơi bổ sung trên cơ chế đó, không thay thế nó.

## 2. Ràng buộc từ backlog

- PHLT: hiệu ứng hỗ trợ sinh tồn.
- g2: hiệu ứng đổi combo.
- CTC: chỉ dùng dòng và đồ Xanh–Vàng đã được phép; không mở Hoàng Kim bằng task này.
- Không đổi chỉ số nền ngoài mode.
- Tránh stack phản hồi vô hạn (ví dụ hồi máu kích hoạt hồi máu).
- Có nguồn và điều kiện rõ; cần test proc cooldown, tương tác DOT, equip/unequip, chuyển mode và parity Worker.

## 3. Đề xuất

Một bảng cấu hình theo mode, đặt trong module mới (ví dụ `js/set_effects.js`), có `version` và chỉ dùng các trường đã allowlist:

| Mode | Điều kiện kích hoạt | Hiệu ứng đề xuất (chỉ để chọn) | Giới hạn |
|---|---|---|---|
| PHLT | Đủ `n2` món cùng nhóm | Giảm tiêu hao vật tư hoặc tăng kháng khi ở hành trình | Không cộng thêm khi đã kích hoạt cùng loại |
| g2 | Đủ `n2` món cùng nhóm | Đổi một kỹ năng nền sang biến thể trong bảng cho sẵn | Một biến thể mỗi nhóm; không chồng |
| CTC | — | Không có hiệu ứng mới; chỉ dùng dòng Xanh–Vàng | — |

Các hiệu ứng trong bảng chỉ là ví dụ để thảo luận. **Không chọn số liệu cụ thể trong tài liệu này.**

Nguyên tắc chung:
- Hiệu ứng chỉ đọc trạng thái trang bị đã trang bị, không đọc kho hay save khác.
- Mỗi hiệu ứng có `id` ổn định để test và log.
- Proc có cooldown tính theo thời gian combat, không theo số lần tick, để parity client–Worker không lệch khi tốc độ khác nhau.

## 4. Quyết định cần người dùng chốt

1. **Lối chơi cho PHLT và g2**: chọn hiệu ứng nào trong các hướng trên (hoặc hướng khác).
2. **Số liệu**: tỷ lệ, cooldown, giới hạn stack. Không có căn cứ trong code để tự chọn.
3. **Có áp dụng cho bộ hiện có không**, hay chỉ cho đồ mới roll sau khi bật. Áp dụng ngược sẽ đổi calc của save cũ.
4. **Phạm vi CTC**: xác nhận không có hiệu ứng mới ở CTC trong task này.

## 5. Kiểm chứng sẽ thực hiện khi implement

- Proc cooldown và giới hạn stack, kể cả khi nhiều bộ cùng kích hoạt.
- Tương tác DOT (hiệu ứng có làm thay đổi damage over time không, và có tính đúng nguồn không).
- Equip/unequip giữa trận, và khi đổi trang bị ngay trước khi kích hoạt.
- Chuyển mode: hiệu ứng chỉ hoạt động đúng mode; save CTC không nhận hiệu ứng PHLT/g2.
- Worker parity: cùng đầu vào cho cùng đầu ra trên 10 phái.
- Save cũ không đổi chỉ số khi chưa bật flag.

## 6. Rủi ro

- Chỉ số do `calc` tính, nên mọi thay đổi ở đây ảnh hưởng toàn bộ trận và báo cáo (B04). Cần regression cho combat policy và combat reports.
- Phản hồi vô hạn nếu hiệu ứng kích hoạt chính nó. Phải chặn ở mức thiết kế, không chỉ ở test.
