# Ngân sách sức mạnh / EXP tổng — v1 (mục 0.1)

**Trạng thái: ĐỀ XUẤT, cần duyệt.** Mọi con số dưới đây là ví dụ minh họa từ sim,
không phải cam kết cân bằng. Quy trình: mọi nguồn tăng sức mạnh mới phải đăng ký
vào bảng này **trước khi viết mã**, qua sim `scripts/sim/`, và Balance CI kiểm tra.

## 1. Đơn vị

- **Đơn vị DPS:** % so với build tham chiếu tại 3 mốc cấp chuẩn **60 / 100 / 180**.
  Build tham chiếu = tier `mid` (phân bổ điểm/cấp hợp lý bằng `autoSpendAttrs`/`autoSpendSkills`,
  đồ tân thủ), mode CTC, đo bằng engine `sessionCombatStep` (party 2 actor, boss scale theo party).
- **Đơn vị EXP:** % EXP/giờ so với farm chuẩn cùng cấp, cùng mode.
  Công thức lý thuyết: `EXP/giờ = expFor(cấp quái) × số quái/giờ × hệ số`.
  Số liệu thực tế cần đo từ telemetry (`session_length`, `active_day`) sau khi 0.4 chạy.
- **Cách cộng dồn:** **cộng (additive) trên base** — tổng = base × (1 + Σ bonus).
  Không dùng nhân dồn trừ khi ghi rõ và duyệt riêng.

## 2. Trần và dự trữ (đề xuất)

| Hạng mục | Giá trị đề xuất |
|---|---|
| Trần tổng DPS (cộng dồn) | **+150%** so với base |
| Vùng cảnh báo (chạm dự trữ) | trên **+112.5%** |
| Dự trữ cho tương lai | **25%** của trần (không phân bổ ở phase 1) |
| Ngưỡng lệch phái (warn) | ±25% so với trung bình tier |
| Ngưỡng fail CI (so baseline) | ±10% |

## 3. Theo mode

CTC, PHLT, 2.0 mỗi mode một ngân sách riêng (khớp nguyên tắc 1 của roadmap).
v1 đo baseline ở **CTC**; PHLT/2.0 bổ sung khi chạy sim cho 2 mode còn lại.

## 4. Sổ đăng ký nguồn bonus (v1)

| ID | Nguồn | Giá trị | Phạm vi | Trạng thái |
|---|---|---|---|---|
| `tamphap_tru` | Tâm pháp Phá Trùm, mỗi tầng | +6%/tầng (chỉ tinh anh/trùm) | mọi mode | đang hoạt động |
| `weekmod_elem` | Mutator tuần Hệ thịnh | +25% khi khắc hệ | mọi mode | đang hoạt động |

Nguồn đã có trong game nhưng **chưa kiểm kê xong**: `FAC_DMG_NORM` (chuẩn hóa phái —
đã nằm trong base, không tính là bonus), `playtestSkillNorm`, các buff theo thời gian.
Bổ sung dần; mục nào chưa kiểm kê thì ghi rõ, không đoán số.

## 5. Quy trình cho tính năng mới

1. Đề xuất nguồn bonus: ghi ID, giá trị, phạm vi, mode vào bảng trên (bản nháp).
2. Chạy `npm run sim` — đính kèm chênh lệch DPS vào PR.
3. `npm run balance` phải xanh: từng ô trong ±10% baseline **và** tổng cộng dồn
   trong trần (trừ dự trữ).
4. Số liệu cuối cùng cần duyệt cùng spec tính năng.

## 6. Baseline đo được (tự động từ sim)

Xem `scripts/sim/report.md` (chi tiết từng ô) và `scripts/sim/baseline.json`
(số liệu máy đọc cho CI).

Tóm tắt lần chạy đầu (2026-10-09, CTC, engine session, mỗi ô trung bình 3 seed):
- Ma trận 90 ô chạy deterministic (cùng seed → cùng kết quả, có test).
- Lệch phái so với trung bình tier còn lớn ở một số ô (ví dụ shaolin lv60 mid
  +108%, emei lv60 mid −78%) — đây là **tín hiệu để review, không phải kết luận
  cân bằng**: session là boss đơn mục tiêu, khác với farm đa mục tiêu mà norm
  phái (`FAC_DMG_NORM`) được hiệu chỉnh theo. Không tự sửa số từ tín hiệu này;
  mọi điều chỉnh phải qua đề xuất + duyệt riêng.
- Tổng ngân sách hiện tại: +31% / trần +150% — còn nhiều dự trữ.
