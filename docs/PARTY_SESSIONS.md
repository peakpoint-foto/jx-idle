# C05 — Phiên trận do server quản lý

CTC2–4người, party_lobby + party_combat mặc định tắt. Snapshot verified/fresh/CTC/non-sandbox chốt trước phiên; actor stats lấy calc server, dùng shared party-combat-v1 trên jx-combat-v2. Client chỉ hiển thị state và gửi command, không tự tính thắng/thưởng. Engine chỉ main/basic, native DOT/khống chế/mitigation và utility phiên (guard1s, support10%HP/5MP/6s); không hứa đồng bộ di chuyển/pet/full native rotation.

HTTP polling1s, engine250ms/tick, catchup≤8tick/request,120s combat/300sTTL. ADR [SESSION_TRANSPORT_ADR.md](SESSION_TRANSPORT_ADR.md) so sánh D1/DO và ghi quyết định/giới hạn. GET cap180/min/account, POST60/min, command gap500ms; payload allowlist, tick±4, seq/target/membership checks. CAS state+applied action batch tránh double advance; roster/member active unique indexes. Create ID opaque gắn creator replay cả sau completion; không dùng ID để chứng minh quyền sở hữu.

UI ở tab Khác: tạo/tìm phiên, HP/MP/đóng góp, guard/support, rời, retry/reconnect và nhận công trạng. Pointer ngoài save, gắn cid/slot; không chứa token hoặc item. Pending command giữ payload cũ khi mất ack; server rejection cho refresh. Identity/revision/generation guard ngăn response account cũ hoặc poll cũ ghi đè phiên vừa tạo. World combat tạm dừng khi phiên active; bỏ build khi active qua R.onlineSession. Mở lại trang đọc session từ server/pointer, không nhận đồ offline.

Hoàn thành với contribution thực, không withdrawn: receipt≤1merit, cap chung E04 earned3/dayUTC, wallet30, claim window24h; concurrent/retry trả cùng receipt. Không reward client gold/damage/win. Leader rời không hủy người còn chơi; all leave/expiry/flag off abort và release toàn roster; state/actions/receipt vẫn giữ. No late join sau snapshot.

Nghiệm thu local:250/250 test tổng trước G02,38/38 D1 (gồm6session cases), browser regression6mode/viewport. Shared session parity20tổ hợp (10phái ×2/4actor), DOT ownership/useful clips, frozen inputs và rollback. Migration0001–0007 lặp2lần từ schema cũ trên SQLite và D1, giữ snapshot/account. CI chạy thêm session-browser-smoke dùng HTTP/API thật, D1 local và hai context trình duyệt riêng (360/1280): cùng tick/actors/boss, command đã commit nhưng mất ack/retry1row, reload reconnect, boss thật hoàn thành và2receipt mỗi người1merit khi claim lặp. Không dùng forced defeat cho demo.

Đo scripts/session-load.mjs trên Miniflare D1 local,120s active (fixture boss lớn/block100 để tránh thắng/chết sớm), poll1s. Dùng all thay first cùng SQL để giữ metadata đầy đủ; không phải sản xuất. Kết quả08/10/2026:

| Người | Request | SQL | Rows đọc / ghi | Response bytes | p50 / p95 ms | Tick cuối |
|---|---:|---:|---:|---:|---:|---:|
|2|240|2642|4569 /723|1626482|80.33 /131.09|480|
|4|480|4804|11547 /1215|3602436|61.73 /111.99|480|

1000phiên4người/ngày riêng polling≈480000requests,4.804triệu SQL,11.547triệu rows đọc,1.215triệu rows ghi,3.60GB response. Chưa gồm create/actions/claim, RTT internet, edge CPU hoặc phí tài khoản. Prototype đủ MVP thử tải thấp; DO cần spike tiếp nếu ngân sách/load không phù hợp. Không coi dữ liệu local là benchmark production.

Rollback party_combat=false: UI giữ pointer; API request tiếp abort và unlock toàn roster, không xóa receipts. DB0007 additive; không rollback bằng DROP. C05 DONE local, O04 staging/public gate vẫn còn; chưa deploy/mở public.
