# Chính sách dữ liệu — Telemetry ẩn danh (mục 0.4)

**Trạng thái: đề xuất cùng DEPTH_ROADMAP rev 4. Mặc định BẬT cần duyệt; nếu yêu cầu pháp lý chặt hơn thì chuyển sang opt-in.**

## Thu thập gì (tối thiểu)

1. **Ngày hoạt động** — tính theo tuần (cohort), kèm số ngày đã hoạt động dạng bucket.
2. **Tính năng được mở/dùng** — tên tính năng trong danh mục cho phép.
3. **Thời gian treo máy** — theo khoảng (`<5m`, `5-15m`, `15-60m`, `60m+`).

Chi tiết từng sự kiện (tên → giá trị):

| Sự kiện | Giá trị gửi lên |
|---|---|
| `active_day` | `{weekend: 0/1}` |
| `session_length` | bucket khoảng thời gian |
| `feature_used` | tên tính năng (danh mục) |
| `report_detail_opened` | — |
| `advisor_suggestion_applied` | `gear` / `skill` / `attrs` |
| `trial_started` | id rule trial |
| `gold_sink_spent` | `{sink, amount}` (amount dạng bucket) |
| `gold_total` | bucket lượng vàng |
| `story_read` | mã phái |

Tiêu chí thành công nào không có sự kiện đo tương ứng thì **chưa được duyệt** (xem DEPTH_ROADMAP 0.4).

## KHÔNG thu thập

- Tên, email, số liên hệ, nội dung save, nội dung chat/góp ý (góp ý là kênh riêng, tự nguyện).
- **Không định danh bền:** không có ID thiết bị/người dùng lưu ở server. Client tự tính
  `install_week` (tuần cài đặt) và `active_days` (số ngày đã mở game, dạng bucket
  `1 / 2-6 / 7-13 / 14-29 / 30+`) rồi chỉ gửi hai con số này kèm mỗi sự kiện.
  Retention D7/D30 được tính từ cohort mà không cần nối hành vi của một người.

## Lưu trữ và xóa

- Server (Cloudflare D1, bảng `telemetry_events`): giữ tối đa **90 ngày**, tự xóa khi ghi mới.
- Client: hàng đợi sự kiện chưa gửi tối đa 200, lưu trong localStorage của chính trình duyệt.
- Không bán, không chia sẻ dữ liệu cho bên thứ ba.

## Đồng ý và tắt

- Mặc định **BẬT** (đề xuất — cần duyệt).
- Lần đầu mở game sau bản cập nhật có thông báo một lần, nêu rõ 3 loại dữ liệu trên
  và nút **"Tắt thu thập"** ngay trong thông báo.
- Tắt/mở bất cứ lúc nào ở **tab Khác → Quyền riêng tư**. Tắt thì client ngừng ghi
  và ngừng gửi ngay; dữ liệu đã gửi trước đó vẫn theo chu kỳ xóa 90 ngày.

## Góp ý (kênh riêng)

Form góp ý có thêm trường **"Tính năng"** để gắn nhãn (cố vấn build, trial, codex…),
giúp đối chiếu phản hồi định tính với số liệu telemetry. Gửi góp ý là tự nguyện,
nội dung được ẩn email/số liên hệ/mã nhạy cảm trước khi lưu, giữ tối đa 90 ngày.
