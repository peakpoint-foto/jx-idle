# C04 — bạn bè và sảnh tổ đội

`party_lobby` mặc định tắt, chỉ CTC online/nonsandbox. API phòng vẫn cần `room_presence`, API /friends có gate riêng. Không mở account mode khác; đây là sảnh polling, chưa combat realtime hoặc đăng ký trận/chia thưởng.

Migration0005 additive: friendships, room_invites, lobby_rooms, lobby_members. Legacy rooms/members giữ nguyên; lần đọc advanced bổ sung metadata. Tắt flag giữ quan hệ/lời mời/metadata, quay về presence legacy. Mở lại tự sửa leader không còn trong phòng.

Kết bạn: chỉ người được mời chấp nhận, TTL7ngày, tối đa100 bạn accepted, 20 lời mời đến đang chờ, tổng accepted/pending còn hạn của người gửi tối đa120. Cặp khóa theo account ID đã sort, concurrent/retry không nhân đôi. API có rate60writes/phút/tài khoản. Friend presence dựa heartbeat tài khoản trong90giây, không chứng minh đang combat. Xóa/hủy không xóa account. Mode khác hoặc sandbox không tạo quan hệ/lời mời mới.

Phòng tối đa4người, TTL2giờ cố định. Stale sau35giây vẫn hiển thị mất kết nối và giữ chỗ đến TTL; không bị biến mất khỏi roster như legacy. Leader stale hoặc đã rời tự chọn thành viên online vào sớm nhất; không có ai online thì giữ leader để reconnect. Rời cuối đóng phòng. Chủ có thể chuyển quyền cho người online, mời thành viên rời, đặt mục tiêu farm/boss/siege/TK. Vai trò damage/control/support tự chọn, không khóa phái. Không cấp lượt hoạt động từ mục tiêu sảnh.

Ready chỉ dùng cho sảnh, phải presence fresh. Join/leave/leader/objective reset ready; đổi role bỏ ready của người đổi. Reconnect stale bỏ ready cũ, không giành lại quyền chủ. all_ready cần ít nhất2người và tất cả online/ready. Member không đổi mục tiêu/chủ hoặc kick. Mọi mutation manager dùng SQL ownership predicate, không tin nút UI.

Mời phòng chỉ bạn accepted hoặc cùng bang, TTL10phút, tối đa20pending/người nhận, một pending mỗi phòng/người nhận. Không giữ slot. Accept kiểm tra recipient, TTL, sender còn trong phòng và cap trong cùng batch; tiêu invite chỉ sau join thành công. Replay khi vẫn ở đúng phòng trả lại view, rời rồi replay không cho vào lại. Lời mời đến phòng đã đóng/hết hạn không thể sử dụng. Vào bằng mã phòng vẫn được như MVP cũ.

UI escape tên/status, role/objective allowlist, nút44px; polling5giây chỉ khi tab browser visible. Chặn request đọc/ghi trùng, giữ field đang nhập, kiểm tra identity/mode/DOM sau response trước render. Lời mời từ chối và kết bạn là thao tác rõ ràng; không gửi đến người thật khi smoke.

Kiểm chứng local: 4 integration case SQLite và Miniflare/workerd D1: quyền/expiry/mode/flags friend, cap concurrent/ready không reset khi join thất bại, invite recipient/TTL/replay, stale leader/reconnect/leave/expiry. Browser CTC360/1280px kiểm tra role/ready, roster offline/escape, kết bạn, polling không mất input, quyền member và touch/layout; PHLT/g2 denied.

Chưa moderation/chat (O03), phiên chiến đấu/thưởng (C05), load benchmark production hoặc deploy. Receipt lịch sử invitation và metadata room chưa purge định kỳ; O03/O04 cần retention vận hành. Stale slot có thể chiếm chỗ đến TTL, leader dùng kick nếu muốn nhường chỗ sớm.
