# Audit trục kỹ năng — F02, phần đã thực hiện

Chạy npm run audit:skills; JSON đầy đủ: node scripts/skill-audit.mjs --json. Strict gate: npm run audit:skills:strict trả exit 1 khi còn ID thiếu hoặc rank data malformed. Không diễn giải strict thất bại thành test regression đã pass.

Nguồn: data.js, SHA256 702f2ae6d09d750d98effd634974e258499af3207bce38e1ffcfeec54784d75e. Git history local của data.js chỉ có commit xuất bản 8d1389d, không có bảng mapping/nguồn extraction; không tìm thấy skill .lua/.ini/.tab/.csv/.tsv gốc trong repository.

## Kết quả tái tạo

106 dòng addskilldamage: 76 tới kỹ năng học được cùng phái; 15 tới kỹ năng con đã tồn tại; 15 tới ID không tồn tại. Mọi ID tồn tại ngoài danh sách học trong audit đều có owner qua child chain. Không cộng dồn lại bonus parent+child: nhiều dòng đã khai báo cả hai, cần nguồn luật gốc trước thay đổi.

| Phái | Source → target thiếu |
|---|---|
| Thiếu Lâm | 271 → 1055, 1083 |
| Đường Môn | 249 → 340 |
| Ngũ Độc | 71 → 354; 384 → 383 |
| Nga Mi | 82 → 331; 385 → 329 |
| Thúy Yên | 105 → 382; 111 → 338; 113 → 338; 337 → 1065, 1093 |
| Thiên Nhẫn | 148 → 363 |
| Võ Đang | 158 → 162 |
| Côn Lôn | 176 → 373 |

test/skill_graph.test.mjs tái tạo phân loại, chống child cycle và rank destination không nhất quán; kiểm tra tăng/rút skill support ở 76 liên kết × 3 mode, cap cấp được cộng, không gộp child vào parent và mô tả nội tại sai vũ khí. worker/test/skill_graph.test.js đối chiếu client/Worker đủ 10 phái × 3 mode. Chưa chứng minh PvP balance hay định nghĩa các projectile đã đúng theo game gốc.

## Mapping chưa thể khôi phục

Thiếu bảng skill gốc và quy tắc addskilldamage áp dụng lên parent/projectile. Cần một đường dẫn/repository/tệp nguồn được phép dùng, có định nghĩa các target thiếu và lịch sử tên/ID; sau đó mỗi mapping sửa phải ghi nguồn, lý do và test damage/vũ khí/level cap/Worker parity.
Không thay 340→339 hoặc 354→353 chỉ vì ID/tên gần nhau. Không xóa 15 dòng khỏi dữ liệu để làm strict pass.

F02 hoàn thành theo nhánh nghiệm thu cho phép ghi unsupported: js/skill_graph.js là resolver production dùng skVal/cấp thực; js/skill_graph_ui.js hiển thị ID thiếu và trạng thái kỹ năng con, không đổi công thức damage hay đoán mapping. 15 target vẫn chưa có dữ liệu và strict audit vẫn exit 1 có chủ ý. Các task độc lập có thể tiếp tục, không coi F02 là đã khôi phục tất cả kỹ năng gốc. Khi nhận nguồn bổ sung phải mở task mapping riêng, ghi provenance và regression trước sửa data.js.
