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
