# Runbook — Token rotation + device tokens (W1-5)

Ngày: 2026-10-16 · Phạm vi: `worker/src/account.js`, `worker/src/db.js`, `worker/src/index.js`, `js/online.js`, `migrations/0017_token_rotation.sql`

## Mô hình token

| Loại | Lưu ở | Hiệu lực | Ghi chú |
|---|---|---|---|
| Token chính | `accounts.token_hash` | Vô thời hạn (tới khi xoay) | Credential "master" của tài khoản |
| Token cũ vừa xoay | `accounts.prev_token_hash` | **24h** (`prev_token_expires_at`) | Grace period — xem dưới |
| Token thiết bị | `account_devices.token_hash` | Tới khi bị revoke | Mỗi thiết bị một token, revoke độc lập |

`auth()` thử theo thứ tự: chính → cũ-trong-grace → thiết bị (chưa revoke). Không cái nào khớp → 401.

## Endpoints

- `POST /api/token/rotate` `{}` — xoay token **chính**. Trả `{token, rotated:"primary", grace_until, grace_hours:24}`.
  Token cũ **vẫn dùng được 24h nữa** rồi mới 401.
- `POST /api/token/rotate` `{device_label:"Điện thoại"}` — cấp token **riêng** cho thiết bị mới (chỉ token chính/grace được gọi).
  Trả `{token, device_id, device_label, rotated:"device"}`.
- `POST /api/token/rotate` `{}` bằng **token thiết bị** — tự xoay token của chính thiết bị đó (token cũ của thiết bị chết ngay).
- `GET /api/devices` — liệt kê thiết bị (`id, device_label, created_at, last_used_at, revoked_at`, cờ `current`); **không bao giờ lộ token/hash**.
- `POST /api/devices/revoke` `{device_id}` — thu hồi → token của thiết bị đó **401 ngay**. Chỉ token chính được revoke thiết bị khác; token thiết bị chỉ tự revoke chính nó.

Rate limit: xoay 10/giờ, revoke 20/giờ (mỗi tài khoản).

## Grace period — vì sao 24h và cách không tự khóa user

Xoay token chính là thao tác nguy hiểm nhất: nếu token cũ chết ngay lập tức mà client chưa kịp lưu token mới (crash, mất mạng giữa chừng, tab khác đang mở), user mất quyền truy cập và **không có đường mật khẩu để lấy lại** (game dùng token thuần, không có email/password).

Cơ chế an toàn:
1. `rotate` trả token mới → **client phải lưu ngay** (`onlRotateToken()` trong `js/online.js` đã làm việc này: gọi API rồi `onlSet` token mới).
2. Nếu bước 1 thất bại (client crash trước khi lưu), token cũ vẫn sống 24h → user mở lại game, gọi rotate lần nữa.
3. Các tab/thiết bị khác đang dùng token cũ: tiếp tục chơi bình thường trong 24h, sau đó 401 → đăng nhập lại bằng token mới (hoặc được cấp device token riêng).

**Quy tắc cho client:** không bao giờ xóa token cũ khỏi storage trước khi đã lưu token mới thành công.

## Luồng client (đã có sẵn hàm)

```js
await onlRotateToken();            // xoay token chính + tự lưu token mới
await onlDevices();                // xem thiết bị
await onlRevokeDevice(device_id);  // thu hồi thiết bị lạ
```

Cấp token cho thiết bị mới (chưa có UI — làm ở Wave sau): gọi `POST /api/token/rotate` với `{device_label}` bằng token chính, rồi chuyển `token` trả về sang thiết bị mới (copy tay/QR). Thiết bị mới dùng token đó như token chính cho mọi API, trừ: không cấp thêm thiết bị, không xoay token chính, không revoke thiết bị khác.

## Xử lý khi user bị kẹt (support)

1. **User báo "bị đăng xuất sau khi xoay token"**: token cũ đã hết 24h grace. Hỏi họ còn tab nào đang mở bằng token mới không (trong 24h đầu tab cũ vẫn vào được). Nếu không còn — kiểm tra `account_devices`: nếu user từng cấp device token và còn giữ, dùng nó để gọi `rotate` lấy token chính mới.
2. **Mất hết token**: không có đường tự phục hồi qua API (đúng thiết kế — token là credential duy nhất). Support xác minh chủ tài khoản qua kênh ngoài (theo quy trình CS), rồi **xoay thủ công**: `UPDATE accounts SET token_hash=<hash token mới>, prev_token_hash=NULL, prev_token_expires_at=NULL WHERE id=<account_id>` và trao token mới cho user qua kênh an toàn.
3. **Thiết bị lạ**: hướng dẫn user `GET /api/devices` → `POST /api/devices/revoke`. Sau đó **xoay token chính** để chắc chắn (kẻ lạ có thể đã copy token chính).

## Triển khai / rollback

- Schema chạy qua `ensureSchema` (idempotent): bảng `account_devices` + 2 cột `accounts`. Không cần `d1 migrations apply` riêng; file `migrations/0017_token_rotation.sql` là bản tham chiếu.
- Tài khoản cũ: token hiện tại tiếp tục là token chính, không cần làm gì thêm.
- Rollback: revert commit — các cột/bảng mới bị bỏ qua, `auth()` cũ chỉ đọc `token_hash`. Token đã xoay: token mới nằm ở `token_hash` (đọc được sau revert); token cũ trong `prev_token_hash` sẽ **không** còn hiệu lực sau revert (chấp nhận được — user dùng token mới).
