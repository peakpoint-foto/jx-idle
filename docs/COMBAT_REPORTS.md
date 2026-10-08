# Báo cáo trận — B04

combat_reports mặc định tắt, offline cả ba mode. Module combat_reports.js nạp cuối để bọc các handler thực sau survival/workflow overrides. Event dùng combatEvent allowlist; không dùng diagnostics để trao reward hoặc xác thực ranked.

Producer ghi damage trực tiếp/retaliation/pet, DOT từng tick, heal/regen/HOT/thuốc/pickup, skill mana spend, mana shield và mana-on-hit/leech theo raw/cap thực tại điểm thay đổi. Không cộng độc dự kiến ở lúc cast. CC ghi thời gian quan sát trên quái còn sống, không coi thời gian stun dự kiến sau khi quái chết là đóng góp. Survival arena có producer riêng cho damage/độc/freeze/stun/heal/final-boss wave; đây là Luyện Công cũ, không phải expedition P01.

Sửa thêm hai counter survival: DOT cuối dùng duration còn lại; damage theo skill clip theo HP trước tick/hit, không trừ đóng góp thành số âm khi đánh target đã chết. Không đổi reward/rarity/quota. Formula version vẫn jx-combat-v2 trong cùng thay đổi chưa release; COMBAT_CONTRACT.md ghi generic DOT clamp, survival dùng cơ chế stars riêng và không được đưa vào ranked/session chung nếu chưa có model tương ứng.

R.combatTrace giữ runtime, S.extensions.combatReports={v:1,history} giữ tối đa 5 báo cáo và 64 KiB UTF-8; mỗi timeline tối đa 128 event, totals tối đa 64 nhóm. Tổng tích lũy vẫn dùng các event hợp lệ; dropped báo timeline đã bỏ event cũ, partial báo khoảng không được thu thập/lỗi/cắt report. Không ghi khi ở town hoặc trong training runner. Save migration v2 giữ namespace; namespace future version không bị ghi đè. Reload giữ báo cáo đã hoàn tất, bỏ trace đang chạy, không hoàn quota.

Farm đóng theo wave; siege/tower/TK/survival đóng theo kết quả/abort. Chuyển activity giữa trace đánh dấu interrupted; chuyển nhân vật/mode không chuyển trace cũ vào save nhân vật khác. Phase hồi sinh được quan sát từ tick thật. Báo cáo gục chỉ nêu nguồn khi có lethal incoming event cùng thời điểm death; nếu không có, báo không đủ evidence. Không dùng lastHit hoặc số thiếu mana để đoán nguyên nhân chết.

UI: Sổ tay → Báo cáo trận. CTC nhấn damage gây ra, CC thực và hồi nhận; PHLT nhấn mana/thuốc; g2 nhấn độc và damage dư. Mỗi báo cáo có timeline gần nhất và lựa chọn xuất timeline/chỉ số tổng hợp. Export tạo textarea để người chơi tự sao chép; không gửi mạng, không chứa raw save/item/token/cid/tên/contact. Extra field trong archive nhập lại được allowlist khi export; checkbox không chọn thì bỏ events/stats. Version của report cũ được giữ, không gán công thức mới cho số cũ.

Giới hạn: event hiện là diagnostics local, không phải ledger hoặc bằng chứng phần thưởng. B01 vẫn trình bày incoming mana net delta của runner; B04 live combat tách shield và hồi theo nguồn. Hoạt động mới C01/P01/G02/C05 phải dùng producer/finish và test resume/abort riêng; không dựa việc namespace tồn tại để coi session đã xây.

Kiểm chứng: test/combat_reports.test.mjs 12 case: ba mode/reload, direct/DOT/overkill/overheal, shield + mana-on-hit, lethal evidence/abort, UTF-8 cap/export privacy, flag/training isolation, CC/potion/future namespace, extra imported fields, revival/tower abort, survival DOT và companion. Browser smoke sáu mode/viewport mở Sổ tay/report riêng mode rồi export timeline đã chọn; không tự kèm stats hay identity.
