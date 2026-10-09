# Khung gating tính năng (mục 0 — nền tảng, áp dụng mọi tính năng mới)

Mọi tính năng mới **mặc định tắt**, mở qua feature flag. Kill-switch chung:
`FEATURE_FLAGS` phía server (wrangler env) hoặc `setFeatureFlags` phía client —
đặt flag `false` là tính năng dừng ngay, không cần deploy code.

Quy ước rollout (tối đa 5 tính năng hiển thị mỗi đợt; các tính năng đo lường cách
nhau đủ cửa sổ để đọc telemetry):

| Tính năng | Flag | Mặc định | Kill-switch | Tiêu chí GIỮ | Tiêu chí RÚT | Chi phí bảo trì / gỡ bỏ |
|---|---|---|---|---|---|---|
| Cố vấn build (1.1) | `build_advice` | tắt | flag `false` | ≥20% người bật flag mở panel và áp dụng ≥1 gợi ý trong 14 ngày; không tăng ticket "gợi ý sai" | <5% dùng sau 30 ngày, hoặc gợi ý sai >10% phản hồi | Thấp: 1 file logic + 1 file UI; gỡ = xóa 2 file + 1 dòng registry |
| Mutator trial (1.2) | `trial_mutators` | tắt | flag `false` | lượt trial dùng mutator ≥30% sau 14 ngày; không tăng `trial_attempts_used` bất thường | <10% dùng, hoặc mutator tạo boss bất khả thi | Trung bình: JSON + engine áp mutator; gỡ = xóa engine hook, JSON giữ làm tài liệu |
| Lịch sự kiện (1.3) | `event_calendar` | tắt | flag `false` | ≥40% người chơi mở lịch mỗi tuần | <10% mở sau 30 ngày | Thấp: đọc content JSON có sẵn; gỡ = xóa UI + registry |
| Migration wave codex + mục tiêu 7 ngày (1.4) | `codex_waves`, `onboarding_goals` | tắt | từng flag `false` | new-day-7 retention tăng ≥3 điểm % so với nhóm đối chứng | không cải thiện retention sau 2 cohort | Trung bình: migration phải giữ vĩnh viễn; chỉ gỡ UI mục tiêu |

Chi tiết từng tính năng xem các mục dưới.

## 1.2 Mutator trial (`trial_mutators`)

- Gating: `trial_mutators` trong `FEATURE_REGISTRY` (mặc định tắt, mode PHLT).
  Flag chỉ đọc ở caller (worker `trial.js`/`sessions.js`); engine
  (`sessionTrialWave`) thuần theo `options.mutator` nên deterministic theo input,
  giữ nguyên tắc parity client ↔ worker.
- Dữ liệu: `data/content/trial_mutators.v1.json`, validate bởi
  `validateTrialMutators` (build fail / client lỗi rõ nếu sai). Modifier dùng
  chung từ vựng rule (`hp`/`def`/`interval`/`taken`) nhưng bị chặn ngưỡng khả thi
  (hp 0.5–2, taken 0.5–1.5, def 0.5–2, interval 0.5–2).
- Mutator xoay theo tuần như rule (`sessionTrialMutator`). Khi flag bật, tag bảng
  xếp hạng thành `version:rule:mutator` (tách bảng khi rollout, như mùa mới);
  flag tắt tag giữ nguyên `version:rule` — không ảnh hưởng board hiện tại.
- Không đổi tổng thưởng: trial vốn không thưởng.
- UI: panel Thử thách tuần hiện "Biến thể tuần: tên — mô tả" khi có.
- Test: `test/trial_mutators.test.mjs` (JSON, engine, tính khả thi: fixture phái
  yếu Nga Mi 60 hoàn thành 3 chặng với mọi mutator) + worker gating
  (flag tắt/bật, tag, boss chịu mutator).

## 1.3 Lịch sự kiện (`event_calendar`)

- Gating: `event_calendar` (mặc định tắt, mọi mode). Chỉ điều khiển UI lịch;
  việc "ngoài lịch không chạy" luôn bật vì là tính đúng đắn của lịch.
- Dữ liệu: `data/content/events.v2.json` (file v1 giữ nguyên, không sửa).
  Mỗi slot có `schedule.weeks`: `all` | `even` | `odd` theo chỉ số tuần UTC,
  `limits` ghi số lượt tối đa mỗi kỳ (hiện tại trùng quota đã có trong code).
- Logic dùng chung `eventScheduled`/`eventsForWeek` trong `js/content.js`
  (client và worker đọc cùng định nghĩa qua build-game.mjs).
- Worker (`sessions.js`): tạo trial session kiểm tra lịch trước quota —
  ngoài lịch -> 409 `event_not_scheduled`, không trừ lượt.
- UI: card "Lịch sự kiện tuần" ở tab Khác (qua `renderMore`), hiện khoảng tuần
  (giờ VN) và các sự kiện trong lịch kèm giới hạn lượt.
- Mốc tuần dùng đúng công thức `trialWeekId`/`trialWeekStart` (thứ Hai 00:00 UTC).
- Test: `test/event_calendar.test.mjs` (v1/v2, all/even/odd, mốc tuần, HTML đúng
  tuần) + worker (ngoài lịch bị từ chối và không trừ quota, trong lịch chạy).

## 1.4 Migration wave codex + mục tiêu 7 ngày (`codex_waves`, `onboarding_goals`)

- Khung migration nhỏ (`js/save_waves.js`): `registerSaveWave(version, id, up)` —
  version tăng dần, id duy nhất, `up(state)` chỉ chạm vùng extensions của wave
  mình, idempotent. `runSaveWaves` được gọi trong `migrateSaveSchema` nên save
  mới lẫn save cũ nhiều version đều đi qua, không mất dữ liệu. Wave hiện tại:
  v1 `codex_waves` (mở khóa đợt bách khoa), v2 `onboarding_goals` (khởi tạo mốc
  7 ngày). State migration luôn chạy (kể cả khi flag UI tắt) để bật flag sau
  vẫn có dữ liệu.
- Codex theo đợt (`js/codex_waves.js`, flag `codex_waves`): card "Bách khoa theo
  đợt" ở tab Khác. Đợt 1 = bách khoa hiện có; đợt 2 (mở ở cấp 30) = mẹo chơi
  nâng cao từ các hệ thống thật trong game.
- Mục tiêu 7 ngày (`js/onboarding_goals.js`, flag `onboarding_goals`): checklist
  7 ngày (cấp 10 → cấp 30), **không thưởng** (tránh ảnh hưởng cân bằng). Hoàn
  thành ghi nhận lazy khi render. Card ở tab Khác hiện tiến độ x/7.
- Kill-switch: từng flag `false`. Gỡ: xóa 3 file + 2 dòng registry + 1 dòng hook
  trong `save_schema.js` (các wave đã chạy để lại `extensions.wv`, vô hại).
- Test: `test/save_waves.test.mjs` — fixture v1 không mất dữ liệu, idempotent,
  thứ tự version, mục tiêu 7 ngày trên save mới (mở theo ngày, ghi nhận xong),
  codex đợt 1/2 theo cấp và flag.

## 1.1 Cố vấn build (`build_advice`)

- Gating: `featureEnabled("build_advice")` chặn cả `buildAdvice()` (ném lỗi "chưa mở")
  lẫn panel UI. Mặc định `enabled: false` trong `FEATURE_REGISTRY`.
- Advisor thật: chấm điểm theo mục tiêu (`boss`/`farm`/`survival`/`mana` theo mode),
  thử đồ trong túi và bộ đã lưu trên `calc()` thật, chỉ giữ kết quả cải thiện điểm.
- Mỗi gợi ý có `reason` ngắn gọn (chỉ số cải thiện nhiều nhất, ví dụ "DPS +12%").
- Không gợi ý: đồ sai mode (`modeItemOk`), vũ khí sai môn phái, chưa đủ yêu cầu,
  ô bị khóa.
- Người chơi tự tắt: nút "Tắt" trên panel (lưu `localStorage jx_advice_off`), panel
  hiện nút "Bật gợi ý" để mở lại. Áp dụng gợi ý không bao giờ tự động — luôn có
  nút "Áp dụng" và preview trước/sau.
- Test: `test/build_advice.test.mjs` — đa phái (5 phái), reason, mode, dismiss.

## 2.0 Schema data-driven đầy đủ — rift modifiers từ JSON (`rift_modifiers.v1.json`)

- `RIFT_MODIFIERS` suy từ JSON (metadata hiển thị); behavior giữ trong code key
  theo id. `rift_rules.js` chuyển xuống sau `content.js`.
- Modifier mùa (2b) sẽ theo cùng pattern.

## 2.1 Phòng lab build mở rộng (`training_lab`)

- Đã có: phòng luyện tham số hóa, so sánh A/B, mã share build.
- Mới: `trainingBreakdownHTML` — breakdown theo nguồn damage (từng chiêu + DOT,
  kèm %) trong kết quả đơn và so sánh A/B.
- Kill-switch: flag `training_lab`. Chi phí gỡ: thấp (client-only).

## 2.2 Rift procedural — tháp vô hạn (`rift_tower`)

- `js/rift_tower.js`: tầng vô hạn, modifier mỗi tầng seed theo ngày (từ JSON
  2.0), checkpoint mỗi 10 tầng, bảng độ sâu local (best + lịch sử 7 lần).
  Leo = training session deterministic — cùng seed cho cùng kết quả nên không
  save-scum được; không ảnh hưởng build thật, không thưởng.
- HP tầng 1 = 60k, tăng 1.16^x (neo theo sim: mid cấp 60 ~9k DPS qua tầng 1
  trong ~7s, tường dần ở tầng 15+).
- Bảng worker (rank) chưa cần — quyết định ở đợt rollout khi có dữ liệu.
- Kill-switch: flag `rift_tower` (kèm `training_lab`). Gỡ: xóa file + hook panel.

## 2.3 Loadout nhiều bộ đồ/skill (`build_profiles`)

- Nền đã có: profile lưu UID trang bị + điểm + chiêu, validate đầy đủ, chặn đổi
  trong hoạt động (`buildChangeProblem`).
- Mới 2.3: slot mở dần theo tiến trình — bộ 1 luôn mở, bộ 2 ở cấp 30, bộ 3 ở
  cấp 60 (`buildSlotLocked`, UI hiện trạng khóa). Migration wave 3 (đợt thứ hai)
  chuẩn hóa `S.builds` trên save cũ.
- Kill-switch: flag `build_profiles`. Gỡ: trung bình (xóa file + UI hook).
