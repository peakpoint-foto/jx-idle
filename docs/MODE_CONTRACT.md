# Hợp đồng luật mode — F01

Baseline: 68124fe, đọc từ js/modes.js, js/rewards.js, js/siege.js, js/activities.js, js/modes_play.js và worker/src/account.js. Tài liệu khóa luật hiện tại; tính năng mới phải dùng capability riêng, mặc định tắt cho đến khi đạt task nghiệm thu.

| Luật | ctc | phlt | g2 |
|---|---|---|---|
| Rarity tối đa | 2: Vàng | 4: Hoàng Kim | 5: Bạch Kim |
| Hoàng Kim / Bạch Kim | Không / Không | Có / Không | Có / Có |
| Tím / lab / rforge | Không | Có | Có |
| Tốc độ cho phép | 1 | 1 | 1, 1.5, 2.5 |
| Tốc độ config mặc định | 1 | 1 | 2.5 |
| Độ khó | 1 cố định | 2 cố định | Tự chọn |
| Hệ số EXP config | 1 | 0.8 | 2 |
| Hệ số drop config | 1 | 1 | 1.5 |
| Sandbox admin | Không | Không | Có, không lưu |
| Lượt Tài Xỉu/ngày | 0 | 3 | 20 |
| Công thành / Tống Kim | 1 trận mỗi loại/tuần | 1 trận mỗi loại/tuần | Không giới hạn lượt |
| Mua từng món shop hoạt động | 1/tuần | 1/tuần | 1/tuần |
| Vào tháp | 7/ngày | 7/ngày | Không giới hạn |
| Tháp trong một lượt | Có thể tiếp tục vượt 50 | Có thể tiếp tục vượt 50 | Có thể tiếp tục vượt 50 |
| Sau kỷ lục 50 | Vào lại từ tầng 40 | Vào lại từ tầng 40 | Tiếp tục từ kỷ lục+1 |
| Online account hiện tại | Có | API từ chối | API từ chối |
| Chuyển mode | Một chiều tới g2 | Một chiều tới g2 | Không chuyển ngược |

Hệ số config không phải toàn bộ hệ số cuối: difficulty, mutator, hoạt động và buff cũng tác động. Khi đọc save g2, modeSanitize hiện đưa speed=2.5 về 1; F01 ghi nhận hành vi hiện tại, không tự sửa default trong task khóa luật.

## Cách ly dữ liệu và nhập đồ

- Kho, bang local, gia tộc và collections dùng suffix mode. Bang online D1 là hệ khác bang local.
- CTC/PHLT từ chối item có mo khác mode. g2 nhận item hợp lệ từ mode thấp hơn theo chính sách chuyển một chiều.
- Rarity, vio, set và plv vẫn được kiểm tra độc lập. Không nâng trần bằng cách xóa nhãn mode.
- modeSanitize hiện chuyển đồ không hợp lệ thành vàng theo itemValue, loại khỏi eq/inv/ground. Schema mới phải bảo vệ khỏi hiểu nhầm đồ hợp lệ.
- UI chỉ chuyển một chiều tới g2; activity đang chạy chặn chuyển mode và chuyển sinh. Dã Tẩu xong chưa nhận phải nhận trước chuyển. Seal chọn mode có rank thấp hơn khi dữ liệu lệch, nên không phải chứng minh chống sửa save hoặc chống hạ mode; server vẫn phải xác thực lịch sử.
- Token gắn slot nhưng cid dùng để kiểm tra nhân vật online; xuất build/save không được coi là quyền tài khoản.

## Capability mới (đề xuất bị khóa, chưa bật runtime)

| Capability | Mode mục tiêu | Reward | Gate |
|---|---|---|---|
| training_lab | g2 trước, mode khác sau | Không cấp reward | B01/G01 |
| expedition | phlt | Session loot theo cap phlt; gear lâu dài không mất | P01–P04 |
| skill_mutators | g2 | Chỉ modifier trong phiên; reward theo cap g2 | G02 |
| ranked_duel | ctc | Điểm mùa server; không nhận tài nguyên sandbox | F06/C03 |
| party_combat | ctc trước; phlt/g2 riêng | Server receipt, mode-specific | C05/C06/P05/G04 |
| seasonal_challenge | Mỗi mode namespace riêng | Claim một lần có server verification | C08/P06/G04 |
| trading | Chưa bật ở bất cứ mode nào | Server-owned item escrow | E04/E05 |

Quy tắc mở: client chỉ điều khiển hiển thị; server kiểm tra mode/capability/sandbox độc lập. Flag tắt không xóa save. Config lỗi phải fail closed cho phần online mới nhưng offline game vẫn chạy. Không thay quota hiện tại để thuận tiện xây nội dung mới.

## Evidence

test/mode_contract.test.mjs khóa config, rarity và cách ly item, sanitize, seal, chuyển mode, quota và sandbox. Cùng với test/workflow.test.mjs kiểm tra entry rollback/storage failure và giới hạn shop. API non-ctc được xác minh qua worker/test/account.test.js; không mở tài khoản phlt/g2 trong F01.
