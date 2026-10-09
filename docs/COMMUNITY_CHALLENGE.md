# G04 — Thử thách cộng đồng 2.0 (DONE local)

Flag `community_challenge` (chỉ 2.0, mặc định tắt, online, `requires: online_account_g2`). CTC và PHLT không thấy gì. Không cần `party_combat` hay sảnh: thử thách chạy một mình và không đi qua phòng.

**Phạm vi "giao hữu chuẩn hóa".** Được làm là so sánh *bất đồng bộ* trên cùng điều kiện: mọi người chạy cùng một build chuẩn trước cùng một chuỗi chủ tướng rồi so điểm. Không có đấu PvP trực tiếp trong 2.0 (đấu bất đồng bộ vẫn chỉ có ở CTC).

## Ý tưởng: thử thách là một *build*, không phải một save

- Người chơi đăng một build: phái, giới tính, bốn chỉ số, bảng kỹ năng và kỹ năng chính, kèm một mốc (`std40`, `std60`, `std100`; danh sách cố định, có phiên bản `g2-challenge-v1`). Không có chữ tự do nào: không tên, mô tả hay chat, nên không có nội dung người dùng để kiểm duyệt ngoài tên tài khoản đã có sẵn trên bảng xếp hạng.
- `challengeSpecCheck` (`js/standard_gear.js`, dùng chung trình duyệt và Worker) **từ chối** thay vì sửa: khóa lạ, sai kiểu, phái hoặc kỹ năng ngoài phái, kỹ năng vượt cấp mốc, vượt ngân sách `(cấp−1)×5` điểm chỉ số / `(cấp−1)+1` điểm kỹ năng. Mã lỗi `challenge_bad_*`, `challenge_attr_budget`, `challenge_skill_budget`.
- Máy chủ dựng nhân vật từ build đã lưu bằng `challengeSave` ở cấp cố định, không điểm dư, **trang bị chuẩn tất định** (cùng bộ chọn đồ tham chiếu của công thành, độc lập với save của người gọi, RNG khởi tạo cố định và được khôi phục sau đó). Đồ, vàng, tên và cấp của người chạy không đi vào kết quả. Parity trình duyệt–Worker được kiểm cho 10 phái × 3 mốc.

## Chạy và bảng

- Chạy là một phiên `challenge` của engine chung (`js/session_combat.js`): một người, chuỗi chủ tướng **tuyệt đối** `1200 × 1,35^chặng` nhân với hệ số mốc (`scale`), 6 chặng, sát thương tăng 30% mỗi chặng, luật chủ tướng lấy từ mã thử thách (cùng bốn luật iron/swift/tough/ward như P06). Người chơi chỉ điều khiển Phòng thủ và Hồi phục; máy chủ chạy các nhịp (polling 1 giây, tối đa 5 phút/lượt).
- **Seed là hàm thuần của phiên bản luật và mã thử thách** (FNV-1a trên `g2-challenge-v1:<mã>`) nên mọi người chạy cùng mã đối đầu đúng một trận.
- Điểm như P06: số chặng đã hạ + phần trăm HP đã trừ ở chặng đang đánh. Mỗi tài khoản giữ kết quả tốt nhất theo thử thách; hòa điểm thì ít nhịp hơn xếp trước, rồi ai đạt trước, rồi mã tài khoản. Mỗi phiên chỉ được ghi một lần (`challenge_attempts.recorded_at` là dấu duy nhất); phiên bị hủy bởi vận hành hoặc hết hạn khi chưa kết thúc không bao giờ được ghi.
- Chỉ nhân vật 2.0 đã xác thực, không bị gắn cờ mới hiện trên bảng; bị gắn cờ thì biến mất khỏi bảng (`challenge_locked` khi xem).
- **Không có thưởng**: `claim` bị từ chối (`session_reward_unavailable`), không ghi sổ cái, không có bảng ví.

## Hạn mức và chống lạm dụng

- Đăng: tối đa 5 build mới mỗi ngày UTC mỗi tài khoản và 20 thử thách đang mở, kiểm tra nguyên tử trong chính câu lệnh `INSERT` (`challenge_publish_limit`, `challenge_open_limit`). Cùng một build của cùng một tác giả luôn trả về cùng một mã (không tạo trùng, không tốn hạn mức); gỡ rồi đăng lại mở lại đúng mã cũ.
- Chạy: tối đa 10 lượt mỗi ngày UTC, nguyên tử trong lệnh tạo phiên (`challenge_attempts_used`); lặp lại với cùng mã client trả về cùng phiên; đang trong phiên khác thì `session_member_busy`.
- Không có endpoint nhận điểm, kết quả hay replay; thân request có khóa lạ bị từ chối (`bad_challenge_action`, `forged_session_action`). Chỉ tác giả được gỡ thử thách của mình.
- Mỗi thử thách gắn phiên bản luật; đổi `CHALLENGE_VERSION` thì thử thách cũ báo `challenge_outdated`, không chạy được và không lẫn bảng.
- Tắt flag: phiên đang chạy bị hủy và giữ trạng thái; bảng và thử thách giữ nguyên trong D1.

## Dữ liệu

`migrations/0013_community_challenge.sql` (cũng trong `ensureSchema`): `challenges`, `challenge_attempts`, `challenge_results`. Chỉ thêm bảng. Phiên dùng `combat_sessions` hiện có với `room_id = 'challenge:<tài khoản>'` (không phải phòng thật). Rollback = tắt flag.

## Giao diện

Panel "Thử thách cộng đồng 2.0" trong tab Khác: nút "Đăng build của tôi" cho từng mốc (build được cắt cho vừa ngân sách; xám nếu không ghép được), ô chạy theo mã, danh sách "Của tôi" (Chạy/Bảng/Gỡ), "Mới đăng", bảng của thử thách đang xem. Phiên đang chạy dùng khung phiên chung, không có nút nhận thưởng.

## Hiệu chỉnh

Mô phỏng 10 phái (build chia đều chỉ số, 6 kỹ năng, tự đánh và tự đánh + Phòng thủ xen kẽ): hệ số mốc `std40` ×4, `std60` ×7, `std100` ×10, 6 chặng cho độ sâu phân hóa từ 1 đến hoàn thành giữa các phái; hệ số nhỏ hơn làm mọi phái hoàn thành cả ba mốc.

## Kiểm chứng

- `worker/test/standard_challenge.test.js` (4 case): bảng mốc cố định, mọi kiểu build sai bị từ chối đúng mã, trang bị chuẩn tất định và giống nhau giữa trình duyệt–Worker cho 30 tổ hợp, không làm nhiễu `S`/RNG.
- `worker/test/session_engine.test.js` (+2): solo 2.0, tùy chọn bị validate (kể cả `scale` kiểu chuỗi), hệ số mốc nhân chuỗi chủ tướng, boss không co theo người chơi, parity 10 phái.
- `worker/test/community_challenge.test.js` (6 case, SQLite và D1): cờ/mode/xác thực, hạn mức đăng và idempotent, gỡ/mở lại, phiên do máy chủ mô phỏng từ build đã lưu, ghi kết quả một lần và giữ kết quả tốt nhất, cùng seed cho mọi người, loại người bị gắn cờ, hạn mức lượt, hết hạn, phiên bản cũ, hủy khi tắt flag, không có đường gửi điểm.
- `test/community_challenge.test.mjs` (6 case): danh tính, cắt build theo ngân sách (10 phái × 3 mốc, luôn qua kiểm tra chung), thoát HTML, throttle, body gửi đi, lỗi thân thiện.
- `scripts/session-browser-smoke.mjs`: hai trình duyệt cô lập (360/1280) đăng build, thấy nhau, cùng chạy, bảng chung #1/#2, không ghi sổ cái, nút chạm ≥44px, không tràn ngang, tắt flag thì panel biến mất.

## Giới hạn

- Hệ số mốc chỉ hiệu chỉnh bằng mô phỏng với build chia đều; chưa playtest, build tối ưu hóa của người chơi có thể vượt xa hoặc hoàn thành hết mốc thấp.
- Chưa có chống sao chép build (ai cũng đọc được build đang mở) — đó là chủ ý để học từ nhau, nhưng bảng chỉ so điều khiển Phòng thủ/Hồi phục khi build giống nhau.
- Chưa có xoay vòng/làm mới theo tuần, danh hiệu hay thưởng; chưa kiểm duyệt riêng ngoài gắn cờ tài khoản.
- Mỗi lượt tốn tối đa 5 phút phiên polling 1 giây; chưa đo tải; chưa staging.
