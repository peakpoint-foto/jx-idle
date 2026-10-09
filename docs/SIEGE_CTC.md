# C07 — Công thành và Tống Kim theo mục tiêu (ADR / spike, chưa implement)

Trạng thái: spike hoàn tất bằng tài liệu. Chưa có server activity, engine hay UI đa người cho công thành; không bật flag nào.

## 1. Hiện trạng (đã đối chiếu code)

- `js/siege.js` là công thành **một người chơi, phía client**: 4 lớp (thủ vệ ×4, đội trưởng ×2, chủ tướng ×1), 4 thành (`tran`→`kinh`), mở từ cấp 40.
- Quota: `siegeStart` chặn người không phải g2 khi `st.used>=1` trong tuần. Trạng thái nằm trong `RW().siege`, không phải server.
- Phần thưởng do client quyết định: `RW().sgTok` (Lệnh công thành), điểm `score`, shop `SIEGE_SHOP`, và khi hạ Kinh thành ở CTC gọi `forceSetItem()` để cấp một món trang bị phía client.
- `worker/src/activity.js` đã có `siege: 1` trong `LIMITS` (quota ledger do server giữ theo kỳ tuần UTC) và `CLAIM_CAPS.siege = {contribution: 1_000_000, cleared: 3}`. Đây là điểm nối an toàn cho quota và cap claim.
- `worker/src/lobby.js` đã nhận `objective = 'siege'` trong danh sách mục tiêu phòng.
- Engine phiên C05 (`js/session_combat.js`, `worker/src/sessions.js`) chỉ có **một mục tiêu `boss`**. Lệnh hợp lệ là `attack | guard | support` với `target` là actor hoặc `boss`. Chưa có điểm chiếm, cổng hay đơn vị tiếp tế.

## 2. Khoảng cách với yêu cầu backlog

| Yêu cầu (AGENT_BACKLOG C07) | Hiện trạng | Khoảng cách |
|---|---|---|
| Chiếm điểm / phá cổng / tiếp tế | Chỉ có lớp NPC và chủ tướng | Cần mục tiêu kiểu mới trong engine phiên |
| Lệnh nhanh, contribution theo vai trò | Contribution có `damage/heal/control/prevented` | Thêm contribution `capture` và `logistics` |
| Giữ quota hiện tại | Client giữ `used`; server có `siege: 1` | Quota phải chuyển hẳn sang ledger server trước khi mở multiplayer |
| Server quyết định score/reward | Điểm, token, và item CTC đều tính ở client | **Mâu thuẫn**: phải chuyển toàn bộ sang server |
| Không tiêu lượt hai lần | Chưa có khóa phiên đa người | Dùng `activity` claim key theo phiên + UTC week |
| Thắng không chỉ dựa damage | Thắng hiện là hạ boss | Thêm điều kiện thắng theo điểm chiếm hoặc cổng vỡ |

**Mâu thuẫn cần chốt trước khi implement:** `forceSetItem()` cấp trang bị ở client khi hạ Kinh thành. C06 đã chốt không cấp vật phẩm vì chưa có inventory server. Bản đa người của C07 không được dùng đường thưởng này. Đề xuất: phần thưởng multiplayer chỉ là công trạng/điểm do server cấp (cap E04), giống C05/C06. Đường thưởng đơn người hiện tại giữ nguyên, có đánh dấu rõ là không đồng bộ.

## 3. Đề xuất thiết kế

**Dùng lại engine phiên C05, mở rộng mục tiêu** (không viết engine thứ hai):
- Thêm kiểu mục tiêu `point` (điểm chiếm) và `gate` (cổng) vào `state.objectives`, với id ổn định và HP/tiến độ do server tính.
- Lệnh mới `capture` và `supply`, thêm vào allowlist payload. Các lệnh hiện có giữ nguyên.
- Tiếp tế là hành động của actor có `support` lên đồng đội đang ở điểm của mình; tiến độ điểm do server tính theo số actor hợp lệ trong tick.
- Điều kiện thắng: chiếm đủ điểm **hoặc** phá cổng cuối trong giới hạn lượt, đồng thời contribution logistics/phòng thủ ≥ ngưỡng. Thắng không chỉ dựa damage.

**Thuộc tính vai trò:** không khóa vai trò hay môn phái. Tiếp tế và phòng thủ có contribution riêng nên người không gây damage vẫn có đóng góp.

**Flag và quota:**
- Flag mới `party_siege` (mặc định false, chỉ CTC), đăng ký trong `js/capabilities.js` và `worker/src/capabilities.js`.
- Quota: mỗi tài khoản một lần mỗi tuần UTC qua `activity` ledger (`siege`), dùng khóa idempotent theo phiên.
- Khi flag tắt: phiên đang chạy bị abort và nhả toàn bộ roster, giống C06; không xóa lịch sử hay receipt.

**Reward:** công trạng server qua receipt một lần cho mỗi người, cap chung E04 (3/ngày UTC, ví 30). Không cấp item, không cấp Lệnh công thành đa người trong bước này.

## 4. Quyết định (đã chọn theo logic game, chờ xác nhận trước khi implement)

1. **Dùng lại engine C05**, mở rộng thêm mục tiêu điểm/cổng. Không viết engine thứ hai, vì hai engine sẽ lệch parity.
2. **Đa người chỉ thưởng công trạng** qua receipt và cap E04. Không cấp trang bị. Lý do: chưa có inventory server, và C06 đã chốt cùng nguyên tắc này.
3. **Quota CTC giữ 1 lần/tuần** qua `activity.js` (`siege: 1`). Không tăng để tránh farm công trạng.
4. **Chế độ đơn giữ nguyên** (`siegeStart`, `forceSetItem`, Lệnh công thành phía client). Đường đa người không dùng đường này. Chuyển đơn sang server là việc riêng, không gộp vào C07.
5. **Số liệu khởi điểm**: cổng có HP lấy từ `SIEGE_TKILL` (8 giây) nhân với `kHp` của thành; điểm chiếm cần giữ tối thiểu 2 tick; mỗi phiên tối đa 3 lớp để khớp với 3 lớp của công thành đơn. Số liệu này cần playtest, không phải kết quả đo.

Trạng thái: chưa bắt đầu implement. Chưa có thay đổi `session_combat.js`, `sessions.js`, `activity.js` hay flag `party_siege`.

## 5. Kế hoạch kiểm chứng (từ backlog)

- Capture race: hai actor cùng chiếm một điểm trong một tick; kết quả do server chọn theo thứ tự tick và seq, không phụ thuộc thứ tự request.
- Abort, reconnect và catchup tick như C05.
- Quota đồng thời: hai phiên cùng tuần, một tài khoản; chỉ một lần được ghi.
- Reward và shop tuần: receipt retry trả cùng kết quả; không cộng hai lần.
- Flag rollback: phiên đang chạy được abort, roster nhả, không xóa receipt.
- Parity: `js/session_combat.js` và `worker/` dùng cùng engine, kiểm tra như C05 (10 phái × 2/4 actor).

## 6. Rủi ro

- Engine C05 chưa có kiểu mục tiêu nào ngoài boss; thay đổi state ảnh hưởng toàn bộ phiên CTC hiện có. Cần regression cho C05/C06 trước.
- Chiều dài phiên và số request: đo lại theo mẫu `scripts/session-load.mjs` trước khi bật.
- Thưởng phía client đang tồn tại song song với thưởng server; cần tài liệu rõ đường nào áp dụng cho mode nào để không cộng dồn.

## 7. Bước tiếp theo đề xuất

1. Người dùng chốt mục 4.
2. Mở rộng `session_combat.js` với mục tiêu point/gate và test parity 10 phái.
3. Thêm `activity` siege claim theo phiên, flag `party_siege`, test quota/rollback.
4. UI đa người tối thiểu ở tab Khác, kiểm tra 360/1280 và chạm ≥44px.
