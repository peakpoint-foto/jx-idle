# E02 — Bàn chế tác nguyên tử

`safe_workbench` default-off, PHLT/2.0. CTC không mở lab/rforge, không chế Tím/Hoàng Kim/Bạch Kim; giữ luật mode hiện có. Không có cam kết bảo đảm tiến độ hoặc pity khi E04 chưa thiết kế kinh tế.

Khi bật, cửa sổ rèn/lò legacy chuyển sang bàn này; autoForge chuyển sang chọn công thức/xác nhận, không batch tiêu phí ngầm. Có native recipes: hợp3món thành Huyền Tinh, cường hóa, tẩy lại toàn bộ dòng, khảm Tím, mua1–3HT, thăng HT (bảo hiểm opt-in), thăng khoáng, rèn ngẫu nhiên, ghép mảnh Hoàng Kim và chế/thăng Bạch Kim riêng2.0. Không thêm cấp/dòng/phẩm chất ngoài bảng native. Cường hóa tối đa10, khảm6dòng, HT/khoáng10, Bạch Kim +10.

Preview clone S, kiểm tra mode/activity/UID duy nhất/đồ sở hữu trong túi/chưa khóa/chưa mặc, vật liệu, chi phí, cap và chỗ túi. Nêu phí, vật liệu, món tiêu, xác suất native và phần mất khi thất bại; không gieo kết quả để lộ trước khi trả. Bàn mở tạm dừng combat để preview không lỗi vì loot nền; đóng modal chạy lại, keyboard và UI native giữ nguyên.

Execute revalidate toàn bộ baseline và request, tính native result trên candidate riêng, RNG seed ổn định theo giao dịch, không tự mặc kết quả. Cùng lần save lưu candidate, phí/nguyên liệu, output hoặc thất bại có tiêu phí và receipt. Lỗi lưu/throw rollback S và giữ candidate cho Retry; không gieo lại. Thay nhân vật/mode hoặc tài nguyên khi retry thì deny, người chơi bỏ candidate chưa lưu để preview mới. Discard không tiêu tài nguyên, cùng baseline/công thức tạo cùng seed, không cho reroll miễn phí chỉ bằng mở lại.

Namespace workbench v1 gắn mode/character,32receipt gần nhất. Bấm lặp trả receipt không tiêu lần2. Receipt cũ ra khỏi cửa sổ32 vẫn không dùng lại baseline đã thay đổi. Future/malformed namespace giữ nguyên và deny craft. Receipt và baseline local không phải bằng chứng ownership server; đồng bộ nhiều tab/thiết bị cần C05/E04, không tuyên bố authoritative economy.

Test7case: pure preview/native ranges/mode, receipt double click, storage/candidate retry/stale, locked/equipped/UID/poor guards, reroll/enchase/caps, future/migration/activity/sandbox/flag, Hoàng Kim/2.0 Bạch Kim, HT/insurance/ore/randomforge. Chromium PHLT/g2 mobile/desktop preview/selection/confirm/touch/receipt; CTC denied. Feature-off vẫn dùng legacy; không coi các đường legacy này đã được làm nguyên tử.
