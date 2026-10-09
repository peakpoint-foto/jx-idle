# E03 — Hiệu ứng trang bị theo lối chơi (v1 đã triển khai local)

Trạng thái: v1 là chỉ số tĩnh, bật theo mode, có test client và Worker. Con số cân bằng là giá trị khởi điểm, cần playtest trước khi coi là cân bằng.

## 1. Cơ chế nền (đã có trước E03)

- `js/sets.js`: đồ bộ có `set.kind` (`gold`/`platina`), `set.grp` (nhóm), `set.n1` (ngưỡng nâng cấp) và `set.n2` (ngưỡng kích hoạt).
- `setCounts(eq)` đếm món theo nhóm (bỏ ngựa, không đếm trùng nhẫn cùng bộ).
- `enoughToActive(eq)` / `goldEnhance` nhân đôi dòng `ext` khi bộ đủ ngưỡng. Đây là hiệu ứng nền, không đổi trong E03.
- Worker đóng gói `js/sets.js` và `js/stats.js` vào `worker/gen/game.js`, nên calc server dùng cùng mã.

## 2. Hiệu ứng theo lối chơi (v1)

Thêm trong `js/sets.js` (`setModeBonus`, `setModeText`) và gọi từ `calc()` trong `js/stats.js`:

| Mode | Điều kiện | Hiệu ứng | Ghi chú |
|---|---|---|---|
| CTC | — | Không có | Giữ đúng luật ngoài mode |
| PHLT (sinh tồn) | Đủ `n2` món cùng nhóm | +6% Sinh lực (`lifemax_p`), +5 kháng toàn bộ (`allres_p`) | Hướng sinh tồn |
| g2 (combo) | Đủ `n2` món cùng nhóm | +4 Chí mạng (`deadlystrike_p`), +5% sát thương vũ khí (`weapondamageenhance_p`) | Hướng đổi combo |

Quy tắc không cộng dồn: mỗi nhân vật chỉ nhận hiệu ứng của **một** bộ. Bộ được chọn là bộ đủ `n2` có nhiều món nhất; hòa thì lấy nhóm có số nhỏ hơn. Vì vậy hai bộ đủ ngưỡng cùng lúc chỉ cho một bộ hiệu ứng.

Hiển thị: dòng dưới thẻ "Chỉ số" trong `renderChar` (`js/ui.js`) cho biết bộ đang kích hoạt hoặc điều kiện còn thiếu, chỉ ở PHLT và g2.

## 3. Lý do thiết kế

- **Chỉ số tĩnh, không proc**: không có cooldown, không có vòng phản hồi, nên không có nguy cơ stack vô hạn. Proc có cooldown cần thay đổi `combat.js` và kiểm chứng DOT riêng; để sang v2.
- **Dùng `calc()`**: client và Worker dùng cùng một mã, parity có sẵn. Test server xác nhận điều này.
- **Không lưu vào save**: hiệu ứng tính lại mỗi lần tính chỉ số, nên save cũ không cần migration.

## 4. Thay đổi hành vi cần biết

- Đồ bộ đã đủ ngưỡng trong PHLT và g2 sẽ cho nhân vật có chỉ số cao hơn sau khi cập nhật. Đây là thay đổi cân bằng, không phải lỗi. CTC không đổi.
- Không đổi dữ liệu, không đổi save, không đổi flag.

## 5. Quan sát, chưa sửa

- `enoughToActive(eq)` trả về true khi **bất kỳ** nhóm nào đủ ngưỡng, nên dòng `ext` nhân đôi của mọi đồ bộ vàng được bật theo, không riêng nhóm đủ bộ. Đây là hành vi nền đã có; sửa sẽ đổi chỉ số của mọi save, nên không gộp vào E03.

## 6. Kiểm chứng đã chạy

- `test/set_effects.test.mjs` (7 test): CTC không có bonus; PHLT cần đủ `n2` và áp dụng một lần; g2 dùng bộ riêng; hai bộ không cộng dồn; bỏ trang bị thì bonus biến mất; `calc()` tăng đúng 6% sinh lực; dòng hiển thị đúng; `renderChar` không lỗi với bộ đang kích hoạt.
- `worker/test/set_effects.test.js` (2 test): server `GAME.calc` cho PHLT tăng đúng 6%; CTC không đổi.
- `npm test` 282/282, `npm run test:d1` 42/42.
- `scripts/browser-smoke.mjs` pass 9 tổ hợp mode × viewport (3 mode × 360 dọc, 800 ngang, 1280 desktop). Smoke này **không** kiểm tra dòng hiệu ứng bộ; dòng đó chỉ được kiểm tra bằng test render và chưa được xem bằng mắt trên màn hình nhỏ.

## 7. Chưa làm (v2)

- Hiệu ứng có proc và cooldown, cần kiểm chứng DOT và thứ tự tick.
- Số liệu cân bằng cần playtest; chưa có đo lường.
- Bản xem trước hiệu ứng khi đang chọn trang bị (trước khi trang bị).
