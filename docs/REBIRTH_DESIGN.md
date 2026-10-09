# R03 — Thành tựu, ngoại hình và chuyển sinh: tài liệu thiết kế chờ duyệt

**Trạng thái: chưa triển khai, chờ quyết định của chủ sản phẩm.** Backlog R03 yêu cầu "tài liệu review trước chỉnh" cho chuyển sinh đề xuất unlock ngang có ngân sách. Tài liệu này mô tả hiện trạng, ràng buộc và phương án; **không có con số cân bằng mới** vì đó là quyết định cần duyệt. R03 vẫn mở trong `AGENT_TODO.md`.

## 1. Hiện trạng (đọc từ mã)

- **Chuyển sinh** (`doReborn`, `js/rewards.js`): cần đạt cấp tối đa (`REBORN_LV = MAX_LEVEL`, 180), tối đa `REBORN_MAX = 5` lần. Mỗi lần: về cấp 1, xóa điểm chỉ số đã cộng và cấp `reborn × 50` điểm tiềm năng, quay về chặng 1, **giữ trang bị, võ công và điểm kỹ năng**, cộng một điểm Tâm Pháp (`tpPend`). Thưởng cố định theo số lần (`rebornBonus`): kinh nghiệm +20%/lần và sát thương +10%/lần (hiệu lực qua `P.rebDmg` trong `js/stats.js` và `gainXp` trong `js/combat.js`). Tham số này nằm sẵn trong mã; tài liệu không đề nghị đổi.
- **Mở khóa theo chuyển sinh:** `unlocked(lv)` coi `stat.reborn > 0` là đã qua mọi mốc cấp; nhiều thành tựu cấp (`lv30`, `m_ctc_60`… `m_ctc_180`) tính `reborn > 0` là đã đạt.
- **Thành tựu:** danh sách chung trong `ACH` (`js/rewards.js`) cộng danh sách theo mode ở `js/modes_play.js` (CTC có chuỗi Bách Phu Trưởng… Thành Chủ). Trạng thái ở `S.rw.ach`, lượt nhận ở `S.rw`; **toàn bộ nằm trong save của client**, không có bản ghi server.
- **Ngoại hình:** `js/doll.js`, `js/doll-data.js`. Danh hiệu mùa C08 là biên nhận cosmetic phía server cho CTC, không cộng chỉ số.
- **Validator** (`worker/src/validate.js`): ngân sách điểm chỉ số có `reborn × REBORN_PTS(50)`; số lần chuyển sinh > 5 bị gắn cờ `rebirth_count`; **có chuyển sinh thì ngân sách kỹ năng không kiểm được** và nhân vật chỉ bị đặt ở trạng thái chờ (`rebirth_skill_history`, không gắn cờ) vì server chưa có lịch sử cấp. Hệ quả hiện tại: nhân vật đã chuyển sinh bị loại khỏi bảng xếp hạng cho đến khi có cách xác minh.

## 2. Nguyên tắc bất biến

1. Không tạo nguồn điểm hay kháng tính vô hạn: tổng thưởng chuyển sinh phải bị chặn trên rõ ràng và có test biên.
2. Không phá ngân sách điểm chỉ số/kỹ năng mà `validate.js` đang kiểm; mọi thay đổi ngân sách phải đi cùng thay đổi validator trong cùng một PR.
3. Nhân vật đã chuyển sinh theo luật cũ **không bao giờ bị gắn cờ oan**: di trú phải theo phiên bản, đọc được save cũ và đặt vào cùng trạng thái chờ như hiện nay nếu thiếu bằng chứng.
4. Tiến trình tách theo mode: một tài khoản một nhân vật một mode, nên không có chuyển điểm/ngoại hình chéo mode; ngoại hình mở khóa bằng thành tựu phải mang nhãn mode và không đọc được từ mode khác.
5. Thành tựu và ngoại hình chỉ là cosmetic hoặc mở khóa *ngang* (thêm lựa chọn, không thêm sức mạnh thô).

## 3. Phương án đề xuất (theo mode, mỗi cái sau một cờ mặc định tắt)

| Mode | Hướng | Dùng nền sẵn có |
|---|---|---|
| CTC | Prestige/vai trò: mỗi lần chuyển sinh mở thêm một lựa chọn ngang (ví dụ ô vai trò hoặc danh hiệu hiển thị), không thêm % sát thương | danh hiệu mùa C08, chuỗi thành tựu `m_ctc_*` |
| PHLT | Tri thức: chuyển sinh mở thêm ghi chép/tuyến thám hiểm đã biết, không đổi số liệu chiến đấu | `js/expedition_knowledge.js` |
| 2.0 | Thư viện build: chuyển sinh mở thêm chỗ lưu build/so sánh | `js/build_library.js`, thử thách cộng đồng G04 |

Chuyển sinh *ngang có ngân sách* nghĩa là: sau chuyển sinh người chơi được **chọn** trong một danh sách unlock có tổng điểm bị chặn, thay vì nhận thêm thưởng tuyến tính. Danh sách và tổng điểm là con số cần duyệt (mục 5).

## 4. Phần máy chủ cần có trước khi đổi luật

- Một **mốc xác minh phía server**: khi đồng bộ quan sát nhân vật cấp tối đa (hoặc cấp `REBORN_LV`), ghi `char_checkpoints(account_id, mode, max_level, reborn, observed_at)`; chuyển sinh hợp lệ chỉ được tính khi có mốc trước đó. Khi đó `rebirth_skill_history` có thể chuyển từ "chờ" sang kiểm được ngân sách kỹ năng, mở lại bảng xếp hạng cho người đã chuyển sinh.
- Nhận thành tựu có giá trị cạnh tranh phải qua biên nhận server (cùng mẫu `activity_receipts`/`season_final`); thành tựu thuần cá nhân giữ ở client.
- Migration chỉ thêm bảng; rollback = tắt cờ.

## 5. Quyết định cần duyệt trước khi viết mã

1. Có giữ thưởng tuyến tính hiện tại (+20% kinh nghiệm, +10% sát thương mỗi lần, tối đa 5 lần) cho nhân vật cũ, và thêm hệ unlock ngang chỉ cho luật mới, hay thay hẳn?
2. Trần `REBORN_MAX` (hiện 5) và điều kiện cấp có giữ nguyên không?
3. Sau chuyển sinh, điểm kỹ năng có tiếp tục được giữ (hiện giữ) hay hoàn lại theo ngân sách?
4. Tổng điểm của danh sách unlock ngang cho mỗi mode và giá trị từng mục.
5. Ngoại hình: mở khóa bằng thành tựu hay mùa, và có gắn nhãn mode hiển thị không.
6. Mốc xác minh phía server: chấp nhận ghi lịch sử cấp theo nhân vật (dữ liệu mới, cần chính sách lưu).

## 6. Kiểm chứng bắt buộc khi triển khai

Nhiều lần chuyển sinh liên tiếp (0–5 và vượt 5); ngân sách chỉ số/kỹ năng trong `validate.js` với save cũ và mới; di trú save phiên bản cũ không gắn cờ oan; ngoại hình/thành tựu tách mode; nhận thành tựu lặp, lệch đồng hồ và lỗi lưu; fuzz bằng các bộ sinh đồ/save của chính game như đã làm cho G04/E03.
