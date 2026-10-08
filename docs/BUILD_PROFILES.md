# Build profile — B02

js/build_profiles.js bổ sung kiểm tra và lưu nguyên tử sau js/builds.js. S.builds vẫn là nơi lưu; profile mới v2 có mode/phái, điểm, main/mainLock, 4 hotbar slots, rotation và equipment UID nếu build_profiles bật. Không chứa bản sao item, token hoặc reward. Migration save v2 giữ profile cũ; profile chưa có v/mode/fac chỉ được xử lý như võ học cũ, vẫn phải qua kiểm tra phái/cấp/ngân sách thực.

Flag build_profiles mặc định tắt: các bộ võ học cũ vẫn dùng được và được gia cố; capture trang bị mới và áp dụng profile kèm trang bị bị khóa. Tắt flag không xóa profile. Bật chỉ thay scope capture/load, không mở rarity/điểm hoặc quyền inventory. O04 mới quản lý rollout.

Lưu/Xem/Dùng nằm trong tab Võ công. Xem tính chỉ số trên bản sao, không áp dụng; DPS preview là ước tính từ calc, không giả là đo phòng luyện. Khi dùng, điểm phải nguyên không âm, skill thuộc phái và đủ cấp/max, hotbar/main là attack đã học, ngân sách bằng kho điểm hiện có. Mode/phái khác hoặc version mới hơn bị từ chối.

Trang bị được tìm trong inventory và đồ đang mặc theo UID; duplicate UID, sai slot, sai rarity/mode, thiếu item, thiếu điều kiện mặc hoặc túi đầy đều báo lỗi trước thay đổi. Món khóa đang mặc giữ đúng slot; món khóa trong túi chỉ chuyển khi người chơi chủ động dùng profile, giữ thuộc tính locked. Không lấy item từ kho chung hoặc tự tạo item bị thiếu.

Đổi build/tẩy điểm bị chặn trong siege, tower, TK, survival, expedition/rift active và onlineSession chưa completed/aborted. Các task session phải dùng đúng các trạng thái này hoặc cập nhật guard/test. Save bị khóa/sandbox không persist build. Ordinary farming vẫn cho đổi như công cụ cũ; recalc giữ tỷ lệ HP/mana và không reset cooldown/quota. Hotbar ô trống vẫn tuân theo auto-fill của control.js khi render pad.

Save candidate thành công mới giữ state mới; storage failure trả lỗi và phục hồi S/R chỉ số cũ. Quota/vàng/cid không đổi. Không dùng profile như chứng minh quyền sở hữu online; C05/E04 vẫn cần inventory/ledger server.

Kiểm chứng: test/build_profiles.test.mjs 10 case, roundtrip/reload ba mode, budget/UID/HP/mana, thiếu/khóa gear, yêu cầu/rarity, phiên hoạt động, storage/sandbox, legacy/flag-off và túi đầy. scripts/browser-smoke.mjs kiểm tra nút thật Lưu–Xem–Dùng cả ba mode ở 360/1280; không overflow và nút tối thiểu 44×44. Browser smoke tắt cache/reload trước kiểm tra để không đọc asset cũ.
