# P05 — Co-op giải cứu PHLT (DONE local)

Flag `coop_rescue` (chỉ PHLT, mặc định tắt, online). Cần thêm `party_lobby` và `party_combat` bật, và tài khoản PHLT đã mở bằng `online_account_phlt` (xem [ONLINE_MODES.md](ONLINE_MODES.md)). CTC không bị đổi hành vi.

## Cờ phụ thuộc (`requires`)

Registry có thêm trường `requires: { <mode>: [feature…] }`. `room_presence`, `party_lobby` và `party_combat` thêm PHLT với `requires.phlt` gồm `coop_rescue` (và `party_lobby` cho `party_combat`). Client và server cùng đọc quy tắc này (cùng `featureEnabled`), nên giao diện chỉ hiện khi máy chủ thực sự cho phép; tắt `coop_rescue` đóng sảnh và phiên PHLT mà không đụng CTC. Ma trận kiểm thử: CTC không đổi; PHLT chỉ `party_lobby` thì đóng; cần cả `coop_rescue`; g2 không bao giờ mở.

## Sảnh theo mode

- Cột `rooms.mode` (`DEFAULT 'ctc'`, thêm qua `ensureSchema`). Phòng ghi mode của người tạo; mọi lệnh vào phòng kiểm cùng mode cả bằng SQL nguyên tử lẫn kiểm tra trước (trả 403 `different_mode`). Đường phòng cũ (CTC khi `party_lobby` tắt) cũng chặn phòng khác mode, và PHLT không bao giờ rơi về đường phòng cũ.
- PHLT vào bằng mã phòng. Không có bạn bè, lời mời (403 `invites_ctc_only`), chat hay báo cáo: các endpoint đó là CTC. Mục tiêu phòng PHLT chỉ có `rescue`. Chủ phòng vẫn có chuyển chủ và mời rời.

## Phiên giải cứu (`js/session_combat.js`, activity `rescue`, mode `phlt`)

- Chủ tướng có HP ×1.5 và sát thương ×1.8 so với phiên thường để việc bị hạ gục là có thật; hệ số là giá trị khởi điểm chưa playtest.
- Bị hạ gục thì **ngã** trong 24 tick (6 giây). Đồng đội còn sống, đang kết nối, bấm **Cứu**: tốn 20% HP tối đa và 8 MP (người cứu phải còn sống sau khi trả phí), người được cứu hồi 35% HP. **Mỗi người chỉ được cứu một lần** mỗi phiên; ngã lần hai là mất hẳn. Hết cửa sổ, người đã rời (withdrawn), tự cứu, cứu người còn sống đều bị bỏ qua và không tốn phí. Hai người cùng cứu một người trong một tick chỉ một người trả phí và được ghi đóng góp.
- Thắng khi chủ tướng hết HP; cả đội ngã thì phiên kết thúc không thưởng. Đóng góp `rescue` chỉ tồn tại ở activity này (các activity khác giữ nguyên dạng state).
- Server (`worker/src/sessions.js`) tổng quát hóa theo mode: mỗi mode có activity, tài sản sổ cái và nguồn thưởng riêng. Lệnh `rescue` kiểm đích (thành viên khác, không tự cứu); `capture/supply` bị từ chối ở phiên này. Tắt `coop_rescue` abort phiên đang chạy và nhả roster, giữ bản ghi.

## Thưởng: điểm cứu viện

Tài sản `rescue_mark` trong sổ cái mode `phlt`, nguồn `rescue_completion`, **không bao giờ vào sổ CTC** (`merit`). Mỗi người hoàn thành với đóng góp thật nhận 1 điểm, +1 nếu đã cứu ít nhất một đồng đội. Cap 3/ngày UTC, ví 30; phần thưởng được cắt cho vừa trần (ví dụ đã nhận 2 trong ngày thì phần còn lại là 1), 0 thì không ghi sổ. Nhận lặp trả cùng biên nhận. Điểm chưa có nơi tiêu; chỉ là điểm tích lũy do server xác nhận.

## Kiểm chứng

- `worker/test/session_engine.test.js` (+4 case): ma trận mode/activity, chi phí và một lần cứu, tranh chấp hai người cứu, cửa sổ hết hạn, tự cứu/người còn sống/người đã rời/không đủ HP-MP, ngã thật do đòn chủ tướng, parity client–Worker 10 phái × 2/4 người.
- `worker/test/coop_rescue.test.js` (6 case, SQLite và D1 runtime): ma trận cờ (không rơi về phòng cũ), không vượt mode ở phòng/mời/activity/phòng cũ, lệnh rescue hợp lệ và tranh chấp qua server, sổ cái PHLT riêng và CTC không bị chạm, trần ngày và ví, tắt cờ.
- `test/online_sessions.test.mjs` (+2 case): panel PHLT, nút Cứu theo trạng thái, đơn vị thưởng, body lệnh.
- `scripts/session-browser-smoke.mjs`: hai trình duyệt cô lập chơi một phiên PHLT thật (sảnh, cứu, hoàn thành, nhận 2 và 1 điểm), nút chạm ≥44px.
- Hồi quy CTC: lobby (15 + 4 D1) và phiên (10) vẫn xanh.

## Giới hạn

- **Không có chia loot hay vật tư**: PHLT chưa có kho do server sở hữu (xem [TRADE_ESCROW_ADR.md](TRADE_ESCROW_ADR.md)); phần "chia loot/vật tư có luật" của backlog chưa làm được. Vì không có loot nên chủ phòng không thể tự gán loot.
- Không chat, báo cáo hay chặn trong sảnh PHLT (moderation O03 là CTC); chỉ có mời rời của chủ phòng.
- Giải cứu là hoạt động riêng, chưa gắn vào chuyến hành trình (P01–P04), không có đối đầu theo bậc cấp.
- Các hệ số cân bằng (HP/sát thương chủ tướng, 6 giây, 20% HP, 8 MP, 35% HP) chưa playtest; chưa đo tải; chưa staging.
- `party_combat` trong registry vẫn liệt kê g2 nhưng `sessions` từ chối g2.
