# P03 — Đường đi và hợp đồng PHLT

`expedition_routes` mặc định tắt, chỉ PHLT; cần cả expedition và expedition_travel. Lựa chọn được lưu trong `extensions.expedition.travel.route = {v:1,id,contract}` cùng lần trả phí. Chọn trước khi xuất phát, không đổi trong chuyến hoặc reset chặng để lấy thưởng. Chuyến P02 cũ không tự thêm đường.

| Đường | HP / đòn quái so với native | Vàng mỗi chặng theo phí | Giới hạn loot/chuyến | Địa hình |
|---|---|---|---|---|
| Trú ẩn | ×0.8 / ×0.85 | floor(35%) | 3 | Hàn trận → hao MP → hàn trận |
| Phế tích | ×1.15 / ×1.1 | floor(45%) | 6 | Lửa → hàn trận → hao MP |
| Phế tích + truy kích | ×1.4375 / ×1.32 | floor(50%) | 6 | Như phế tích |

Phí và thuốc dùng P02, không tăng giá ngầm. Tổng vàng tối đa 1.5 lần phí, chỉ nhận khi kết thúc an toàn. Hợp đồng không tăng phẩm chất loot hoặc tạo nguồn Bạch Kim. Loot lấy rollDrops elite native, cấp bị DROP_OVER chặn, modeItemOk PHLT kiểm tra trước chuyển túi; ba chặng cùng RNG seed theo session/chặng, retry không roll lại hoặc tiêu UID hai lần. Không đảm bảo đồ Tím/Hoàng Kim từ nguồn elite; preview nói rõ nguồn và giới hạn, không công bố xác suất suy đoán.

UI nêu tên quái bản địa, khoảng cấp, elite cuối, sức quái, địa hình, vàng và loot trước phí. Gợi ý B03 chỉ dùng đồ/build sở hữu, kháng/HP/regen và sustain mana, không tự mặc hoặc bỏ luật đổi build trong hoạt động. Khống chế vẫn dùng enemyAI native, không tạo môn phái bắt buộc; môi trường không bị stun như quái. Đây là cân bằng thử nghiệm sau feature flag, cần E04 và thử người chơi trước rollout.

Save failure khôi phục phí/namespace và giữ thao tác retry; lựa chọn nằm trong candidate đã chốt, không dựa vào dropdown sau lỗi. Flag-off kết thúc interrupted không thưởng; dữ liệu route version mới giữ nguyên/freeze, known malformed v1 không được thực thi hoặc trả thưởng. Local receipt không thay thế authoritative session C05.

Kiểm chứng: 5 case P03 (preview thuần/mode, atomic fee và route, fixed-seed ba lựa chọn × 10 phái, rollback roll/UID, future/malformed/flag/reward inflation); hồi quy P01/P02; Chromium 360/1280 cho select/contract/preview/frozen-route/payout, hai mode khác denied. npm test 204/204. D1 kiểm tra lại sau sửa fixture duel: hòa hợp lệ nhận tổng2 thay vì luôn4, vẫn đúng2 score rows và cộng một lần.
