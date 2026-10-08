# B05 — Chính sách tự chiến đấu

combat_policy default-off, ba mode. extensions.combatPolicy v1 lưu mode/profile/reserveControl; version mới hơn không bị ghi đè. UI ở kỹ năng có profile mode riêng, checkbox giữ CC và lý do hành động cập nhật 500ms. Lưu qua atomic buildPersist, không đổi điểm/đồ/quota; chặn thay policy khi hoạt động đang chạy hoặc sandbox.

CTC objective chọn objective=true, ID mục tiêu của hoạt động hoặc boss còn sống trước nearest. PHLT conserve chỉ dùng thuốc trong kho ở HP<30% hoặc mana dưới một cost chiêu chính, không tự mua. Balanced dùng ngưỡng HP50%/mana2cost, mua nếu engine xác nhận đủ vàng. g2 rotation thử các chiêu trong rotPool kể cả boss, đủ mana; engine atkT/rate vẫn quyết định thời điểm tấn công.

Giữ CC bỏ chiêu có stun khi target đang stun/stunImm; nếu không còn chiêu đủ mana dùng basic. Không tạo buff/cooldown riêng: buff/nội tại và bùa hiện được calc áp dụng liên tục, đúng vũ khí theo hợp đồng hiện có. Manual dùng lựa chọn native, không để policy giành điều khiển. Training R.training dùng thuật toán native để không thay bài đo B01.

HOT cũ tick đúng một lần; không uống khi HOT còn, cd/hạn dùng riêng chưa hết, đã chết/town, nopot, potOff hoặc hết quota siege. Cooldown chung một giây ngăn mua/stock hai thuốc cùng lượt. Không vượt quota hiện có, không bịa quota riêng.

5 regression case target chết/manual, mana/CC/rotation, stock/HOT/cooldown, quota/challenge/stop và storage/mode/flag/training. Browser sáu mode/viewport chọn profile và lưu thật, giải thích buff và flag off. npm test 149/149 pass. Chưa mở flag production.
