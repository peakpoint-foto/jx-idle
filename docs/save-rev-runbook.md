# Runbook — save `rev` đơn điệu + `save_id` + bind `cid` (W1-4)

Ngày: 2026-10-16 · Phạm vi: `js/save.js`, `js/ui.js` (`importFlow`), `js/online.js`, `js/save_schema.js`, `js/workflow_overrides.js`

## Cơ chế

- Mỗi bản lưu có `save_id` (uuid, cấp khi tạo/migrate) và `rev` (số nguyên, tăng đơn điệu).
- `save()` tăng `rev` lên 1 ở **mọi lần ghi thành công**. `rev` không bao giờ giảm trong cùng một dòng save.
- `exportSave()` gọi `save()` trước nên mã/file xuất ra luôn mang `rev` mới nhất.

## Migration save cũ (không có rev/save_id)

- Lần `migrate()`/`load()` đầu tiên sau update: save cũ được cấp `save_id` mới + `rev=0`, lần `save()` tiếp theo đưa `rev` lên 1.
- Không mất dữ liệu: chỉ thêm 2 trường, mọi trường cũ giữ nguyên. Backup `_pre_v<SAVE_V>` của `save_schema.js` vẫn được tạo như cũ.
- Save cũ (rev=0) nhập đè lên save mới (rev>0) cùng dòng → **bị chặn** (đúng mục đích chống rollback).

## Chống rollback-dupe

| Đường nhập | Hành vi khi bản nhập `rev` cũ hơn |
|---|---|
| `importSave(txt)` (API/mã) | **Chặn** — throw `"Mã lưu cũ (rev …) … sẽ MẤT tiến trình mới"`. Truyền `{force:true}` để bỏ qua khi có chủ ý. |
| `writeSlot(i, state)` (file qua `importFlow`, v.v.) | **Chặn** — throw tương tự. Chỉ áp dụng khi cùng dòng `save_id` (hoặc không rõ dòng — save cũ). Khác `save_id` = đổi nhân vật → cho phép. |
| UI "Nạp file lưu" (`importFlow`) | Dòng slot hiện cảnh báo `⚠ bản cũ (rev X < Y) — nạp sẽ MẤT tiến trình mới`; bấm "Ghi đè" sẽ hỏi `confirm()` lần nữa, đồng ý → ghi với `{force:true}`. |

- Khôi phục bản máy chủ (`onlApplyServerSnapshot`) đã có `confirm()` riêng → đi đường `{force:true}`, không bị ảnh hưởng.
- Backup `_bak` khi `load()` gặp bản chính hỏng: là đường **phục hồi**, không qua check rev (chủ ý).

## Bind `cid`

- `importSave`: nếu slot đang liên kết online (`onlGet()` có token) **và** `S.cid` đã có, mã nhập vào có `cid` khác → **chặn**, message hướng dẫn gỡ liên kết online trước.
- Đổi nhân vật khi đang link: gỡ liên kết online của slot → nhập mã mới (lúc này `cid` mới được chấp nhận).
- `writeSlot` (file): giữ hành vi cũ — sau khi ghi, nếu `cid` đổi thì tự `unlinkSlotOnline` (trong `workflow_overrides.js`).

## Xử lý khi user bị kẹt

1. User báo "nhập mã cũ bị chặn": hỏi họ có chắc muốn mất tiến trình mới không.
   - Nếu **có**: hướng dẫn dùng UI "Nạp file lưu" → chọn slot → bấm "Ghi đè" → xác nhận ở hộp thoại thứ hai.
   - Nếu **không**: họ đang nhập nhầm bản cũ — lấy lại mã mới bằng "Xuất mã".
2. User muốn đổi nhân vật trên slot đang link: gỡ liên kết online trước (menu online), rồi nhập mã mới.
3. Trường hợp khẩn (support): `localStorage` key `jxidle`/`jxidle_N` + `…_bak` luôn giữ bản trước — có thể khôi phục thủ công bằng DevTools.

## Rollback kế hoạch (nếu W1-4 gây sự cố)

Revert commit `wave1: W1-4 …` là đủ — `rev`/`save_id` là trường thừa, code cũ bỏ qua. Save đã có 2 trường này vẫn đọc bình thường sau revert.
