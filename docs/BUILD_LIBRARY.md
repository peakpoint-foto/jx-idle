# G03 — Thư viện và mã chia sẻ 2.0

build_library default-off chỉ g2, panel kỹ năng → modal. Mã JXB1/base64 JSON v1 chứa mode/phái, điểm, kỹ năng, hotbar, main/rotation và recipe tham khảo. Không chứa UID/item object/save/cid/token/vàng/extension. Recipe lấy thuộc tính allowlist, không bảo đảm có thể chế đúng dòng; không tạo trang bị khi import.

Preview kiểm tra kích thước 16 KiB, schema/ID/phiên bản/phái/mode, điểm/chiêu/hotbar qua buildCandidate. Mã là template có thể sửa, không phải chữ ký hay bằng chứng sở hữu. Recipe kiểm tra base item/config/slot/rarity/attribute hữu hạn. Import lưu mã riêng; nút Áp dụng võ học revalidate ngân sách và giữ trang bị thực đang mặc. Không gọi API online.

extensions.buildLibrary v1 lưu tối đa 12 entry và 64 KiB UTF-8, mỗi entry giữ 5 bài đo cuối. Đo dùng trainingRun trên profile + trang bị thực hiện tại, điều kiện mặc định 30s seed42 từ UI; API có parameters hợp lệ. Lịch sử có version/parameters/status/DPS/sustain rút gọn, không snapshot bí mật. Thay đồ hiện tại có thể làm bài đo thay đổi và recipe chưa được áp. Lưu atomic, activity/sandbox/future version chặn write; đọc lọc row lỗi. Flag off giữ namespace.

4 case kiểm tra roundtrip/identity/no item import, tampered/oversized/schema/budget, bounded measurement/storage/sandbox và mode/activity/version. npm test 153/153 pass. Chromium g2 hai viewport xuất→preview→lưu→đo→apply→xóa, mode khác denied. Không deploy; chưa mở thư viện cộng đồng external.
