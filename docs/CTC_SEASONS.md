# C08 — Mùa ranked và hậu cần bang CTC

## Ranked season

Mùa dùng UTC week index `floor(epoch_ms / 7 days)`, giống season key của ranked duel. Cutoff chính xác là `season × 7 days`; không phụ thuộc timezone máy khách. Khi sang index mới, ranked duel cũ hết hạn theo C03; season scoreboard chỉ đọc duel_scores đã chốt, theo phái và bracket của nhân vật CTC hiện đã xác minh. Flag `seasonal_challenge` mặc định tắt và server lấy mode từ save đã lưu.

Điểm bằng nhau được xếp cùng hạng bằng điểm, thắng và thua; top 1 nhận “Chiến Tướng”, top 3 “Top 3 Mùa”, top 10 “Top 10 Mùa”. Chỉ mùa vừa đóng được claim. Server tính rank và lưu một receipt/account/mùa; retry trả cùng receipt. Title không cấp chỉ số, vàng, vật phẩm hay điểm ranked; danh sách claim hiển thị trong panel Mùa ranked.

## Hậu cần bang

Nhiệm vụ “Tiền tuyến” chạy song song theo season UTC, mục tiêu bang 250 điểm. Chỉ claim thành công của encounter Công thành CTC server hoàn tất mới tạo progress; mỗi actor nhận tối đa 20 điểm/receipt và tối đa 50 điểm/tuần. Receipt khóa theo session/account; retry không cộng lần hai. Thay đổi bang không mang progress cá nhân sang bang mới. Hiện nhiệm vụ là thanh tiến độ cộng đồng, chưa đổi thành tài nguyên kinh tế.

## Schema và kiểm chứng

Migration additive 0011 thêm bảng danh hiệu, task, member progress và receipt; rollback là tắt `seasonal_challenge`, không drop dữ liệu. Test cover faction/bracket, UTC cutoff/rollover, tie ranks, CTC/flag guards, claim retry, task dedupe và cap 50; D1 runtime lặp migration 0001–0011 hai lần. Browser D1 xác minh season panel cùng task bang sau hai-client Công thành. Chưa có vận hành/staging remote; O04 vẫn là release gate.
