# C03 — giao hữu và ranked bất đồng bộ

Capability `duel_modes` chỉ CTC, mặc định tắt. `async_duels` vẫn là gate API ngoài. Bật bằng FEATURE_FLAGS sau kiểm tra release; không mở tài khoản PHLT/2.0.

Giao hữu và ranked đều yêu cầu nhân vật verified, không flagged/pending, đồng bộ trong 30 ngày. Server kiểm tra snapshot CTC/version/phái/cấp, tính lại lực chiến qua GAME/validateChar; không tin power gửi từ client. Ranked cấp 40+, cùng bracket tính từ cấp, lực chiến chênh tối đa 1,5 lần. Giao hữu không cộng điểm và không yêu cầu cùng bracket.

Offer đóng băng snapshot, power, sync revision, phiên bản combat và luật `power-v2`. Đồng bộ sau offer không đổi build của trận. Accept kiểm tra lại cả snapshot đóng băng và quyền hiện tại; model thay đổi phải gửi offer mới. Các INSERT/CAS kiểm tra revision và verified trong SQL, tránh dùng kết quả validation trước một sync đồng thời. GET gợi ý tối đa 10 đối thủ dựa trên power đã xác minh trong DB; challenge tính lại và có thể từ chối gợi ý vừa trở nên cũ.

Đây là **ước lượng lực chiến**, chưa phải mô phỏng combat hay realtime: mỗi bên lấy power × hệ số 0,90–1,10 cố định theo mã trận. UI hiển thị power, hệ số, điểm và phiên bản. Tie v2 có sai số tối đa 1e-9, mỗi bên 1 điểm, không cộng thắng/thua; thắng 3 điểm, thua 1. Giao hữu luôn 0 điểm.

TTL 3 ngày. Mùa giữ chu kỳ cũ: `floor(epoch UTC / 7 ngày)` (ranh giới thứ Năm UTC); API công bố start/end, UI hiển thị giờ Việt Nam. Pending ranked v2 hết hạn khi sang mùa; resolving đã claim hợp lệ được retry vào mùa gốc. Pending expired/declined không cộng điểm. Tối đa 3 lời mời ranked/cặp/ngày UTC, cả hai chiều, kể cả đã từ chối/hết hạn; INSERT cap và metadata nằm cùng D1 batch. Chỉ một trận pending/resolving còn TTL mỗi cặp. Các batch phân xử cộng điểm khi status còn resolving rồi đóng trận, retry không cộng trùng.

Migration 0004 chỉ thêm duel_meta; lịch sử không có metadata giữ `legacy-power-v1`, thắng khi bằng điểm như trước. Tắt flag không xóa lịch sử hoặc điểm; không nhận friendly mới và không accept v2 chưa xong cho đến khi mở lại. Legacy ranked vẫn chạy luật cũ theo rollout của async_duels; không dùng tắt flag để quảng cáo luật v2 đang áp dụng.

Kiểm chứng: 5 integration case trên SQLite và Miniflare/workerd D1, cộng các hồi quy F06; giao hữu, accept đồng thời, cap hai chiều/decline/expiry, self, kind sai, matching, stale/malformed/mode, flagged/pending, đổi model, season/TTL, frozen build, tie và timeout recovery. Browser dùng API stub local để kiểm tra chọn loại, gợi ý, lịch sử/phép tính/hòa, escape HTML, mobile touch; không gửi thách đấu tới người thật.
