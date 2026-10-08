# P04 — Tri thức và nhật ký PHLT

`expedition_knowledge` mặc định tắt, chỉ PHLT. Chỉ chuyến P03 có route v1 hợp lệ tạo tiến trình. Namespace `extensions.expeditionKnowledge` v1, gắn mode/character, tách khỏi inventory, skill points và combat stats.

Hoàn tất đủ ba chặng mở ba dấu chặng của đường (hai đường, tối đa sáu) và mục tra cứu công thức: trú ẩn mở thông tin Hợp Tím native; phế tích mở thông tin ghép mảnh Hoàng Kim. Các mục là tra cứu các công thức hiện có, không cấp vật liệu, bỏ chi phí/điều kiện native hay khóa lại công thức người chơi đã dùng. Không Bạch Kim. Dấu chặng có nhãn kỷ niệm trong UI, không cộng stat.

Gục sau ít nhất một chặng giữ **chỉ mốc đầu** của đường và thông tin quái template đã gặp (tối đa32 ID MON hợp lệ). Lặp lại không tăng mốc; rút sớm, reload, timeout hoặc flag-off không cấp tiến trình. Kháng hiển thị là trần template, không hứa điểm yếu cố định; kháng thực còn theo cấp và hệ.

Nhật ký10 chuyến gần nhất: ID session, đường, outcome, phí, vàng/món mang về, phần mang theo bị mất, số chặng và thời điểm. Fail và interrupted mất phần mang; withdrawn chỉ nhận tiền/loot đã vượt chặng theo P02/P03 nhưng không mở mốc. Ghi log không tạo tài nguyên. Không lưu token/snapshot toàn bộ hoặc log trận không giới hạn.

Reward, receipt, meta unlock, journal và trạng thái ended nằm trong **cùng expeditionWrite/save**. Storage lỗi rollback tất cả và retry giữ cùng thao tác; session ID chặn journal trùng, các unlock là set hữu hạn. Cold reload ended không grant lại. Bản lưu cũ chưa có namespace đọc như empty mà không ghi ngầm; v1 thiếu enemies đọc như empty để tương thích, không sửa caller. Future/malformed namespace giữ nguyên và dừng ghi tri thức, phần thưởng chuyến hợp lệ vẫn chốt độc lập. Mode khác/sandbox/flag-off không tạo tiến trình.

Kiểm chứng: 4 case completion/idempotency/caps/no-stat, fail/withdraw/interruption/12 aborts giữ journal10, storage rollback+retry/migrate/reload, future/malformed/flag/mode. Chromium hai viewport kiểm tra mốc/mục công thức/nhật ký/touch; các mode khác denied. Đây là tiến trình local, chưa thay C05 authoritative rewards.
