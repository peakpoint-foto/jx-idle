# Lộ trình phát triển chiều sâu (Depth Roadmap)

**Trạng thái: tài liệu đề xuất, chờ duyệt — không phải cam kết triển khai.**
Ngày: 09/10/2026, rev 4 (sau 3 vòng review). Nguồn: brainstorm 34 ý tưởng + bảng chấm điểm Effort/Impact.
Mọi con số cân bằng, ngưỡng % và mốc thời gian trong tài liệu này đều là **ví dụ minh họa**, cần duyệt riêng và mô phỏng trước khi viết mã.

## Thay đổi ở rev 4 (theo review vòng 3)

- **0.4 viết lại:** bỏ định danh bền — client tự tính cohort (tuần cài đặt, số ngày hoạt động) và chỉ gửi bucket tổng hợp, đo được D7/D30 mà không cần nối hành vi (điểm 1). Thêm bảng "tiêu chí → sự kiện telemetry": tiêu chí nào không có sự kiện đo thì chưa được duyệt (điểm 2). Mặc định BẬT kèm thông báo một lần trong game + nút tắt ngay (đề xuất, cần duyệt; tuân Nghị định 13/2023) (điểm 15).
- **Phase 1 còn đúng 5 tính năng hiển thị:** cố vấn build, mutator trial, lịch sự kiện, codex, mục tiêu 7 ngày. Báo cáo treo máy, gold sinks, truyện ngắn, loadout chuyển sang Phase 2 (điểm 3). Phase 2 chia **2a / 2b / 2c**, mỗi đợt ≤5 tính năng hiển thị.
- **Gỡ phụ thuộc vòng tròn 0.3 ↔ 1.4:** tiêu chí "xong" của 0.3 đổi thành chuyển `trial_attempts_used` hiện có sang khung mới (parity không đổi) — không còn phụ thuộc 1.4 (điểm 4).
- **2.12 (schema đầy đủ) xếp đầu Phase 2a**, trước 2.2 rift và 2.5 mùa — không còn hardcode trước rồi làm lại (điểm 5).
- **1.1 sửa dẫn chứng:** bug P1-06 được sửa riêng theo runbook; báo cáo chi tiết chỉ giúp người chơi tự hiểu lý do delta = 0. 1.2 không còn tự nhận "duy nhất" (điểm 6).
- **Bảng phụ thuộc:** 0.1 và 0.2 làm song song (0.2 không đổi số nào) (điểm 7). Sửa "parking-lot 3.8" thành "chợ ký gửi (parking lot)" (điểm 8).
- **Chống save-scum cho reroll:** seed = H(item_uid || reroll_count || content_version), cùng input cho cùng output; sim 0.1 chỉ duyệt khoảng giá trị offline một lần, không chạy mỗi lần reroll (điểm 9).
- **Chính sách rollback migration:** mặc định forward-fix; chỉ khôi phục backup khi save hỏng, UI cảnh báo mất tiến trình sau mốc backup (điểm 10).
- **1.4 ghi rõ ngoại lệ nguyên tắc 1:** double EXP phải được duyệt riêng theo nguyên tắc 1, không chỉ trừ ngân sách nguyên tắc 7 (điểm 11).
- **Phương pháp đo:** tiêu chí = % + số tuyệt đối tối thiểu; cửa sổ đo là **tuần 3–4** sau ra mắt (loại hiệu ứng mới lạ 2 tuần đầu); hai tính năng cần đo không ra mắt cách nhau dưới 4 tuần để cửa sổ đo không chồng (điểm 12). Tiêu chí 1.6 thành khoảng 10–30% (điểm 13).
- **Lịch mục 0:** 0.4 khởi động trước và chạy song song; baseline 2 tuần đo trong lúc làm nền tảng → tính năng đầu tiên từ tuần 4–5 thay vì tuần 8 (điểm 14).

## 0. Nguyên tắc bất biến

1. Giữ ba mode CTC / PHLT / 2.0 khác biệt theo luật hiện tại; không tự cân bằng lại mục tiêu cuối game, tăng EXP, đổi sức chứa túi hay tỷ lệ rơi đồ ngoài yêu cầu đã chốt.
2. Fan-made, phi thương mại: không pay-to-win, không bán sức mạnh.
3. Mọi đổi công thức/số liệu phải qua mô phỏng (pipeline sim, mục 0.1) và giữ parity client ↔ worker (`worker/build-game.mjs`).
4. Thiết kế chưa chốt chỉ là báo cáo/giải pháp — không tự sửa luật trong lúc bugfix (theo `TODO_AGENT_P0_P2.md`).
5. Không gắn cờ gian lận oan cho dữ liệu do phiên bản cũ sinh ra; migration có version, idempotent, rollback được.
6. Ca cần Safari thật / D1 preview-production ghi rõ "chờ thiết bị", không coi test local là nghiệm thu.
7. **Ngân sách sức mạnh/EXP tổng:** mọi nguồn tăng sức mạnh đăng ký vào một bảng ngân sách chung (`docs/POWER_BUDGET.md`); tổng cộng dồn không vượt trần đã duyệt; Balance CI kiểm tra **tổng**, không chỉ từng mục. Định nghĩa đơn vị:
   - **Đơn vị DPS:** % so với build tham chiếu tại 3 mốc cấp chuẩn 60 / 120 / 180.
   - **Đơn vị EXP:** % EXP/giờ so với farm chuẩn cùng cấp, cùng mode.
   - **Cách cộng dồn:** cộng (additive) trên base — tổng = base × (1 + Σ bonus). Không dùng nhân dồn trừ khi ghi rõ và duyệt riêng, vì nhân dồn làm lệch kết quả nhiều lần.
   - **Theo mode:** CTC, PHLT, 2.0 mỗi mode một ngân sách riêng (khớp nguyên tắc 1).
   - **Dự trữ:** luôn chừa 20–30% ngân sách chưa phân bổ cho tính năng tương lai; không tiêu hết ở phase 1.
8. **Chống loãng:** mỗi **đợt phát hành** tối đa 5 **tính năng hiển thị mới**, định nghĩa: thứ người chơi thấy và phải học cách dùng (panel mới, activity mới, hệ thống mới). **Không tính** vào giới hạn: sim, CI, schema, migration, refactor, bugfix. Mutator/sự kiện mới tính là 1 nếu đi kèm UI giải thích; sự kiện tuần lặp lại theo lịch không tính lại. Ra dần: mỗi tính năng cách nhau 1–2 tuần, không dồn cả 5 vào một bản cập nhật.
9. **Gắn dữ liệu người chơi:** mỗi tính năng mới phải dẫn được retention/feedback liên quan, hoặc ghi rõ "chưa có dữ liệu" và cách đo sau triển khai. Nguồn dữ liệu xem mục 0.4.
10. **Tương thích phiên bản client ↔ worker:** worker công bố version content/schema; client kiểm tra khi tải và định kỳ. Khi lệch version: banner yêu cầu tải lại (bản breaking) hoặc chặn mềm — chỉ đọc, không cho hành động ghi — cho đến khi tải lại. Đặc biệt bắt buộc với 0.2 (schema) và 0.3 (khung contribution).

## Quy ước chung: feature flag, kill-switch, đo lường

- Mọi tính năng mới có **feature flag riêng, mặc định tắt**; tắt flag là kill-switch mức 1.
- **Chi phí gỡ bỏ** ghi rõ theo loại: client-only (tắt flag là xong) rẻ hơn nhiều so với có bảng D1 (tắt flag + chính sách giữ/xóa dữ liệu + migration dọn dẹp nếu cần).
- **Tiêu chí thành công / rút lui** cho mỗi tính năng: dạng "**≥X% và ≥N người** trong **tuần 3–4** sau ra mắt thì giữ và mở rộng; không đạt thì tắt flag". Vì sao:
  - **% + số tuyệt đối:** game fan-made lượng người chơi nhỏ — "tăng ≥15%" có thể chỉ là chênh vài người, nên luôn kèm N tối thiểu (N cần duyệt).
  - **Tuần 3–4, không gộp 2 tuần đầu:** nội dung mới nào cũng tăng vọt lúc đầu nhờ hiệu ứng mới lạ; đo ở tuần 3–4 mới thấy giá trị thật.
  - **Không chồng cửa sổ đo:** hai tính năng cần đo không ra mắt cách nhau dưới 4 tuần.
- Các ngưỡng X, N dưới đây là ví dụ, cần duyệt cùng spec.

---

## 0. Nền tảng — làm trước mọi thứ ("việc số 0")

Mục 0 chặn mọi thứ phía sau nên dễ phình ra mãi. Mỗi mục có **tiêu chí "xong" tối thiểu** và **mốc thời gian đề xuất** (cần duyệt): quá mốc thì **cắt phạm vi, không lùi lịch**.

**Thứ tự thực hiện (điểm 14):** 0.4 khởi động **trước** (tuần 1) và chạy xuyên suốt để tích baseline; 0.1, 0.2, 0.3 chạy **song song** từ tuần 1 (0.2 không đổi số nào nên không cần chờ 0.1 — điểm 7). Baseline 2 tuần đo trong lúc làm nền tảng → tính năng đầu tiên có thể ra từ **tuần 4–5**.

### 0.1 Pipeline sim + Balance CI + ngân sách tổng (gộp 1.3 + 2.6)

- **Hiện trạng:** mô phỏng P06/G04 đang làm thủ công; `scripts/skill-audit.mjs` và `scripts/check-contracts.mjs` đã có.
- **Thiết kế:**
  - `scripts/sim/` chạy ma trận build yếu/trung bình/mạnh × 10 phái × cấp 60/100/180 trên engine `sessionCombatStep`; output báo cáo markdown + cảnh báo khi vượt ngưỡng.
  - **Bảng ngân sách tổng** (`docs/POWER_BUDGET.md` mới) theo định nghĩa ở nguyên tắc 7: liệt kê mọi nguồn (hệ số, điều kiện, mode), trần tổng, phần dự trữ 20–30%.
  - Balance CI mở rộng từ `skill-audit`: kiểm tra từng mục **và** tổng cộng dồn; PR vượt là fail với báo cáo chênh lệch.
- **Tiêu chí "xong" tối thiểu:** sim chạy ra **cùng kết quả với cùng seed** trên 10 phái × 3 mốc cấp; bảng ngân sách **v1 đã duyệt**; CI fail khi PR cố tình vượt ngân sách (test cả vượt riêng lẻ và vượt cộng dồn). Những thứ khác (dashboard, tối ưu tốc độ sim) để vòng sau.
- **Mốc thời gian (đề xuất, cần duyệt):** tối đa 2 tuần; quá mốc thì cắt dashboard và ma trận mở rộng, giữ đúng ba tiêu chí trên.
- **Phạm vi:** scripts + CI + docs; không chạm game.
- **Quyết định cần duyệt:** ma trận build chuẩn, bảng ngân sách v1, trần tổng, mốc thời gian.
- **Kiểm chứng:** determinism seed; PR vượt budget bị chặn.

### 0.2 Schema data-driven tối thiểu (tách từ 3.1)

- **Vấn đề:** nếu mutator trial, lịch sự kiện, rift, mùa hardcode trước rồi mới chuyển sang JSON sẽ phải làm lại toàn bộ.
- **Thiết kế (bản tối thiểu):** schema + version cho đúng hai loại content dùng ngay: **trial rules** và **event flags**. JSON có schema, version mới thêm mới không sửa version đã phát hành; worker và client đọc cùng định nghĩa qua `build-game.mjs`; JSON sai schema bị từ chối hai phía với lỗi rõ. Client cũ gặp version mới thì theo nguyên tắc 10 (banner tải lại).
- **Tiêu chí "xong" tối thiểu:** chuyển được `SESSION_TRIAL.rules` hiện có sang JSON mà **parity không đổi** (test so sánh trước/sau); **chưa thêm content mới nào**.
- **Mốc thời gian (đề xuất, cần duyệt):** tối đa 1 tuần; quá mốc thì chỉ làm trial rules, event flags để vòng sau.
- **Phạm vi:** schema + loader + validator JSON hai phía. Làm **song song** với 0.1 (không đổi số nào nên không cần chờ sim).
- **Quyết định cần duyệt:** schema đầu tiên, mốc thời gian.
- **Kiểm chứng:** version cũ vẫn đọc được; fuzz bằng bộ sinh content; test lệch version client/worker.

### 0.3 Khung contribution/quota nguyên tử dùng chung (mới)

- **Vấn đề:** boss bang, guild tech, sư đồ, duel league, world boss, chợ ký gửi (parking lot) đều cần D1 + đồng thời + nguyên tử, nhưng mỗi mục tự giải bài toán quota/idempotency riêng.
- **Thiết kế:** một khung dùng chung: `contributions(activity, period, account_id, amount)` với idempotency key `(activity, period, account_id, nonce)`; quota kiểm tra nguyên tử trong cùng câu lệnh ghi (mẫu `trial_attempts_used` trong P06); hàm tổng hợp theo nhóm. Mọi tính năng sau chỉ gọi khung.
- **Tiêu chí "xong" tối thiểu (sửa theo review — gỡ phụ thuộc vòng tròn với lịch sự kiện):** **chuyển `trial_attempts_used` hiện có sang khung mới**, parity hành vi không đổi (vẫn 5 lượt/ngày, nguyên tử, idempotent) + test hai tab chạy đồng thời không nhân đôi. Tài liệu API khung hoàn chỉnh. Không chờ tính năng mới nào.
- **Mốc thời gian (đề xuất, cần duyệt):** tối đa 2 tuần; quá mốc thì cắt hàm tổng hợp nhóm, giữ đúng quota + idempotency.
- **Phạm vi:** worker + D1 (bảng mới) + test concurrency. Làm **song song** với 0.1/0.2.
- **Quyết định cần duyệt:** API khung, chính sách giữ dữ liệu, mốc thời gian.
- **Kiểm chứng:** trial hiện tại chạy qua khung mới không đổi hành vi; concurrency không nhân đôi.

### 0.4 Telemetry + feedback tối thiểu (mới — nguồn dữ liệu cho nguyên tắc 9)

- **Vấn đề:** yêu cầu "có dữ liệu retention/feedback" mà không có nguồn thì nguyên tắc 9 chỉ nằm trên giấy.
- **Thiết kế:**
  - **Không dùng định danh bền** (sửa theo review): định danh xoay hằng tuần thì không đo được D7/D30. Thay vào đó, **client tự tính cohort** (tuần cài đặt, số ngày đã hoạt động) và **chỉ gửi bucket tổng hợp** — đo được retention mà không cần nối hành vi của một người qua định danh. Không PII, không gì để rò rỉ.
  - **Thu tối thiểu:** ngày hoạt động (kèm cohort bucket), tính năng được mở/dùng, thời gian treo máy theo khoảng, cộng các sự kiện trong bảng dưới.
  - **Bảng "tiêu chí → sự kiện telemetry"** — tiêu chí nào không có sự kiện đo thì **chưa được duyệt**:

    | Tiêu chí thành công | Sự kiện telemetry tương ứng |
    |---|---|
    | 1.1 mở xem chi tiết báo cáo | `report_detail_opened` |
    | 1.2 áp dụng gợi ý build | `advisor_suggestion_applied` (kèm loại gợi ý) |
    | 1.3 lượt tham gia trial | `trial_started` (kèm rule) |
    | 1.4 DAU cuối tuần | `active_day` (kèm cờ cuối tuần) |
    | 1.6 lượng vàng lưu thông | `gold_sink_spent` (kèm loại sink), `gold_total_bucket` |
    | 1.7 lượt đọc truyện | `story_read` (kèm phái) |
    | Baseline chung | `active_day`, `session_length_bucket`, `feature_used` |
  - **Kênh feedback gắn nhãn theo tính năng:** form hiện có thêm trường chọn tính năng liên quan; nhãn dùng để đối chiếu với telemetry.
  - **Baseline:** đo 2 tuần trước khi ra tính năng mới (đo trong lúc làm 0.1–0.3 nhờ 0.4 chạy trước); không có baseline thì không so sánh được gì.
  - **Đồng ý của người chơi (điểm 15):** telemetry **mặc định BẬT** (đề xuất — cần duyệt; nếu yêu cầu pháp lý chặt hơn thì chuyển sang opt-in), với **thông báo một lần** khi mở game sau bản cập nhật: nêu rõ 3 loại dữ liệu thu + nút tắt ngay trong thông báo; tắt được bất cứ lúc nào trong Cài đặt. Tuân thủ tinh thần minh bạch của Nghị định 13/2023.
- **Tiêu chí "xong" tối thiểu:** thu được các sự kiện trong bảng, đọc được báo cáo (kể cả dạng file tĩnh), công tắc tắt hoạt động, tài liệu chính sách dữ liệu một trang, thông báo trong game đã có.
- **Mốc thời gian (đề xuất, cần duyệt):** tối đa 1 tuần, **khởi động trước** (tuần 1); quá mốc thì cắt dashboard, giữ thu + xuất file.
- **Phạm vi:** client (thu sự kiện) + worker/D1 (lưu tổng hợp) + docs chính sách.
- **Quyết định cần duyệt:** danh sách sự kiện, chính sách giữ/xóa, mặc định bật/tắt, mốc thời gian.
- **Kiểm chứng:** tắt công tắc thì không còn sự kiện mới; audit mẫu dữ liệu không chứa PII; baseline đo được trước tính năng đầu tiên.

---

## Phase 1 — 5 tính năng hiển thị (ra dần, mỗi 1–2 tuần, cửa sổ đo không chồng)

Đúng 5 theo nguyên tắc 8: cố vấn build, mutator trial, lịch sự kiện, codex, mục tiêu 7 ngày.
Báo cáo treo máy, gold sinks, truyện ngắn, loadout chuyển sang Phase 2 (lý do: xem từng mục).

### 1.1 Cố vấn build giữa game (nâng ưu tiên)

- **Bối cảnh:** một trong hai mục dẫn feedback thật ("đồ mạnh hơn nhưng damage thấp hơn" — mục còn lại là 1.5 codex gián tiếp qua P1-06 đã làm rõ ở dưới). Nỗi đau thật nên ưu tiên cao hơn điểm số gốc.
- **Thiết kế:** khi DPS 3 ngày không tăng, panel gợi ý tối đa 3 hướng từ dữ liệu sẵn có: món thay thế trong rương/túi cho DPS cao hơn (dùng `bestEquipPlan`), skill chưa học có lợi, điểm tiềm năng cộng lệch. Chỉ gợi ý, không tự đổi đồ.
- **Phạm vi:** client (`js/stats.js`, UI). Chi phí gỡ bỏ: thấp.
- **Quyết định cần duyệt:** ngưỡng kích hoạt, có gợi ý cả khi build đã tối ưu không.
- **Kiểm chứng:** fixture build cố tình lệch cho gợi ý đúng; không gợi ý đồ vi phạm policy per-line +1.
- **Tiêu chí thành công / rút lui:** ≥30% **và** ≥N người (N cần duyệt) được gợi ý áp dụng ít nhất 1 gợi ý trong **tuần 3–4** sau ra mắt; không đạt → tắt panel, giữ lab build (Phase 2a) làm kênh thay thế.
- **Telemetry:** `advisor_suggestion_applied`.

### 1.2 Mutator trial tuần mở rộng

- **Hiện trạng:** `SESSION_TRIAL.rules` là allowlist 4 mục (`iron`/`swift`/`tough`/`ward`), seed = f(phiên bản luật, tuần).
- **Thiết kế:** thêm rule mới **bằng JSON theo schema 0.2** (ví dụ: boss phản 10% damage nhận vào, cấm potion, quái con tiếp viện mỗi 30s). Giữ nguyên tắc: đổi phiên bản luật giữa tuần thì bảng tuần đó bắt đầu lại, kết quả cũ giữ nhãn cũ.
- **Phạm vi:** JSON content + `js/session_combat.js` đọc schema + worker bundle. Chi phí gỡ bỏ: thấp (xóa rule khỏi JSON, bảng cũ giữ nguyên).
- **Quyết định cần duyệt:** danh sách rule và hệ số — bắt buộc qua sim 0.1 trước.
- **Kiểm chứng:** 10 phái × rule mới không build nào chết ngay hay đi hết quá dễ; parity client/worker.
- **Tiêu chí thành công / rút lui:** tỷ lệ tham gia trial tuần tăng ≥15% **và** ≥N người so với baseline, đo ở **tuần 3–4**; không đạt → quay về 4 rule cũ.
- **Telemetry:** `trial_started` (kèm rule).
- **Vận hành hằng tuần:** ~30 phút/tuần chọn và kiểm tra rule mới (giảm dần khi thư viện rule đủ lớn); ưu tiên rule tự cân bằng qua sim.

### 1.3 Lịch sự kiện cố định

- **Thiết kế:** khung cố định theo tuần UTC: cuối tuần double EXP CTC, đầu tháng boss đặc biệt. **Định nghĩa bằng JSON theo schema 0.2**, hệ số qua sim 0.1. UI lịch trong tab Khác; server dùng cùng chỉ số tuần với `worker/src/activity.js`.
- **Ngoại lệ nguyên tắc 1 (ghi rõ theo review):** double EXP là tăng EXP ngoài yêu cầu đã chốt → **phải được duyệt riêng theo nguyên tắc 1**, không chỉ trừ ngân sách nguyên tắc 7. Bonus đồng thời đăng ký vào ngân sách tổng.
- **Phạm vi:** JSON content + flag tuần phía worker + UI. Chi phí gỡ bỏ: thấp. (Không cần quota 0.3 cho bản đầu — quyết định quota để sau khi có dữ liệu.)
- **Quyết định cần duyệt:** khung giờ, có áp dụng PHLT/2.0 hay chỉ CTC, hệ số bonus, và **ngoại lệ nguyên tắc 1**.
- **Kiểm chứng:** chuyển tuần UTC đúng; tắt flag giữa sự kiện không mất thưởng đã nhận; tổng bonus không vượt ngân sách (CI 0.1).
- **Tiêu chí thành công / rút lui:** DAU cuối tuần tăng ≥10% **và** ≥N người so với baseline, đo ở **tuần 3–4**; không đạt → tắt flag sự kiện.
- **Telemetry:** `active_day` (kèm cờ cuối tuần).
- **Vận hành hằng tuần:** gần như tự chạy sau khi cấu hình; ~15 phút/tuần kiểm tra flag và log.

### 1.4 Đợt migration save duy nhất: codex + mục tiêu 7 ngày

- **Vấn đề:** cả hai đều cần version save mới — gộp một lần thay vì nâng version hai lần. (Loadout tách ra Phase 2a, đợt migration thứ hai.)
- **Thiết kế:** một version save mới duy nhất chứa:
  - **Codex sưu tầm:** codex quái/boss/đồ theo % hoàn thành (tận dụng `docs/LOOT_CODEX.md`); thưởng mỗi mốc 25% **đăng ký vào ngân sách tổng**.
  - **Mục tiêu 7 ngày đầu:** chuỗi 7 nhiệm vụ dạy từng hệ thống, UI checklist theo mẫu `WEEKLY_TASKS`; thưởng gắn theo ngày.
- **Phạm vi:** client + một migration version duy nhất, idempotent. Chi phí gỡ bỏ: trung bình (giữ đọc version mới, tắt hiển thị từng phần).
- **Kiểm chứng:**
  - Bộ **fixture save thật từ nhiều phiên bản cũ** (càng nhiều càng tốt) chạy migration trong CI; 100% pass mới được phát hành.
  - Migration làm **từng bước nhỏ, mỗi bước idempotent**, nhưng phát hành một lần.
  - **Tự động backup save trước khi migrate**; **chính sách rollback: mặc định forward-fix** (phát bản vá migration) — chỉ khôi phục backup khi save hỏng, và UI phải **cảnh báo rõ rằng tiến trình sau mốc backup sẽ mất**.
  - **Test trên Safari/iOS thật:** giới hạn localStorage ở đó dễ gây lỗi khi save phình to (lịch sử treo máy + codex).
- **Quyết định cần duyệt:** giá trị thưởng các mốc codex, nội dung 7 ngày.
- **Tiêu chí thành công / rút lui:** 0 báo cáo mất dữ liệu sau 2 tuần và tỷ lệ migrate thành công 100% trên fixture; có sự cố → forward-fix, không rollback hàng loạt.
- **Telemetry:** codex dùng `feature_used`; 7-day goals dùng `feature_used` + mốc hoàn thành.
- **Ghi chú dẫn chứng (điểm 6):** phàn nàn P1-06 "treo máy không nhận EXP" là **bug, được sửa riêng theo runbook** — codex/báo cáo không thay thế việc sửa bug, chỉ giúp người chơi tự hiểu hệ thống.

---

## Phase 2a — 5 tính năng hiển thị (schema trước, rồi 5 mục)

### 2.0 Schema data-driven đầy đủ (việc đầu Phase 2a, không tính vào giới hạn)

Mở rộng schema tối thiểu của 0.2 ra toàn bộ loại content (modifier rift, modifier mùa, rule event...). Xếp trước 2.2 và 2.5 để hai mục này dùng JSON ngay từ đầu — không còn hardcode trước rồi làm lại (điểm 5). Client cũ gặp schema mới tuân nguyên tắc 10.

### 2.1 Phòng lab build mở rộng

- **Hiện trạng:** `docs/BUILD_LIBRARY.md`, `docs/BUILD_COMPARISON.md`; `calc()` đã đầy đủ.
- **Thiết kế:** (a) dummy DPS với breakdown theo nguồn damage trên mục tiêu cấu hình được; (b) so sánh A/B hai build cùng điều kiện; (c) mã share build (mã hóa thành chuỗi ngắn, nhập mã để xem — chỉ xem, không áp đồ).
- **Phạm vi:** client-only. Chi phí gỡ bỏ: thấp.

### 2.2 Rift procedural — tháp vô hạn

- **Hiện trạng:** `docs/RIFT.md`; tower hiện tại theo `js/depth.js`.
- **Thiết kế:** tầng vô hạn, mỗi tầng seed theo ngày → modifier xoay **định nghĩa bằng JSON** (nhờ 2.0). Checkpoint mỗi 10 tầng. Bảng độ sâu riêng, tách khỏi tower hiện tại.
- **Phạm vi:** client + bảng worker nếu cần rank. Chi phí gỡ bỏ: trung bình (có bảng D1).

### 2.3 Loadout nhiều bộ đồ/skill (tách từ đợt migration Phase 1)

- **Thiết kế:** 3 slot loadout (đồ + skill + điểm), chỉ chuyển ngoài combat/session; slot mở dần theo tiến trình. Đi vào **đợt migration save thứ hai** (cùng version với các mục 2a khác nếu cùng cần).
- **Phạm vi:** client + migration version mới. Chi phí gỡ bỏ: trung bình.

### 2.4 Gold sinks có kiểm soát (chuyển từ Phase 1 — chưa cấp bách khi chưa có dữ liệu lạm phát)

- **Thiết kế:** ba sink — (a) **reroll 1 dòng affix**; (b) mở rộng rương theo nấc giá tăng dần (thuần client); (c) phí đổi loadout/build. Mọi sink ghi log; tổng ảnh hưởng đăng ký ngân sách tổng.
- **Chống save-scum (điểm 9):** save nằm ở client (localStorage) nên RNG reroll ở client là không an toàn — người chơi sao lưu save, reroll, không ưng thì khôi phục. Validator worker chỉ kiểm tra khoảng cho phép nên không chặn được. Giải pháp: **seed cam kết trước** — seed = H(item_uid || reroll_count || content_version), `reroll_count` lưu trên item và tăng mỗi lần; cùng input cho cùng output nên sao lưu/khôi phục cho ra đúng kết quả cũ. Validator worker vẫn kiểm tra khoảng cho phép.
- **Làm rõ về sim:** khoảng giá trị reroll được **duyệt qua sim 0.1 (chạy offline một lần khi duyệt)** — không chạy sim mỗi lần reroll.
- **Ràng buộc:** sink thời gian, không bán sức mạnh (phi thương mại).
- **Phạm vi:** client (`js/forge.js`, `js/stash.js`) + worker validator cho (a) + log.
- **Tiêu chí thành công / rút lui (điểm 13 — mục tiêu dạng khoảng):** lượng vàng lưu thông **giảm 10–30%** trong tuần 3–4 (giảm quá mạnh cũng là xấu) và không có phàn nàn pay-to-win; ngoài khoảng → điều chỉnh giá hoặc tắt sink reroll.
- **Telemetry:** `gold_sink_spent` (kèm loại sink), `gold_total_bucket`.

### 2.5 Báo cáo treo máy chi tiết (chuyển từ Phase 1)

- **Thiết kế:** báo cáo gồm EXP/vàng + highlight: món hiếm nhất đã rơi, số lần suýt lên cấp, thời gian hiệu quả so với trần, **lý do delta = 0** (dưới ngưỡng 60s / đạt cấp tối đa / hết quota). Lưu lịch sử 7 lần gần nhất.
- **Làm rõ dẫn chứng (điểm 6):** phàn nàn P1-06 "treo máy không nhận EXP" là **bug, được sửa riêng theo runbook** — mục này chỉ giúp người chơi tự hiểu lý do delta = 0, không thay thế việc sửa bug.
- **Phạm vi:** client-only (`js/save.js`, UI). Chi phí gỡ bỏ: thấp.
- **Tiêu chí thành công / rút lui:** ≥40% **và** ≥N người mở xem chi tiết trong tuần 3–4; không đạt → giữ bản gọn cũ.

---

## Phase 2b — 5 tính năng hiển thị

### 2.6 Boss nhiều phase + telegraph

- **Hiện trạng:** `docs/PHASED_BOSS.md`.
- **Thiết kế:** 2–3 phase theo % HP; tuyệt chiêu có vùng báo trước ~1s; enrage sau N giây. Triển khai cho boss session trước (engine đã deterministic), client combat sau.
- **Phạm vi:** `js/session_combat.js` + worker bundle; sau đó `js/combat.js`. Chi phí gỡ bỏ: thấp.

### 2.7 Boss bang async theo tuần (sau 0.3)

- **Thiết kế:** mỗi tuần 1 boss bang; mỗi người đánh async bằng hạ tầng session (tái dùng mẫu mô phỏng server của G04); đóng góp ghi qua **khung 0.3**; tổng damage cả bang mở mốc thưởng chung. Thưởng đăng ký ngân sách tổng.
- **Phạm vi:** worker + D1 + UI bảng đóng góp (dùng `docs/GUILD_MANAGEMENT.md`). Chi phí gỡ bỏ: trung bình.
- **Vận hành hằng tuần:** ~30 phút/tuần theo dõi đóng góp và log; boss xoay tự động theo lịch.

### 2.8 Mùa theo chủ đề 6–8 tuần

- **Hiện trạng:** `docs/RANKED_SEASONS.md`; danh hiệu mùa C08 đã có tiền lệ cosmetic.
- **Thiết kế:** mỗi mùa một chủ đề + modifier toàn cục nhẹ **định nghĩa bằng JSON** (nhờ 2.0); bảng mùa riêng; danh hiệu mùa thuần cosmetic có nhãn mode.
- **Phạm vi:** worker (season flag theo tuần) + client UI. Chi phí gỡ bỏ: trung bình.
- **Vận hành:** vài giờ mỗi 6–8 tuần chuẩn bị chủ đề + kiểm tra; trong mùa gần như tự chạy.

### 2.9 Sư phụ / đồ đệ (sau 0.3)

- **Thiết kế:** một sư phụ nhận nhiều đồ đệ, nhưng **mỗi đồ đệ chỉ có một sư phụ**; milestone chung (đồ đệ lên 60/100/180); thưởng cả hai theo mốc, đăng ký ngân sách tổng; milestone ghi qua **khung 0.3** để idempotent. Giới hạn đồ đệ dưới cấp 100 để chống abuse.
- **Phạm vi:** worker + D1 + UI. Chi phí gỡ bỏ: trung bình.

### 2.10 Legendary affix định hình build (cân nhắc đưa lên sớm)

- **Thiết kế:** affix cực hiếm đổi lối chơi (ví dụ "La Hán Trận lan sang đồng đội"); tỷ lệ cực thấp + pity rõ ràng; tương thích policy per-line +1; qua sim 0.1 bắt buộc.
- **Phạm vi:** `js/loot.js`, `js/stats.js`, tooltip/UI, validator worker.

---

## Phase 2c — các mục còn lại (6 tính năng hiển thị)

Khi lập lịch phát hành, tách thành 2 đợt (mỗi đợt ≤5 tính năng hiển thị) hoặc dời 1 mục lên đợt trước nếu có chỗ trống. Áp dụng mẫu chung về flag, kill-switch và tiêu chí thành công/rút lui.

### 2.11 Nhiều đường chuyển sinh

- **Hiện trạng:** `docs/REBIRTH_DESIGN.md` (R03 chờ duyệt).
- **Thiết kế:** giữ nguyên tắc "ngang có ngân sách": mỗi lần chuyển sinh chọn 1 trong 3 đường (giữ skill / giữ đồ / tốc độ farm); tổng điểm unlock bị chặn; thưởng mỗi đường đăng ký ngân sách tổng.
- **Phạm vi:** client (`js/rewards.js`) + validator worker nếu đổi ngân sách (cùng PR).

### 2.12 Expedition chọn nhánh

- **Hiện trạng:** `docs/EXPEDITION_ROUTES.md`, `docs/EXPEDITION_KNOWLEDGE.md`.
- **Thiết kế:** mỗi ngã rẽ là tradeoff hiển thị trước (hiểm/thưởng cao vs an toàn); seed theo ngày để mọi người cùng bản đồ.
- **Phạm vi:** client (`js/expedition*`).

### 2.13 Phản ứng ngũ hành

- **Thiết kế:** mục tiêu mang trạng thái nguyên tố; combo nguyên tố cho hiệu ứng phụ (Băng rồi Lôi: choáng +0.5s; Độc rồi Hỏa: nổ lan). Tận dụng `counters()` và series đã có.
- **Rủi ro:** chạm công thức damage core hai phía → bắt buộc parity test và sim 0.1.

### 2.14 Nối chiêu combo

- **Thiết kế:** dùng skill A trong 2s sau skill B mở hiệu ứng phụ; mở rộng `skillSupportLinks`; UI hiện cửa sổ combo nhỏ.
- **Phạm vi:** client combat.

### 2.15 Guild tech tree (sau 0.3)

- **Thiết kế:** cả bang đóng góp tài nguyên qua **khung 0.3** để mở node theo cây (EXP bang, giảm phí rèn, tăng slot). Mọi buff đăng ký ngân sách tổng. Node có cấp, reset theo mùa.
- **Phạm vi:** worker + D1 + UI bang.

### 2.16 Truyện ngắn theo phái (fill-in)

- **Thiết kế:** mỗi phái 5–7 mẩu truyện mở dần theo cấp (30/60/90/120/150/180), đọc trong codex (kế thừa codex Phase 1); thuần text, không thưởng sức mạnh.
- **Phạm vi:** content text + UI codex.
- **Telemetry:** `story_read` (kèm phái).
- **Tiêu chí thành công / rút lui:** ≥25% **và** ≥N người mở codex đọc ít nhất 1 mẩu trong tuần 3–4; không đạt → dừng viết tiếp.

---

## Phase 3 — Big bets (điểm ≤ 1.25; tối đa 5 tính năng hiển thị mỗi đợt)

Áp dụng mẫu chung về flag, kill-switch và tiêu chí thành công/rút lui.

### 3.1 Chất cơ chế riêng cho 10 phái (0.80)

- **Thiết kế:** mỗi phái một cơ chế đặc trưng thật sự khác biệt. Làm từng phái một, mỗi phái một PR + sim riêng.
- **Phạm vi:** `js/combat.js`, `js/session_combat.js`, skill data, worker bundle.

### 3.2 Duel league async + replay (1.00)

- **Sửa theo review:** replay deterministic không còn là quick win riêng — nó đi cùng duel league. Ngắn hạn (debug): chỉ lưu seed + phiên bản luật, đủ để tái hiện khi cần.
- **Hiện trạng:** `docs/DUEL_MODES.md`; hạ tầng ladder đã có (`worker/src/ladder.js`).
- **Thiết kế:** league theo bậc, cặp đấu async với "bóng" của đối thủ (snapshot đã xác thực, mô phỏng bởi server như P06 — không tin kết quả client); replay đầy đủ từ seed+input đã lưu; mùa league 2 tuần.
- **Phạm vi:** worker (matchmaking, mô phỏng, bảng league) + D1 (lưu input theo tick — cần **chính sách xóa dữ liệu và ước lượng dung lượng** trước) + UI xem replay. Chi phí gỡ bỏ: cao (nhiều bảng D1).
- **Vận hành:** ~1 giờ/2 tuần theo dõi league; dọn replay cũ theo chính sách.

### 3.3 World boss mô phỏng bởi server (1.00)

- **Thiết kế:** boss thế giới theo khung giờ (ví dụ 20h–22h giờ VN, 2 lần/tuần); server mô phỏng diễn biến từ tổng đóng góp (tái dùng mẫu G04); người chơi gửi lượt đánh async, damage từ snapshot đã xác thực, ghi qua khung 0.3. Thưởng theo mốc cá nhân + mốc chung, đăng ký ngân sách tổng.
- **Phạm vi:** worker (scheduler, aggregation) + D1 + UI theo dõi trực tiếp. Chi phí gỡ bỏ: cao.
- **Chi phí vận hành (bắt buộc ước lượng trước khi duyệt):** số request/giờ cao điểm, dung lượng D1 cho bản ghi đóng góp, chi phí scheduler chạy mô phỏng. Không duyệt khi chưa có con số.
- **Vận hành hằng tuần:** 1–2 giờ/tuần diễn ra (theo dõi tải, xử lý sự cố) + dọn dữ liệu cũ.

### 3.4 Vai trò tank/support trong session combat (0.75)

- **Thiết kế:** mỗi actor chọn vai trò khi vào session: tank (giữ aggro, giảm damage nhận), support (buff/heal theo thời điểm), DPS. Boss ưu tiên tank theo aggro thay vì xoay vòng hiện tại.
- **Rủi ro:** đổi session model → cần version state mới và migration; client cũ gặp state mới tuân nguyên tắc 10.

### 3.5 Võ học tạp — học 1 skill ngoại phái (0.75)

- **Thiết kế:** tốn chi phí lớn để học 1 skill ngoại phái tối đa cấp 5; không nhận bonus hệ của phái mình.
- **Rủi ro cân bằng cao:** bắt buộc sim 0.1 đa build trước khi duyệt.

---

## Parking lot — không làm cho đến khi có lý do cụ thể + dữ liệu

- **Chợ ký gửi giữa người chơi** (parking lot): rủi ro lạm phát, rửa đồ, moderation. Chỉ xem lại khi gold sinks (2.4) đã ổn định **và** có dữ liệu người chơi yêu cầu trade.
- **Tiền tệ riêng mỗi mode** (parking lot): rủi ro phân mảnh kinh tế, lợi ích chưa rõ. Chỉ xem lại khi mode cần tách bạch sink/faucet thật sự.

---

## Bảng phụ thuộc (rev 4)

| Trước | Sau | Lý do |
|---|---|---|
| 0.4 telemetry (khởi động tuần 1, chạy xuyên suốt) | Mọi tính năng Phase 1 trở đi | Không có baseline thì không đo được thành công/rút lui |
| 0.1, 0.2, 0.3 chạy **song song** từ tuần 1 | — | 0.2 không đổi số nào nên không cần chờ 0.1; 0.3 độc lập |
| 0.1 sim + ngân sách tổng | Mọi đổi số (1.2 lịch sự kiện, 1.3 mutator, 2.x, 3.x) | Không con số nào đi vào game khi chưa qua sim và chưa trừ ngân sách |
| 0.2 schema tối thiểu | 1.2 (mutator), 1.3 (lịch sự kiện) | Hai mục này định nghĩa content bằng JSON, không hardcode |
| 0.3 khung contribution | 2.7 (boss bang), 2.15 (guild tech), 2.9 (sư đồ) | Không ai tự giải lại bài toán quota/idempotency; 0.3 tự chứng minh bằng trial_attempts_used |
| 2.0 schema đầy đủ | 2.2 (rift), 2.8 (mùa) | Hai mục này dùng JSON ngay từ đầu |
| Codex (Phase 1) | 2.16 (truyện ngắn) | Truyện đọc trong codex |

Không triển khai production khi chưa có dry-run, backup và rollback (theo `TODO_AGENT_P0_P2.md` P0-03). Schema D1 chỉ thêm mới, không sửa migration đã áp dụng.

## Rủi ro chung

- Mọi ca cần Safari thật / D1 preview-production ghi rõ "chờ thiết bị", không coi test local là nghiệm thu.
- Mọi đổi công thức cần parity client/worker qua `worker/build-game.mjs`; không commit `worker/gen/game.js`.
- Không gắn cờ gian lận oan cho dữ liệu phiên bản cũ; nhân vật chuyển sinh thiếu checkpoint giữ trạng thái chờ.
- Test xác suất phải dùng seed cố định (bài học từ test siege flaky: pin `state.rng`, không nới loop để che).
- Theo dõi chỉ số sau mỗi tính năng: retention **D7/D30 đo qua cohort bucket của telemetry 0.4** (không cần định danh bền), tỷ lệ dùng tính năng; tính năng không ai dùng sau 2 mùa thì cho vào parking lot thay vì mở rộng thêm.
- Telemetry chỉ thu tối thiểu, ẩn danh, không PII, có công tắc tắt; audit định kỳ mẫu dữ liệu; chính sách dữ liệu một trang công khai trong game.
- Tương thích phiên bản (nguyên tắc 10) phải được test như một tính năng: matrix client cũ/mới × worker cũ/mới cho mọi đổi schema.
- Sức vận hành của nhóm nhỏ là trần cứng — tổng thời gian vận hành hằng tuần của các tính năng đang chạy không nên vượt quá khả năng; khi vượt thì ưu tiên tính năng tự chạy, cho tính năng tốn công vào parking lot.
- **Lịch tổng thể:** 0.4 tuần 1; 0.1/0.2/0.3 song song tuần 1–3; baseline 2 tuần (tuần 1–2); tính năng đầu tiên (cố vấn build) từ **tuần 4–5**.
