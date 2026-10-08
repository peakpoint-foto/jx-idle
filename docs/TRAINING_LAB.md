# Phòng luyện — B01

Chỉ mode g2, capability training_lab mặc định tắt. Browser có training.js và training_ui.js; không có endpoint nhận kết quả client để trao thưởng. CTC/PHLT không mở lab bằng flag. Bản thử admin cũng có thể đo nhưng heroDmg được chuẩn hóa 1, god 0 trong runner; kết quả luôn ranked:false.

Chọn seed, duration 1–180 giây, 1–8 mục tiêu, HP/def/hệ/kháng và normal/boss đứng yên, tỷ lệ mana ban đầu và tùy chọn damage đầu vào một đòn/giây. Mục tiêu đứng sát nhau, không di chuyển; không giả là AI/map/boss pha thực tế. AoE dùng số mục tiêu của attack; rotation/pickAttack, heroHit, enemyHit, mana/HP regen và tickEnemyStatuses dùng engine chung. Không gọi tick/onKill/payKill/reward/save.

Runner dùng state bản sao và runtime riêng, bước cố định 0.05s; giữ seed RNG qua từng chunk rồi khôi phục Math.random, S/R/H/admin multipliers và text renderer của game thật trong finally. Pause không tiến tick; retry giữ snapshot build và parameters lúc bắt đầu dù build đang chơi đã đổi. UI chạy nhanh 10 giây mô phỏng/giây thực, không nhân tốc độ game hoặc time credit server. Reload bỏ phiên luyện trong memory, không tiêu hoặc hoàn lượt hoạt động.

DPS = useful damage / thời gian mô phỏng thực chạy. Damage trực tiếp clip theo HP còn lại, DOT chỉ cộng tick thực, không cộng damage dự kiến ở lúc cast. Các mục tiêu đã chết không tự hồi hoặc respawn. BySkill là damage trực tiếp theo chiêu; DOT tổng tách riêng, không giả định phân chia marginal bonus/độc chồng theo nguồn. Support rows lấy cấp hiệu lực và resolver chung.

ManaSpent là chi phí offensive skill; manaRecovered là regen/leech và phần tăng ròng khi bị đánh, incomingManaSpent là phần giảm ròng khi bị đánh. Mana shield và mana-on-hit xảy ra cùng đòn được trình bày theo net delta ở B01; event producer B04 sẽ tách từng nguồn thật. Thiếu mana chiêu chính ghi số giây không đủ main.cost, basicFallbacks ghi đòn thường thay thế, không tuyên bố mọi skill đều bị khóa. Hồi HP là lượng hữu ích thực, không tính overheal.

Combat version nâng jx-combat-v2: tickEnemyStatuses dùng thời gian DOT còn lại thay vì toàn bộ bước cuối; enemyAI dừng nếu bị DOT hạ, không đánh sau khi chết. Browser và Worker cùng helper; snapshot/DTO version đều đọc constant mới. Duel cũ vẫn dùng MVP power-score và chưa có combat session C05; không thay reward/quota/rarity trong thay đổi này.

Kiểm chứng: test/training.test.mjs 8 case: RNG/state/storage không đổi, pause/chunk/retry/fractional duration, input/mode/flag, AoE/overkill, mana, DOT/final tick/dead enemy, sustain/admin normalization, 10 phái và defeat không giết nhân vật thật. worker/test/combat_contract.test.js có parity DOT partial/overkill/dead target. Browser smoke thực ở 360/1280: g2 Start/Pause/Retry/flag-off; CTC/PHLT denied, không overflow.
