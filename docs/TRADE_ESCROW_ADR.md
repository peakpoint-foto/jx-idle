# E05 — Spike giao dịch có escrow (chưa mở implementation)

## Quyết định

**Chưa mở giao dịch giữa người chơi.** Snapshot nhân vật được gửi từ client và được validate để xếp hạng; nó chưa phải sổ sở hữu vật phẩm do server quản lý. C05 chỉ trả công trạng từ receipt, E04 chỉ có ledger công trạng; không có receipt rơi đồ có chủ sở hữu. Vì vậy chưa thể chứng minh người gửi sở hữu vật phẩm hoặc ngăn họ sửa save để tạo thêm bản sao.

E05 chỉ được chuyển sang implementation sau khi có server-owned inventory và quy trình migration/backfill được duyệt. MVP đầu tiên là trao đổi trực tiếp 1:1 trong CTC. Không mở chợ công khai, thanh toán, PHLT hay 2.0 ở cùng đợt.

## Đề xuất mô hình dữ liệu

- `trade_offers`: opaque ID, proposer, recipient, mode, status (`open`, `accepted`, `cancelled`, `expired`), immutable payload hash, created/expiry/updated timestamps, version.
- `trade_items`: offer ID, item owner, immutable server item ID, canonical item JSON/hash; unique `(offer_id, owner, item_id)`.
- `trade_receipts`: unique `(offer_id, account_id, action)` cùng payload hash, kết quả và timestamp; giữ đủ lâu để retry sau khi offer kết thúc.
- Inventory authority: một row cho mỗi item UID với owner, mode, canonical item value, version/lock state. Client gửi UID đề nghị; Worker đọc item từ bảng sở hữu và không nhận thuộc tính item từ request.

Offer tạo lock nguyên tử có điều kiện trên mọi item UID; nếu thiếu một item thì rollback toàn bộ. Recipient chấp nhận bằng CAS trên `status='open'`, đúng recipient, chưa hết hạn và đúng payload hash. Trong cùng batch/transaction, server chuyển ownership hai chiều, xóa lock và ghi hai receipt. Cancel/expiry chỉ trả item về đúng owner nếu lock còn thuộc offer đó. Mọi endpoint idempotent theo request ID; cùng ID và payload khác phải trả conflict.

## Thứ tự prerequisites

1. Tạo server-owned inventory writer cho drop/reward, equip, consume, recycle, craft, transfer mode và character deletion; mọi mutation phải dùng transaction/receipt.
2. Chốt canonical item schema, UID entropy/unique index, account/mode ownership, cap inventory và hành vi khi đầy.
3. Thiết kế migration cho nhân vật cũ. Không coi snapshot client hiện tại là chứng cứ đủ để tự động mint row inventory; cần quy trình xác minh/backfill, audit và support khi sai lệch.
4. Tách CTC online character state khỏi snapshot-authoritative inventory; xử lý sync nhiều thiết bị và conflict trước khi trade.
5. Bật feature flag riêng `player_trade` mặc định false, migration additive, admin audit riêng và runbook rollback.

## Bắt buộc trước khi triển khai

- Race: accept/accept, accept/cancel, accept/expiry, hai offer cùng item; chỉ một trạng thái sở hữu hợp lệ.
- Crash giữa bước: batch atomic; retry cùng request trả đúng receipt; không mất hoặc nhân đôi item.
- Forgery: UID không thuộc sender, đổi mode/owner, sửa payload JSON, reuse request ID với payload khác, flagged/pending account.
- Boundary: inventory đầy ở một bên, item đang equip/locked, account bị khóa/xóa, recipient offline, offer hết hạn, flag rollback.
- Audit: actor, item IDs, owner trước/sau, offer và receipt; không ghi token, IP thô hoặc save đầy đủ.
- Rollback chỉ tắt flag và cho offer mở được cancel/expire/settle an toàn; không drop bảng hoặc xóa receipts.

## Ước lượng và rủi ro

Đây là thay đổi nền tảng nhiều module, không phải một endpoint đơn. Khối lượng chính là chuyển mọi nguồn/sink inventory sang sổ server-owned và xử lý migration legacy; escrow chỉ là lớp cuối. Rủi ro cao nhất là legacy dupes/backfill sai, item lost/duplicated do mutation ngoài ledger và conflict giữa thiết bị. Dữ liệu D1 hiện tại không đủ để ước lượng tải giao dịch thật; cần benchmark sau khi inventory writer tồn tại.

## Trạng thái

Spike hoàn tất bằng tài liệu. Implementation bị chặn bởi server-owned inventory, migration policy cho save cũ và nghiệm thu vận hành O03. Không có API/UI trade hoặc feature flag được bật.
