# P01 — hành trình PHLT tùy chọn

expedition default-off chỉ PHLT, nonsandbox, từ cấp20. Không thay gear hunt/Hoàng Kim, luật rarity, tốc độ hoặc các quota hiện có.

Namespace extensions.expedition v1: character/fac/mode/session ID, status active/ended, phase prepare/segment/rest/ended, chặng/cleared0–3, tài nguyên/elapsed/kills, vật tư chuyến đi và tối đa5 summary. Entry và mỗi chuyển trạng thái ghi nguyên tử vào save; thất bại rollback S, pause chuyến và giữ thao tác để retry rõ ràng. Retry không theo sang cid/mode khác. Build swap, hoạt động khác và đổi nhân vật dùng activityBusy/build guards.

Ba chặng dùng makeEnemy, tick, heroHit, DOT, enemyAI và mitigation có sẵn. Không tạo công thức combat mới. 3/4/5 kẻ địch; chặng cuối có elite, level entry+chặng−1. onKill/wave/death chuyển vào session thay vì payKill/advance stage/heroDeath thường. Mất HP và chết chỉ trong chuyến; không mất đồ mặc/kho lâu dài, vật tư kho/potStock không bị dùng. World actors/ground/HP/mana và cooldown đã có được pause rồi phục hồi khi kết thúc; native sweeps/gold boss/autoPotion không chạy trong chuyến. Quota siege/TK/tower và wave/stage dài hạn không đổi.

Prepare/rest không chạy combat; modal quản lý pause, đóng modal tiếp tục. Kết thúc completed chỉ sau đủ3chặng, withdraw chủ động, failed do HP0, interrupted do timeout1giờ/flag off/reload. HP0 cùng lúc clear vẫn failed. Không có thưởng vàng/EXP/loot ở **scope P01**; vật tư2life/2mana là budget session chưa dùng, terrain/withdraw/reward thuộc P02. Đây chưa là bản expedition kinh tế hoàn chỉnh.

Checkpoint5giây; crash/reload **kết thúc chuyến đang dở**, không replay enemy hoặc auto nhận thưởng. Save ground ghi world ground đang pause, không ghi ground của session. Cold recovery giữ S.ground đã lưu trước khi runtime restoreGround chạy. Schema v1 malformed/foreign bị đóng invalid_interrupted không thưởng; phiên bản tương lai được giữ nguyên, không tự sửa/xóa. SAVE_LOCK/sandbox không ghi recovery. Flag off mà lưu lỗi giữ pause và retry kết thúc, không thử ghi mỗi tick.

B04 ghi activity expedition, phase và damage/heal/mana thực; archive diagnostic vẫn default-off/bounded. Runtime world pause và enemy state không đưa vào save/feedback.

Kiểm chứng:6 case transitions/native combat/report, death/withdraw/simultaneous wipe, storage entry/transition/end retry, crash các phase/migration/future/ground, mode/flag/sandbox/activity, flag-off failure/write loop. Chromium PHLT360/1280px bấm prepare/depart/manage/back/rest/withdraw, kiểm tra pause/HUD44px/assets; mode khác denied. Không API hoặc staging/deploy trong task này.
