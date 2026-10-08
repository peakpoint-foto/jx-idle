# Combat contract — F04

Version: jx-combat-v2 (B01: DOT cuối clamp theo duration còn lại; v1 dùng full dt cuối). Browser và Worker nhúng cùng core/modes/stats/combat, skill graph và save schema. File sinh worker/gen/game.js không sửa hoặc commit tay. Helper mới ảnh hưởng calc phải được nối vào index.html, test fixture và worker/build-game.mjs.

## Tính toán

- calc nhận state và trang bị hợp lệ, tính các thuộc tính, nội tại, curse, skill bonuses và actives. Không thay công thức để cân bằng một mode mà bỏ mode khác.
- addskilldamage lấy target ID và percent từ skVal tại cấp hiệu lực; bonus được dùng cho ID chiêu gốc trong activeInfo. Child rows không được tự gộp vào cha vì dữ liệu thường đã có cả hai; đích thiếu được ghi unsupported trong graph, không thay ID.
- Ngoại công dùng attack rating theo skillUsesAR; chiêu nội công được loại khỏi AR theo prop/parent. Damage qua applyPart/kháng/ngũ hành; crit vật lý và DOT có quy tắc riêng. Không dùng con số DPS ước tính làm bằng chứng thắng trận.
- Nội lực, shield, cooldown, kháng và clamp phải dùng cùng phiên bản model. DTO/seed/tick/action/result/reward server cho multiplayer do C05 triển khai, chưa có ở contract này.

## Snapshot online

Phiên bản snapshot 1 phải chứa model version, identity/mode, revision snapshot server, thời điểm và seed/session ID; chỉ server lấy state đủ điều kiện để tính chỉ số. Không gửi token trong snapshot hoặc mã build. Không coi chữ ký save client là chứng minh tính hợp lệ.
Nếu thay công thức trong lúc có duel/session, phiên cũ phải giữ version cũ hoặc bị hủy không nhận thưởng trùng; policy và rollout do F06/C05/O04 kiểm chứng trước public.

## Diagnostic event

combatEvent tạo payload allowlist, không nhận trường tùy ý (save/token/contact). Thời gian không âm; mode hợp lệ; damage/heal/mana dùng raw sau mitigation và capacity thực tại thời điểm event. useful=min(raw,capacity), excess phần không hữu ích. capacity damage là HP còn; heal/mana là chỗ trống cần hồi. Control ghi duration thực áp dụng.
DOT được ghi mỗi tick thực gây damage, không ghi toàn bộ độc tại lúc cast rồi ghi lại ở tick. Mana shield phân biệt resource spent và health damage, không đếm thành hai lần damage. Producer/aggregate/timeline do B04 thực hiện. Helper này chỉ chuẩn hóa diagnostics, không xác thực packet người chơi để trao reward.

## Kiểm chứng

worker/test/combat_contract.test.js so sánh descriptor/event và calc client/Worker trên 10 phái × 3 mode, kiểm tra parts/rate/mana/kháng/crit/HP; worker/test/skill_graph.test.js kiểm tra bonus/graph. test/skill_graph.test.mjs kiểm tra tăng/rút cấp bổ trợ và weapon mismatch trong mô tả. Cần test cơ chế mới khi B04/C01/C05 thêm producer hoặc mô phỏng trận.
