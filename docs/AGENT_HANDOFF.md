# Hướng dẫn thực thi cho agent

Đọc [backlog](AGENT_BACKLOG.md) và [TODO](AGENT_TODO.md) trước khi nhận task. Đây là kế hoạch, không phải lệnh làm mọi tính năng ngay hoặc tự deploy.

**Người dùng đã giao lệnh mới tiếp tục từ27task đến toàn backlog ngày08/10/2026 (Asia/Saigon).** Trạng thái ACTIVE; C05 đang triển khai, O04 thiếu release gates remote. [SESSION_CHECKPOINT.md](SESSION_CHECKPOINT.md) giữ lịch sử checkpoint và PR. Thực hiện theo phụ thuộc; không tự deploy production.

## Bối cảnh cần giữ

Baseline tài liệu: `68124fe`, branch `feat/online-multiplayer`; checkpoint hiện tại `9e54e66`, PR https://github.com/peakpoint-foto/jx-idle/pull/19. Agent kiểm tra trạng thái mới thay vì reset về baseline.
Game dùng script cổ điển và state global; nhiều file bị minify thành một dòng. Không format/rewrite toàn bộ file để sửa một hàm. Tách module chỉ khi cần, giữ thứ tự load.
Nguồn luật mode: `js/modes.js`; gameplay: `js/stats.js`, `js/combat.js`; UI: `js/ui.js`, `js/jxorig.js`, `js/uihub.js`; save: `js/save.js`; online: `worker/src/`, `js/online.js`.
Fixture hiện có: `test/helpers/game.mjs`. Worker build có danh sách script riêng trong `worker/build-game.mjs`; thêm helper gameplay phải kiểm tra cả browser và Worker.
F01–F07, B01–B05/G01/G03/E01/E02/E04/R01/O02/C01–C04/P01/P02/P03/P04 đã có implementation trong worktree và evidence local (27/43). O04 CI local đang triển khai; C05/G02/O03/O01 đủ phụ thuộc. Không reset, bỏ các file untracked hoặc commit generated bundle. npm run test:d1 dùng Miniflare local, không cần token Cloudflare; npm test cần Node có node:sqlite (đã kiểm tra Node 24.19.0). Combat model hiện v2, DOT cuối được clamp và không đánh sau khi bị DOT hạ.
Tài liệu ban đầu nói 18 dòng skill thiếu; audit lại đúng là 15/106, cùng 76 đích học được và 15 ID ngoài danh sách học. Không sửa các ID ngoài danh sách học trước kiểm tra child.

## Quy trình một task

1. Read-only: git status, HEAD, instructions, file liên quan, phụ thuộc và capability mode.
2. Nhận task vào TODO với worktree/branch và file dự kiến. Ghi kế hoạch nhỏ: hành vi mới, schema/migration, edge cases.
3. Dùng patch nhỏ. Bảo toàn thay đổi người khác, không commit secret hoặc generated bundle.
4. Xác minh logic đúng với cả ba mode; feature chỉ mở trong mode task cho phép.
5. Test phù hợp: công thức/save/API cần hồi quy; UI cần kiểm tra thật trên mobile/desktop. Nếu không có browser, ghi chưa kiểm tra UI, không giả định pass.
6. Chạy `npm test` khi chạm gameplay/save/Worker. API/schema cần local D1 integration cho concurrency/retry; không dùng DB production để smoke.
7. Cập nhật docs, TODO/evidence. Bàn giao scope đã xong và blocker còn lại. Commit/push/PR khi phiên giao việc yêu cầu; PR đã tạo phải attach vào task.

## Ranh giới nhiều agent

- Nhóm nền sở hữu F01–F07; đây là nhóm chặn các nhóm content.
- Sau nền, nhóm build sở hữu B*, G01/G03; nhóm CTC C*; nhóm PHLT P*; nhóm g2 G02/G04/G05.
- Economy E*, retention R*, operations O* là task riêng; phối hợp qua API/schema contracts.
- `js/stats.js`, `js/save.js`, `js/modes.js`, `worker/src/db.js`, `index.html` thường bị nhiều nhóm cùng chạm: chỉ một owner ghi tại một thời điểm, hoặc worktree riêng với người tích hợp.
- Chốt interface/state schema trước khi giao song song. Không dùng cùng worktree để nhiều agent sửa một file.
- Nhóm content được chuẩn bị fixture/design độc lập khi foundation chưa xong, nhưng không bật feature hoặc sửa nền thay nhóm owner.

## Prompt giao việc có thể sao chép

> Thực hiện task <ID> trong docs/AGENT_BACKLOG.md. Đọc docs/AGENT_TODO.md và docs/AGENT_HANDOFF.md, kiểm tra luật ba mode và hướng dẫn repo. Nhận task, thực hiện đúng phạm vi/phụ thuộc, kiểm chứng các trường hợp nghiệm thu, rồi cập nhật TODO và evidence. Giữ nguyên luật rarity/quota/chuyển mode nếu task không yêu cầu đổi. Không đoán mapping skill thiếu, không mở online mode khác bằng cách bỏ guard và không dùng production DB để test. Nếu thiếu nguồn/hạ tầng cần thiết, hoàn tất phần độc lập và ghi blocker cụ thể. Chỉ commit/push/tạo PR/deploy nếu yêu cầu giao việc có nêu.

## Mẫu kết thúc bàn giao

- Hoàn thành: <task IDs và hành vi>.
- Kiểm chứng: <command, mode, test, UI/API>.
- Chưa kiểm chứng hoặc bị chặn: <cụ thể>.
- Migration/flags: <mặc định, cách bật/tắt, tác động save>.
- File/commit/PR: <thực tế>.
- Agent kế tiếp nhận: <ID đủ điều kiện>.

## Prompt thực thi toàn bộ theo phụ thuộc

> Chỉ tiếp tục khi người dùng giao lệnh mới. Đọc docs/SESSION_CHECKPOINT.md, docs/AGENT_TODO.md, docs/AGENT_BACKLOG.md và docs/EXECUTION_EVIDENCE.md; kiểm tra worktree và nghiệm thu nền. Ưu tiên hoàn tất C05 hoặc nhận task độc lập G02/O03/O01 theo phụ thuộc. Cập nhật ownership, tests và evidence sau mỗi task. Chỉ đóng checkbox khi đủ implementation và nghiệm thu; không coi stub/default-off hoặc tài liệu thiết kế là tính năng đã xong. Không đánh dấu mục tiêu 100% khi task còn trống; commit/push/PR/deploy theo ủy quyền của phiên giao việc.

## Kiểm tra trước mở online công khai

C05 server session/result/receipt đạt; F06 concurrency và O03 moderation đạt; O04 có staging rollout/rollback đã kiểm chứng; có quyền vận hành hạ tầng cần dùng.
E05 giao dịch còn cần server item ownership và E04 ledger. Không coi token hay chữ ký save cục bộ là chứng minh item không bị chỉnh.

