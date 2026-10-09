# O04 — CI và release/rollback

Gate local dùng Node24.19.0 + npm ci (lockfile), check:contracts → npm test → npm run test:d1 → audit:skills → Chromium smoke. Hai lệnh test regenerate cùng worker/gen/game.js nên chạy tuần tự trong một checkout. Bundle không commit. CI checkout từ GitHub sẽ chạy .github/workflows/validate.yml; workflow chưa được push/run trên GitHub nên không coi host CI đã pass.

check:contracts xác minh107script classic tồn tại/không trùng/syntax/load dependencies, shared helpers có trong Worker, provenance skill.data106/76/15/15 và43task dependency không cycle. Strict skill audit vẫn expected failure do15unsupported target; không dùng strict để tuyên bố skill data hoàn chỉnh. Release contract tạo pre-CAS account/save rồi chạy migrations0001–0013 lặp2lần, giữ nguyên account/rawsave và xác nhận các bảng session/moderation/chat; chạy trong SQLite và D1 runtime. D1 suite bao gồm session CAS/retry, moderation cap/audit và các migration.

Asset build bỏ worker/test/migrations/.github/scripts/docs và dev config khỏi public files. Không đưa khóa admin, .dev.vars, logs hoặc fixture bearer vào assets.

## Rollout yêu cầu được giao riêng

1. Chốt commit/PR cụ thể, attach PR khi có URL. Kiểm tra diff/lockfile và CI clean checkout; mọi feature advanced vẫn false.
2. Dùng Worker và D1 **staging riêng**. Không kế thừa database_id production của wrangler.jsonc. Cấu hình ASSETS, DB, FEATURE_FLAGS theo mode; thiết lập admin/IP salt/Turnstile bằng secret settings, không viết khóa vào repository hoặc chat. Preview hiện không có DB, trả503/no_db, không dùng nó để giả nghiệm thu online.
3. Backup/export D1 staging, ghi schema version và dữ liệu smoke trước migration. Chạy additive migrations theo thứ tự, không destructive migration. Bật một nhóm capability sau kiểm tra dependency tương ứng; giữ account parseSave CTC-only tới P05/G04.
4. Smoke bằng tài khoản staging dành cho test: create/sync/CAS/duel accept concurrent/guild role/boss receipt/room cap/invite TTL/reconnect. Kiểm tra flagged/pending và denied mode/sandbox. Không thách đấu hoặc gửi feedback tới người thật.
5. Ba mode browser/mobile: oldsave reload, graph/build tools và content riêngmode; feature off/on giữ dữ liệu. Ghi request/query count, latency p50/p95, DB errors, storage size và chi phí workload trước tăng traffic. C05 còn là gate combat tổ đội.
6. Rollback staging có bằng chứng: FEATURE_FLAGS của nhóm vừa bật=false, xác minh API403 và gameplay cũ còn dùng, dữ liệu/receipts giữ nguyên; mở lại và đọc đúng history. Ghi commit/config/time/result. Nếu hỏng schema, phục hồi staging backup có đối chiếu receipt trước replay; không tự dùng DELETE hoặc restore production.
7. Production chỉ sau lệnh deploy riêng của người dùng và gates đã đạt. Không tự deploy/merge từ backlog hoặc do CI xanh.

## Cờ online theo mode, thứ tự bật và rollback (cập nhật sau C07/C08/P05/P06/G04)

Mọi cờ dưới đây mặc định tắt, chỉ đổi qua `FEATURE_FLAGS` của Worker staging. Migration đều **chỉ thêm bảng**, chạy tự động qua `ensureSchema` và lặp được; không có migration phá hủy. Thứ tự bật đề xuất cho mỗi mode (chỉ bật cờ kế tiếp sau khi cờ trước đã smoke):

| Mode | Thứ tự bật | Migration liên quan | Rollback (tắt cờ) |
|---|---|---|---|
| CTC | `party_lobby` → `party_combat` → `party_dungeon` → `party_siege`; `ranked_seasons` độc lập (dựa trên điểm đấu của `async_duels`) | 0005–0007 (sảnh, phiên), 0011 (mùa xếp hạng) | tắt `party_dungeon`/`party_siege` hủy phiên đang chạy, trả lượt siege tuần, giữ state và receipt; tắt `ranked_seasons` ẩn bảng/panel, danh hiệu đã freeze giữ nguyên |
| PHLT | `online_account_phlt` → `coop_rescue` → `room_presence`, `party_lobby`, `party_combat` (cho PHLT cả ba đều yêu cầu `coop_rescue` đang bật, và vẫn phải tự bật) → `weekly_trial` | 0012 (thử thách tuần) | tắt `coop_rescue` hủy phiên rescue/trial đang chạy; bảng `trial_results` giữ nguyên; điểm cứu viện ở sổ cái riêng `phlt/rescue_mark`, tách khỏi `ctc/merit` |
| 2.0 | `online_account_g2` → `community_challenge` | 0013 (thử thách cộng đồng) | tắt `community_challenge` hủy phiên thử thách đang chạy; `challenges`/`challenge_results` giữ nguyên |

Kiểm tra bắt buộc trên staging cho từng cờ mới trước khi tăng traffic: (1) cờ tắt trả `feature_disabled` ở mọi API liên quan và client ẩn panel; (2) nhân vật khác mode bị từ chối kể cả khi cờ của mode kia đang bật (`feature_disabled`/`different_mode`); (3) kết quả chỉ do máy chủ mô phỏng, request có khóa lạ trả 400; (4) hạn mức nguyên tử (lượt/ngày, siege/tuần, đăng/ngày) giữ đúng khi hai request đến cùng lúc; (5) tắt rồi bật lại cờ, dữ liệu và bảng còn nguyên; (6) đo số truy vấn D1 và độ trễ polling 1 giây của phiên (chưa từng đo trên hạ tầng thật).

Rollback sâu hơn mức cờ (phục hồi backup D1) chỉ trên staging và đối chiếu receipt/ledger trước khi chạy lại; không xóa dữ liệu bằng tay trên production. Các số cân bằng (HP gốc 1.200, hệ số 1,35, hệ số mốc thử thách, luật tuần) chưa playtest; thay đổi chúng phải tăng phiên bản (`trial-v1`, `g2-challenge-v1`) để bảng cũ không lẫn bảng mới.

## Cách rollback config

Không xóa extension namespace, receipt, role hoặc metadata. Tắt duel_modes/guild_management/party_lobby đóng advanced API/UI, legacy MVP vẫn theo capability async_duels/guild_online/room_presence. Muốn đóng cả online social phải tắt gate ngoài tương ứng.

Tắt expedition/expedition_travel kết thúc chuyến active interrupted theo P01/P02; storage lỗi pause/retry, không chốt pending reward. Các offline build/report/guide/codex flags giữ data cũ. G2 sandbox vẫn không lưu/gửi ranked.

Config request lỗi: defaults fallback đóng advanced; client không giả mở tính năng khi API fail. Server dùng stored character mode, không query/body mode. Giữ unknown keys và nonboolean ngoài registry khỏi public config.

## Trạng thái thực thi

Local Worker8787 đã kiểm tra HTTP200 index và configphlt/v1; XDG_CONFIG_HOME/WRANGLER_LOG_PATH trong/tmp giải quyết lỗi home của lần thử trước. Request.cf bị chặn có warning/fallback nhưng local API/ASSETS chạy. Startup instructions đã lưu draft môi trường (không phải đã publish snapshot).

Checkpoint 08/10/2026, commit `4cc74d8`: Git archive sạch tại `/tmp/jx-backlog-clean` (không `.git`, `node_modules`, bundle sinh) được cài 40 packages bằng `npm ci` theo lockfile. `check:contracts` 102 scripts/43 task, `npm test` 266/266, `npm run test:d1` 41/41, regular skill audit và Chromium smoke sáu mode/viewport pass. Release contract lặp migrations 0001–0010 hai lần đang được bổ sung ở worktree sau checkpoint này; cần chạy lại clean archive sau commit. Không thay kết quả này cho CI GitHub sau push.

Chưa có Worker/D1 staging được cấp, chưa chạy rollout/rollback remote hoặc benchmark production; chưa có PR URL xác nhận. O04 vẫn mở tới khi release gate được nghiệm thu, không đánh dấu hoàn thành100%.
