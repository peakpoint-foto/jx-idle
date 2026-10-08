# Checkpoint — trạng thái mới và lịch sử C05

Ngày 08/10/2026: C05/G02/G05 DONE local, 30/43 task. Đã push `51c1905`, đồng bộ main không xung đột; PR #19 đã merge. Bản sửa reload smoke đã kiểm chứng hai client D1. Full suite 260/260, D1 38/38 và browser ba mode/mobile/desktop pass. CI remote mới: https://github.com/peakpoint-foto/jx-idle/actions/runs/37784364781 (đang chạy lúc ghi). GitHub API Forbidden, chưa tạo được PR mới. Chưa deploy production. Các đoạn bên dưới là checkpoint lịch sử.

**Lệnh mới ngày08/10/2026 (Asia/Saigon): tiếp tục triển khai từ27task đến toàn backlog. C05 IN_PROGRESS; đoạn PAUSED dưới đây là lịch sử.** CI push37764665755 và PR37764672297 đã xanh tại9e54e66 sau sửa navigation smoke. Không tự deploy production.

Ngày 08/10/2026 (Asia/Saigon). Người dùng yêu cầu **dừng triển khai, cập nhật Markdown, commit và push**. Không tiếp tục tính năng cho tới lệnh mới.

Tiến độ chung: **27/43 task nghiệm thu local; 16 task còn mở**. C05 và O04 chỉ có phần triển khai, không tính DONE. Các feature nâng cao mặc định tắt; chưa deploy hoặc mở public online.

Đã lưu phần C05:

- `js/session_combat.js`: engine `party-combat-v1`, dùng công thức/combat events `jx-combat-v2`, tick250ms, RNG seed trong state; main/basic, DOT phân contribution theo nguồn, khống chế native, guard/support của luật phiên, cooldown/mana và64events.
- `worker/src/sessions.js`: CTC-only, roster2–4 người ready, snapshot/revision server; D1 CAS state/actions, sequence/payload/retry guards; heartbeat/reconnect, catchup≤8tick/request, expiry/leave/flag rollback; reward công trạng server có receipt và cap E04.
- `migrations/0007_combat_sessions.sql` và schema: session/member/action/reward, khóa một phiên active theo room/account; route `/api/sessions` có trong Worker.
- `worker/test/sessions.test.js`: 5 case backend; hai API client cùng state, forged action/result, late/duplicate command, frozen state, completion/reward retry, disconnect/leave/rollback, mode/model/ready guard.

Phần còn thiếu để đóng C05:

1. Spike/ADR so sánh polling+D1 với Durable Objects; chốt transport và giới hạn vận hành.
2. Client UI/polling/input/reconnect và demo **hai trình duyệt thật** cùng trạng thái; các test API hiện tại không thay demo này.
3. Engine parity browser/Worker, nhiều phái, DOT attribution/guard/support và các tổ hợp edge case; review validation payload/state/membership races.
4. Tích hợp C05 vào CI/D1 suite chuẩn, kiểm tra migration0007 lặp và rollback; chưa coi chỉ backend tests là đủ.
5. Đo request/query/CPU/latency/cost local và workload, rồi staging được cấp quyền; chưa benchmark production.

Phần C05 đang dở được commit cùng checkpoint để không mất công việc. Không bật `party_combat` để public từ checkpoint này. PHLT/g2 vẫn giữ account guard, không nhận thưởng CTC; multiplayer mới chưa nghiệm thu. Tiếp tục từ task C05 hoặc một task độc lập khi có lệnh mới.

Các task còn mở: C05,C06,C07,C08,P05,P06,G02,G04,G05,E03,E05,R02,R03,O01,O03,O04. O04 thiếu host CI/staging rollout/rollback; nguồn15skill target thiếu vẫn unsupported theo F02, không remap suy đoán.

Kiểm chứng cuối trước commit:

- `npm run check:contracts`: 88 script, 43 task, 27 DONE; kiểm tra thành công.
- `npm test`: 227/227 pass, không skip/todo.
- `npm run test:d1`: 32/32 pass.
- `JX_D1_RUNTIME=1 node --test worker/test/sessions.test.js`: 5/5 pass riêng trên D1 runtime local. C05 chưa nằm trong lệnh D1 chuẩn.
- `git diff --check`: pass. Browser nghiệm thu gần nhất thuộc E04; C05 chưa có UI hoặc demo hai trình duyệt.

Nhánh bàn giao: `feat/online-multiplayer`. SHA checkpoint và trạng thái push được xác minh qua Git và báo trong phản hồi bàn giao; không triển khai production.

## Xử lý PR #19 ngày 08/10/2026

Theo yêu cầu sửa lỗi merge PR, kết hợp `main` tại `fa0c901` vào nhánh bàn giao. Giải quyết xung đột ở index.html, js/save.js, test/helpers/game.mjs, worker/src/account.js và worker/src/index.js; giữ SAVE_V2/migration, sandbox guard, validation CAS, feedback metrics cùng các sửa activity/loot/stage/potion và API activity từ main.

Đặt potion_policy trước các wrapper combat policy/report/expedition, thêm kiểm tra thứ tự nạp; bỏ mock ghi đè const jrAdd trong test Kinh thành để chạy journal thật. Kiểm chứng sau merge: contracts 93 script/43 task/27 DONE, 244/244 test tổng, 32/32 D1, audit thường pass (15 target vẫn unsupported), browser smoke hồ sơ sạch đủ 3 mode × 2 viewport. Lockfile và data.js không đổi.

CI cũ run37749101567 đạt các bước Node/install/contracts/test/D1/audit, thất bại ở browser smoke. GitHub API/log chi tiết hiện trả Forbidden/404; trang job công khai chỉ xác nhận bước thất bại. Bổ sung stderr artifact và annotation cho browser smoke để kiểm tra lần chạy mới. Kết quả CI remote sau push phải được xác minh riêng, không suy từ local pass. Phạm vi lần này là sửa PR; tiến độ vẫn 27/43 và C05 PAUSED, không tiếp tục backlog hay merge vào main.

CI chạy lại sau commit merge `3ea445f` (push37764377573, PR37764383758) xác nhận mọi bước nền pass, browser smoke báo `ReferenceError: closeModal is not defined` ở bước UI đầu tiên. Annotation mới giúp đọc đúng lỗi qua trang công khai. Khởi tạo CDP cũ mở game rồi reload: readiness có thể đọc document cũ trước khi navigation thay context. Sửa smoke mở `about:blank`, bật Page domain và navigate một lần; chỉ bắt đầu khi đúng origin, document complete và các helper UI đầu/cuối đã nạp, rồi chờ fonts. Browser smoke sau sửa pass đủ sáu mode/viewport trên hồ sơ sạch; riêng C05 D1 sau merge cũng đạt 5/5. Không bỏ assertion hoặc tắt bước CI.
