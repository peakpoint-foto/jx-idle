# Nền tài khoản online đa mode — PHLT và 2.0 (DONE local, đóng guard CTC mặc định)

Đây là nền cho P05, P06 và G04. Nó chỉ mở **đăng ký, đồng bộ và đo giờ chơi** cho PHLT và 2.0, mỗi mode một flag riêng mặc định tắt. Mọi tính năng chơi chung (bảng xếp hạng, PvP, bang, phòng, phiên, sổ cái công trạng, mùa) vẫn **chỉ CTC**; mode khác chỉ có tính năng riêng khi task của nó thêm flag và kiểm chứng.

## Flag và quy tắc mở

- `online_account_phlt` (chỉ PHLT) và `online_account_g2` (chỉ 2.0), cả hai `enabled:false`, `online:true` (nên sandbox luôn bị chặn). Flag của mode này không bao giờ mở mode kia.
- `parseSave(save, env)` (`worker/src/account.js`): CTC luôn nhận. Mode khác chỉ nhận khi `env` có flag tương ứng bật; nếu tắt trả 403 `mode_not_open`. Mode lạ trả 400 `not_ctc`.
- **Mặc định đóng:** mọi nơi gọi `parseSave` không truyền `env` (chat, kiểm duyệt, biên nhận hoạt động) vẫn chỉ nhận CTC, nên một tài khoản PHLT/2.0 không dùng được các đường đó.
- Đăng ký còn phải thỏa luật cũ: dưới cấp 40, không sandbox.

## Mode là danh tính của nhân vật

- Cột `chars.mode` (`TEXT NOT NULL DEFAULT 'ctc'`), thêm bằng `ensureSchema` (cùng cơ chế các cột trước, idempotent) cùng chỉ mục `chars_mode`. Mọi bản ghi cũ đều là CTC nên mặc định `'ctc'` đúng; không cần backfill. Không có file migration `ALTER` vì không lặp được (release contract chạy migration hai lần).
- Đồng bộ với mode khác mode đã lưu trả 409 `mode_locked`. Như vậy một nhân vật CTC được chuyển sang 2.0 ở máy khách, hoặc save sửa tay, không thể chuyển tài khoản giữa các nền kinh tế/bảng xếp hạng.
- Tắt flag: đồng bộ mới trả 403 `mode_not_open`, dữ liệu đã lưu giữ nguyên; bật lại thì đồng bộ tiếp được.
- `/api/me` và `/api/profile` trả `mode`; `ranked` chỉ đúng cho CTC.

## Phạm vi tách biệt

- `GET /api/ladder` chỉ liệt kê `mode='ctc'`. Gợi ý đối thủ ranked cũng lọc `mode='ctc'`.
- Kiểm thử xác nhận tài khoản PHLT/2.0 bị từ chối ở mùa (`feature_disabled`), kinh tế (`feature_disabled`) và phiên (`session_mode_denied`) dù các flag CTC đó đang bật.
- Không có đường chuyển tài nguyên hay điểm giữa mode: sổ cái, mùa và phiên đều ghi/đọc `mode='ctc'`.

## Xác thực nhân vật theo mode (`worker/src/validate.js`)

Trước đây `validateChar` ép `ctc` ở ba chỗ. Nay dùng mode của nhân vật:

- **Trần đồ** `modeItemOk(item, mode)`: đồ Bạch Kim bị gắn cờ ở PHLT; đồ Hoàng Kim bị gắn cờ ở CTC; đồ nhãn 2.0 không dùng được ở PHLT.
- **Mode khi tính lại chỉ số** là mode của nhân vật (kể cả hiệu ứng bộ E03).
- **Ngưỡng cấp theo giờ chơi** nhân hệ số rộng tay: CTC ×1, PHLT ×2, 2.0 ×8 (2.0 có tốc độ ×2.5 và EXP ×2). Đây là ngưỡng chỉ bắt kẻ vượt xa, không phải chống gian lận chặt cho PHLT/2.0.
- **Đồ bộ (Hoàng Kim/Bạch Kim)** đối chiếu chỉ số gốc với mẫu trong `J.sets` và dòng thuộc tính với `J.ge`. Nhiều mẫu dùng chung khóa (ví dụ biến thể "kỳ hạn", 1.980 khóa), nên đồ hợp lệ khi khớp bất kỳ mẫu nào cùng khóa. Dòng cộng cấp kỹ năng hệ được chấp nhận trong 0..1 vì game chuẩn hóa chúng về tối đa +1.
- **Đồ Tím khảm** đối chiếu dòng với `J.affixLevel` và được phép lặp thuộc tính (tiền tố/hậu tố). Đồ thường giữ nguyên độ chặt cũ, kể cả cấm lặp.
- Đồ bộ giả mạo bị gắn cờ: dòng tăng quá khoảng mẫu, chỉ số gốc phình, mẫu không tồn tại, nhiều dòng hơn mẫu, thuộc tính ngoài mẫu.

### Kiểm chứng bằng bộ sinh đồ của chính game

Trước khi sửa, fuzz cho thấy PHLT/2.0 bị gắn cờ oan hàng nghìn lần (mọi đồ bộ). Fuzz dùng `rollDrops`, `makeSetItem` (cả Hoàng Kim và Bạch Kim), `randomForge` và `enchase` thật. Sau sửa, một lượt fuzz rộng (30 nhân vật, 12.003 món gồm 3.391 Hoàng Kim, 2.760 Bạch Kim, 844 Tím khảm) cho **0 cờ, 0 hàng chờ** ở cả ba mode. Bản trong test là bản rút gọn xác định (9 nhân vật) kèm kiểm tra độ phủ. Fuzz còn lộ một lỗi trong game: hàm `enchase` không chuẩn hóa dòng kỹ năng hệ nên người chơi sẽ bị đưa vào hàng chờ oan; đã sửa bằng cách gọi `normalizeElementSkillItem` ngay sau khi khảm (không đổi chỉ số vì `calc` vốn đã giới hạn ≤ +1).

## Client (`js/online.js`)

`onlEligible()` theo mode: CTC luôn, PHLT/2.0 khi flag của mode bật. Đăng ký hỏi `/api/config?mode=` trước và không gọi `/api/register` nếu mode chưa mở. Thẻ online của PHLT/2.0 chỉ có đồng bộ, giờ chơi, mã khôi phục và cảnh báo khóa mode; không vẽ bảng xếp hạng, PvP, bang hay phòng. Ô đăng ký ở màn tạo nhân vật bật theo cấu hình máy chủ và mặc định không tick cho mode ngoài CTC. Snapshot máy chủ khác mode bị từ chối. Biên nhận hoạt động chỉ gửi cho CTC.

## Kiểm chứng

- `worker/test/account_modes.test.js` (7 case): quy tắc mở theo flag và mặc định đóng, đăng ký lưu mode và không lên bảng CTC, khóa mode (CTC→g2/PHLT, PHLT→CTC/g2) và đóng flag giữ dữ liệu, từ chối tính năng CTC, thang giờ chơi theo mode, trần đồ và đồ bộ giả mạo, fuzz không cờ oan.
- `test/online_modes.test.mjs` (5 case): mở theo flag, đăng ký kiểm cấu hình trước, thẻ rút gọn, snapshot khác mode, biên nhận.
- Chạy cả trong `npm test` (SQLite) và `test:d1`.

## Giới hạn

- Chỉ là nền: lobby và phiên cho PHLT do P05 thêm ([COOP_RESCUE.md](COOP_RESCUE.md)); 2.0 chưa có lobby, phiên, sổ cái hay bảng. P06/G04 phải thêm từng phần và flag riêng.
- Ngưỡng giờ chơi cho PHLT/2.0 rộng; cấp độ có thể bị thổi phồng đến hệ số trên. Cấp thăng hạng Bạch Kim (`plv`) và thông số `lab` chưa được xác thực riêng.
- Chưa deploy, chưa staging, chưa đo tải.

## Rollback

Tắt `online_account_phlt` / `online_account_g2`: đăng ký và đồng bộ mới bị từ chối, dữ liệu giữ nguyên, CTC không ảnh hưởng.
