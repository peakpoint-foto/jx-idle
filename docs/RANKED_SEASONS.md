# C08 — Mùa xếp hạng và hậu cần bang bất đồng bộ (DONE local)

Flag `ranked_seasons` mặc định tắt, chỉ CTC, online. Tách khỏi `async_duels`/`duel_modes`: flag chỉ điều khiển việc đọc bảng, chốt và nhận danh hiệu; điểm vẫn do luật ranked C03 tạo ra. Tắt flag đóng API (403 `feature_disabled`), không xóa điểm, bản chốt hay danh hiệu đã nhận.

## Mùa và thời điểm

- Một mùa xếp hạng = 4 mùa tuần của C03 gộp lại (28 ngày). Ranh giới là Thứ Năm 00:00 UTC, tức 07:00 giờ Việt Nam. API công bố `start`, `end`, `final_at` bằng mili giây UTC; UI hiển thị giờ Việt Nam (UTC+7).
- Điểm không có nguồn mới: tổng `duel_scores.points` trong 4 tuần của mùa. Giới hạn của C03 (cặp/ngày, cùng bracket, chênh lực chiến) vẫn quyết định điểm nên không thể farm thêm qua mùa.

## Bảng và điều kiện

- Bảng theo **phái × bracket**, sắp theo điểm rồi số trận thắng; điểm và thắng bằng nhau thì **đồng hạng** (`RANK()`).
- Điều kiện: nhân vật CTC không sandbox, đã xác thực, không bị gắn cờ, có bracket, đã đồng bộ trong mùa (`updated_at` ≥ đầu mùa), tối thiểu 3 điểm. Người không đủ điều kiện vẫn thấy điểm của mình nhưng không vào bảng.
- Hạng mở danh hiệu: nhóm cần ít nhất 5 người đủ điều kiện. Hạng 1 `champion`, hạng ≤3 `top3`, hạng ≤10 `top10`; còn lại hoặc nhóm nhỏ hơn 5 chỉ nhận `contender`. Danh hiệu chỉ để trưng bày: không chỉ số, không tài nguyên, không ghi `resource_ledger`.

## Chốt và nhận

- Sau `end` + 1 ngày ân hạn (cho các lượt resolving cần retry), lần đọc/nhận đầu tiên chốt cả mùa vào `season_final` trong một batch: `INSERT OR IGNORE season_meta` quyết định, nên nhiều request đồng thời chỉ chốt một lần. Sau khi chốt, điểm đổi về sau không làm thay đổi kết quả.
- Nhận: `POST /api/season {action:'claim', season:<chỉ số mùa>}`. Chỉ nhận mùa đã chốt và còn trong cửa sổ 28 ngày; nhận lặp (kể cả song song) trả cùng `claimed_at`. Nhân vật bị gắn cờ hoặc mất đồng bộ thì bị chặn (`season_locked`). Lỗi: `season_not_final`, `season_claim_expired`, `season_no_title`, `bad_season`, `bad_season_action`.
- Giới hạn tốc độ: GET 120/phút, POST 60/phút mỗi tài khoản.

## Hậu cần bang bất đồng bộ

Đóng góp của mỗi thành viên trong mùa = điểm ranked + 3 × công trạng phiên đã nhận trong mùa (`session_rewards`), **tối đa 30 điểm mỗi người mỗi mùa**. Chỉ tính thành viên đã xác thực và không bị gắn cờ. Đây là số suy ra từ bản ghi server có sẵn, không có hành động mới để farm, nên người chơi ít thời gian vẫn đóng góp được còn người chơi nhiều thời gian không vượt trần. Bang hiện chỉ có bảng xếp hạng bang và danh sách đóng góp; chưa có thưởng.

## Dữ liệu và migration

`migrations/0011_ranked_seasons.sql` (cũng nằm trong `ensureSchema`): `season_meta`, `season_final` và chỉ mục. Chỉ thêm bảng, không đổi bảng cũ, không destructive; release contract chạy 0001–0011 hai lần trên schema cũ. Rollback = tắt flag.

## Kiểm chứng

- `worker/test/seasons.test.js` (6 case, SQLite và D1 runtime): ranh giới UTC, guard flag/mode/sandbox/khóa, xếp hạng theo phái-bracket có đồng hạng, loại người gắn cờ/g2/sandbox/không đồng bộ/dưới ngưỡng, chốt một lần dưới truy cập đồng thời, trước cutoff chưa chốt, nhận idempotent và song song, hết hạn nhận, kết quả bất biến sau chốt, không ghi sổ tài nguyên, thân request giả, hậu cần bang có trần và loại thành viên bị gắn cờ.
- `test/ranked_seasons.test.mjs` (6 case): giờ Việt Nam, danh tính, thoát HTML, nút nhận theo trạng thái, throttle, bỏ phản hồi của tài khoản cũ, chống bấm đôi.
- `scripts/session-browser-smoke.mjs`: panel đọc API thật ở 360 và 1280, không tràn ngang, nút ≥44px.

## Giới hạn

- Bracket và phái lấy theo nhân vật tại lúc chốt, không phải lịch sử trong mùa.
- Điểm resolving được retry muộn hơn 1 ngày ân hạn sẽ không vào bản chốt.
- Hậu cần bang tính theo thành viên hiện tại lúc đọc; chưa có thưởng bang hay chốt bảng bang cuối mùa.
- Số liệu (4 tuần, ngưỡng 3 điểm, nhóm 5 người, trần 30, trọng số 3) là giá trị khởi điểm chưa playtest; chưa đo tải; chưa staging.
