# C05 — Quyết định transport và giới hạn vận hành

Chọn MVP **HTTP polling1giây + D1 CAS**: engine server250ms/tick, catchup tối đa8tick/request, trận tối đa480tick/120giây, TTL300giây. UI ghi rõ cập nhật định kỳ; không quảng cáo realtime.

| Lựa chọn | State và concurrency | Vận hành | Giới hạn |
|---|---|---|---|
| HTTP + D1 (MVP) | JSON state/revision CAS, action sequence và batch atomic; resume sau Worker restart | Dùng binding D1 hiện có; đo request/SQL/rows/bytes local | Trễ1giây, nhiều SQL, chỉ advance khi có request; không có tick background |
| Durable Objects (khi cần tải/latency cao hơn) | Một owner/phòng có thể tuần tự hóa input/timer; vẫn cần durable storage/replay | Cần binding/class migration, sockets/alarms/hibernation và smoke staging | Chưa provision hoặc benchmark DO; không coi ADR này là bằng chứng DO chạy được |

Spike đã chạy: shared seeded engine và prototype polling/D1 kiểm tra concurrent advance, rollback, forged input, disconnect/crash/reconnect, receipt. Demo hai browser context cô lập dùng API thật và D1 local. Chọn D1 để nghiệm thu MVP trong hạ tầng hiện có; không bịa số benchmark DO.

Tải giới hạn:2–4client ×1GET/s, read cap180/min/account, write cap60/min và khoảng cách command500ms. Tick/seq window,64events state/32DTO và roster snapshot bất biến. Reconnect không auto attack ngược vào thời gian đã offline; thiếu client thì catchup từng đợt hoặc abort khi TTL. Create dùng ID opaque gắn creator để retry cả sau completion; command giữ nguyên payload/seq khi mất ack. Server không nhận kết quả thắng hay số thưởng từ client.

Đo chi phí: scripts/session-load.mjs báo request, SQL statement, D1 rows đọc/ghi nếu có, response bytes và latency p50/p95 local cho120giây/2và4client. Với Nsession/ngày, nhân các đơn vị vớiN rồi áp tarif Workers/D1 của tài khoản và CPU edge đo trên staging. Timing local không phải RTT WAN hoặc CPU billable; không tự đưa số tiền khi chưa có biểu phí/ngân sách. Stress dùng boss HP lớn và nhân vật không chết để đo đủ120giây active, không thay config gameplay thật; chưa gồm create/commands/claims.

Rollback: party_combat=false đóng UI/API; request server tiếp theo abort phiên và mở khóa toàn roster, giữ state/actions/receipts. Không cấp đồ/vàng offline; công trạng server≤1/session, chung cap3/dayUTC và ví30. Triển khai remote/public thuộc O04; phải đo traffic thật và smoke rollout/rollback staging riêng trước public.
