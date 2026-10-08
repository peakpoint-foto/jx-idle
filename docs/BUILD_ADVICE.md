# B03 — Gợi ý theo mục tiêu

Capability build_advice mặc định tắt, ba mode; tab kỹ năng mở modal theo mục tiêu. CTC boss/farm/survival; PHLT kháng–HP/mana/săn đồ; g2 đơn mục tiêu/combo nhiều mục tiêu/sustain. Điểm mục tiêu là heuristic từ calc, công thức được giải thích trong UI, không tuyên bố tối ưu hoặc số đo trận.

Nguồn gợi ý: bộ lưu hợp lệ và trang bị thực trong túi. calc tính dòng ẩn/set đang kích hoạt với bộ đồ ứng viên, không cộng tất cả dòng ghi trên item. Không tạo item/skill hoặc tự phân điểm. Trục bổ trợ dùng resolver hiện có, giữ unsupported; gợi ý nguồn chưa học cho đích đã học là thông tin, không tự cấp điểm.

Preview không ghi S/R/storage; slot đang mặc bị khóa không được thay. Item cần đúng vũ khí môn phái, reqOk và modeItemOk. Apply là lựa chọn riêng, kiểm tra lại từ trạng thái mới và qua buildCandidate/buildPersist; giữ budget/UID, chặn hoạt động/sandbox, rollback lỗi ghi. Apply item cần build_profiles bật. Đồ đã mất hoặc gợi ý không còn cải thiện trả lỗi.

Kiểm chứng: 6 case ba mode, rarity/req/weapon/locks, calc hidden activation, stale/storage failure, mode/flag/activity/support. Chromium sáu mode/viewport kiểm tra modal giải thích, preview thuần, explicit apply CTC/PHLT và flag off. Không đổi rarity/quota/vật tư hay mở online mode khác.
