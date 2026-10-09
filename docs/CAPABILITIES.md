# Capability contract — F07

js/capabilities.js được dùng cả browser và Worker. Các tính năng mới mặc định tắt; các MVP social hiện có và cây skill giữ trạng thái bật đúng mode. FEATURE_FLAGS là JSON map boolean tùy chọn của Worker (không phải secret); key không đăng ký và giá trị không boolean bị bỏ qua.

Ví dụ đóng phòng: {"room_presence":false}. Đọc GET /api/config?mode=ctc|phlt|g2: version, combat_version, feature_flags và capabilities. Config lỗi dùng defaults; tính năng mới vẫn tắt. UI/offline không phụ thuộc request config thành công.

Các cổng có mode cố định: training_lab chỉ g2, expedition chỉ phlt, skill_mutators chỉ g2; async_duels/guild_online/room_presence chỉ ctc. Bật flag không vượt mode rule; feature online luôn tắt với sandbox. Party/season có mode mục tiêu ba mode nhưng vẫn mặc định tắt, và API account hiện chỉ chấp nhận CTC. Mở account mode khác phải thực hiện task P05/G04, không bỏ parseSave guard.

Middleware social đọc mode từ snapshot tài khoản server sau auth; không tin query/body mode. Khi flag bị tắt, request trả 403 feature_disabled trước gọi handler; DB/save vẫn giữ nguyên để mở lại. Config công khai không trả dữ liệu người chơi, token, ADMIN_KEY hoặc nội dung env ngoài danh sách boolean.
combat_reports là capability offline ba mode, default-off; báo cáo cũ không bị xóa khi tắt. B01 training_lab chỉ g2 và B02 equipment capture dùng build_profiles đều default-off đến rollout O04; không dùng trạng thái flag để coi staging/deploy đã kiểm chứng.

Để thêm capability: đăng ký mode/default/sandbox policy, cập nhật config và API guard, test denied mode/flag-off/config-error/forged request. Chưa bật tính năng không có implementation hoặc chưa đạt release gate. Không dùng flag như quyền bỏ qua validation/ownership/receipt.

Các module đã triển khai local vẫn default-off: build_profiles/build_advice/combat_policy/loot_codex/context_guide/feedback_diagnostics/combat_reports cho ba mode; training_lab/build_library chỉ g2; phased_boss/guild_management/duel_modes chỉ CTC. party_lobby, party_combat, party_dungeon và party_siege (C07) chỉ CTC, mặc định tắt; party_siege cần party_lobby + party_combat. ranked_seasons (C08) chỉ CTC. online_account_phlt / online_account_g2 mở đăng ký+đồng bộ cho từng mode, mặc định tắt (xem ONLINE_MODES.md); không mở tính năng chơi chung. coop_rescue (P05, chỉ PHLT, mặc định tắt) mở sảnh/phiên giải cứu; registry có trường `requires` để cờ riêng của một mode điều khiển tính năng dùng chung (xem COOP_RESCUE.md). weekly_trial (P06, chỉ PHLT, mặc định tắt, requires coop_rescue) mở thử thách tuần do máy chủ mô phỏng (xem WEEKLY_TRIAL.md). Xem docs task tương ứng và EXECUTION_EVIDENCE.md trước rollout; không bật online chỉ vì UI offline đã pass.
