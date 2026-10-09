# R03 — Thành tựu, ngoại hình và chuyển sinh

## Hệ thống hiện có theo mode

- **CTC:** danh hiệu `Chiến Tướng`, `Top 3 Mùa`, `Top 10 Mùa` do Worker tính từ mùa đã đóng và claim bằng receipt duy nhất theo tài khoản/mùa. Mục tiêu hậu cần bang là tiến trình cộng đồng, không đổi thành tài nguyên. Xem [CTC_SEASONS.md](CTC_SEASONS.md).
- **PHLT:** tri thức hành trình lưu checkpoint và đường hoàn tất theo character. Dấu checkpoint là cosmetic/ghi nhận, không cấp stat hoặc vật liệu; fail chỉ giữ checkpoint đầu tiên đã qua, abort/withdraw không mở tiến trình. Xem [EXPEDITION_KNOWLEDGE.md](EXPEDITION_KNOWLEDGE.md).
- **2.0:** thư viện build/Rift mở thành tựu theo trục, bí cảnh và build khác nhau. Claim hữu hạn, retry idempotent, tách namespace character/mode, không cấp stat/vàng/vật phẩm. Xem [RIFT.md](RIFT.md) và `js/build_progression.js`.

Các hệ thống giữ namespace và điều kiện theo mode, không nhập danh hiệu/tiến trình giữa CTC, PHLT và 2.0. Các nguồn hiện tại không cho phép claim lặp thành tài nguyên hoặc chỉ số vô hạn.

## Quy tắc chuyển sinh

Không sửa luật rebirth legacy trong R03. Nếu sau này thiết kế lớp chuyển sinh mới, chỉ xem xét mở khóa ngang: cosmetic, hướng dẫn, mục tiêu build hoặc lựa chọn tiện ích có cap; không cộng điểm tiềm năng/kỹ năng, kháng, damage hoặc multiplier. Trước khi triển khai cần có bảng ngân sách theo cấp/phái/mode, cách migrate save cũ, giới hạn số lần, reset/rollback, và chứng minh validator giữ nguyên ngân sách. Không bật đề xuất này bằng feature flag cho đến khi có review cân bằng.

## Evidence

- `test/build_progression.test.mjs`: claim retry, bounded collections, no stats/resources, malformed/future save, mode/flag/sandbox guards.
- `test/expedition_knowledge.test.mjs`: checkpoint/cosmetic bounds, failure/abort behavior, no stat/material payout, mode/flag/future namespace guards.
- `worker/test/season.test.js`: server-derived CTC title, one-time receipt, closed-season, ranking/mode isolation.
- `test/save_schema.test.mjs`: migration giữ nguyên rebirth/save legacy và ngân sách; validator regression nằm trong `worker/test/validate.test.js`.

R03 được nghiệm thu bằng cách hợp nhất các tiến trình đã có và chốt hợp đồng chuyển sinh. Không tạo thêm một đồng tiền hoặc điểm thưởng meta mới.
