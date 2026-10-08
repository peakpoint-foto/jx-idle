# Kế hoạch sửa góp ý người chơi — 08/10/2026

Hướng dẫn thực thi dành cho agent: [TODO_AGENT_P0_P2.md](TODO_AGENT_P0_P2.md). Dùng runbook để nhận ticket, kiểm tra phụ thuộc và nghiệm thu; file này giữ vai trò backlog góp ý gốc.

Nguồn: ba ảnh người dùng cung cấp. Các dòng bị cắt (“lọc đồ… vd dưới c…”, “trừ luôn 30% nội…”) cần giữ trạng thái chưa đủ thông tin; không suy diễn phần bị thiếu. “text”, “IOS”, lời ủng hộ không phải bug độc lập. Chưa truy xuất database góp ý remote.

## Đã thực hiện trong bản sửa này

- [x] Lệnh bài Triệu hồi: 0,5% → 0,05% trên mỗi lần hạ quái đủ điều kiện; giữ giới hạn tồn kho và điều kiện đang dùng/hoạt động.
- [x] CTC: lượt rơi trang bị thường chỉ nhận đồ vàng (rarity 2); không phát đồ xanh/đồ trắng khi thiếu dòng affix. Đồ bộ và phần thưởng hoạt động có chính sách riêng, không xóa đồ xanh người chơi đã sở hữu.
- [x] Xác định dữ liệu cộng cấp kỹ năng hệ có khoảng 1–200, đang bị đọc thành cấp; trần +1 mỗi dòng cho cả năm hệ, chặn cộng dồn bất thường từ một dòng ở calc, normalize đồ cũ khi nạp save, kiểm định server.
- [x] Test hồi quy rơi đồ ở cấp thấp/cao và migrate dòng +38.

## Tiến độ thực thi runbook

- Đã triển khai validator soi cả `eq/inv/ground`, pending verification cho item cũ, sync revision/CAS, claim bounds/replay và marker migration `itemPolicyV=1`.
- Đã xử lý đường Chùy Thiên Vương và ngưỡng auto HP theo phần trăm; test hiện tại 66/66 pass.
- Đã khóa lỗi tự bật lại “Vượt ải” sau ba wave khi người chơi chọn luyện công; regression nằm trong bộ 66/66 pass.
- Chưa đóng các mục cần Safari thật, D1 preview/production, combat server-authoritative hoặc fixture skill local; xem `docs/fixes/` và `TODO_AGENT_P0_P2.md`.

## P0 — tính toàn vẹn trang bị và online

- [ ] Kiểm kê mọi nguồn cấp đồ: rollMagic, geValue/đồ bộ, rèn, khảm, shop, quà, offline. Áp cùng quy tắc cấp kỹ năng ở biên tạo item và kiểm tra mag/ext/base; kiểm tra stash và đồ trên đất khi migration. Không nhân cấp kỹ năng bằng cường hóa/lineScale.
- [ ] Đồng bộ chính sách đồ cũ server: snapshot đã lưu, recovery, sync, bảng xếp hạng; normalize dữ liệu lỗi do phiên bản trước và tính lại lực chiến. Không mặc định gắn cờ gian lận cho đồ do game cũ sinh ra. Giữ audit thay đổi, sao lưu trước cập nhật dữ liệu.
- [ ] Góp ý “có thể can thiệp vào game”: tái hiện đường sửa save/runtime; server kiểm định trạng thái và quota cho mọi API cấp thưởng. Client chạy local có thể bị sửa, nên tiêu chí là không đưa dữ liệu giả lên bảng xếp hạng/online. Thử replay, hai tab, token sai, snapshot vượt giới hạn.

## P1 — một lượt hệ kỹ năng ở môi trường local (chưa triển khai ở cloud)

- [ ] Thiếu Lâm: xác định ID La Thiên Điệp, La Hán Trận; truy từ skill data → cấp hiệu lực → buff/passive → calc → hiển thị. Tái hiện cấp 0/1/max, buff bật/tắt, ghi chỉ số trước/sau và tác dụng thực trong combat.
- [ ] Võ Đang Quyền Pháp: đối chiếu gốc việc trừ nội lực hộ thân tối đa 25%, nhất là cấp 20/21+; xác định công thức tuyến tính có vượt trần hay không. Chốt trần và test cấp do trang bị tăng, tiêu hao nội lực và sát thương hấp thu.
- [ ] Côn Lôn kiếm pháp chưa hiển thị: kiểm tra danh sách nhánh/vũ khí, ID/name, nút chọn và slot; tái hiện cả PC/iOS. Kỹ năng hỗ trợ/nội công không lên dame: kiểm tra liên kết skill hỗ trợ với chiêu chính và định nghĩa “lực tay”.
- [ ] Báo cáo “đồ + nhiều lại ít dame”: so sánh cùng mục tiêu/kháng/vũ khí/chiêu/cấp; phân biệt lực tay, DPS, chí mạng và hidden activation. Kiểm tra bestEquipPlan không tự thay đồ có DPS thấp hơn do chỉ số phụ.
- [ ] iOS bấm sách kỹ năng khiến game đơ: tái hiện Safari thật với console/performance, modal/focus/touch handlers, vòng tính lại UI; tránh listener trùng, modal chặn toàn màn hình không có cách đóng. Test mở/đóng 30 lần, rotate, nền/foreground.
- [ ] Thúy Yên Băng Tung Vô Ảnh: đối chiếu vùng đánh, projectile/multi-hit và animation hoa sen với nguồn dữ liệu; test hitbox/số hit và giới hạn tải đồ họa trước thêm hiệu ứng.
- [ ] Chuẩn hóa +1 cấp mỗi dòng trang bị vs tổng cấp hiệu lực nhiều món: kiểm tra allskill_v, skill riêng, năm hệ, buff, giới hạn học và giới hạn hiệu lực; thống nhất tooltip/client/server.
- [ ] Viết fixture cho từng môn/nhánh: chỉ số trước/sau hỗ trợ, damage trên mục tiêu cố định, mana, cooldown, passive, buff, hidden lines. Chạy riêng PC và iOS; nghiệm thu toàn bộ trong cùng PR local.

## P1 — túi đồ, lọc và loot

- [ ] Lọc/bán khi đầy rương: tái hiện lootFilter/lootWanted/roomCandidate/sweepJunk; phân biệt túi và rương. UI đã có minLvl 1–10 (cấp trang bị, không phải cấp yêu cầu nhân vật); thêm giải thích và kiểm tra người dùng muốn lọc theo chỉ số nào. Không bán đồ khóa, đồ đang mặc, đồ nâng cấp/đồ khớp lọc.
- [ ] Đồ rơi ở tháp tự mất: truy life cycle R.ground lúc đổi tầng, chết, thoát, reload và giới hạn GROUND_MAX. Chốt lưu/nhặt/chuyển túi hoặc thông báo bán tự động; không mất im lặng. Test túi đầy, đồ khóa/đồ giá trị, lên tầng liên tục.
- [ ] Thiên Vương chỉ rơi thương, không chùy: đối chiếu FAC.wcode và nhánh đang chọn, FACTION_WEAPON_SHARE, bảng particular và shop; thử tập mẫu đủ lớn theo hai nhánh trước sửa bảng/bias. Không kết luận từ một mẫu nhỏ.
- [ ] Đề xuất mỗi trang bị một ô: đánh giá grid footprint/rương/túi, migration sức chứa và UI di động; đây là thay đổi thiết kế cần chốt, không tự đổi trong bugfix.

## P1 — bản đồ, offline và hiệu năng

- [ ] Đang luyện công tự nhảy map: truy auto push, hoàn thành wave, training end và resume activity. Chốt chế độ giữ map/farm khi người dùng chọn; test bật/tắt push và quay về từ hoạt động.
- [ ] Hai góp ý thiếu nút chuyển map: kiểm tra UI hub/quick/jxshell, màn nhỏ/PC, điều kiện mở map. Đảm bảo nút hiển thị, có label, chuyển đúng map đã mở và bị chặn khi đang hoạt động.
- [ ] Nhận treo máy không nhận EXP: ghi raw/capped/kps/stageLevel/expFor/gainXp/level cap trước sau; kiểm tra save timestamp và callback nhận thưởng có chạy hai lần. Test offline 59s/60s/2h/8h, đổi ngày, hết quota, reload sau nhận; hiển thị lý do không có EXP nếu đạt trần.
- [ ] PHLT lag: đo FPS/frame time trên thiết bị yếu với triệu hồi, đông quái và hiệu ứng; profile combat/render/doll/UI/auto-equip, cache calc và giảm cập nhật UI khi không đổi. Chốt ngân sách frame, test 30 phút để tìm tăng bộ nhớ và listener.
- [ ] “Cày quá lâu”: đo thời gian đạt mốc theo mode, hoạt động và offline với build yếu/trung bình/mạnh; đánh giá đường nhận EXP/đồ. Chốt mục tiêu trước chỉnh cân bằng; giữ ba mode khác nhau như thiết kế đã thống nhất.

## P2 — shop, potion và giải thích gameplay

- [ ] Kỳ Trân Các không bán gì: kiểm tra cờ mode, điều kiện cấp, dữ liệu và render shop; hiển thị lý do khóa/hết hàng, bảo đảm mua trừ tiền đúng một lần. Test đủ/thiếu tiền, túi đầy, quota tuần.
- [ ] Thêm ảnh cưỡi ngựa: kiểm tra asset có sẵn và trạng thái mount, render/movement, fallback khi ảnh chưa tải; test PC/iOS, không cản thao tác chiến đấu.
- [ ] Auto bơm máu thiếu ngưỡng %: khảo sát ngưỡng hiện tại và cooldown; thêm lựa chọn % dễ hiểu nếu chưa có, lưu qua reload. Test nopot, giới hạn potion công thành, hết bình, % cực trị.
- [ ] “PvP ở đâu”: UI chỉ rõ thách đấu bất đồng bộ online, điều kiện đăng ký/cấp/bậc và vị trí vào; không quảng bá phòng presence là combat realtime. Test user chưa online/chưa đủ cấp và hai tài khoản hợp lệ.
- [ ] “Nên cho lấy dữ liệu”: làm rõ dữ liệu nào (save cá nhân, dữ liệu game, API); trước mắt kiểm tra xuất/nhập save và hướng dẫn, không công khai token/khóa khôi phục hay snapshot riêng tư.

## Thứ tự và nghiệm thu

1. Phát hành sửa drop/affix sau test; kiểm tra lại đồ +38 trên save thật và xác nhận màu loot CTC.
2. Làm P0 migration/server, sau đó map/offline/loot-loss và freeze iOS.
3. Gom toàn bộ skill/DPS vào lượt local, kể cả phần skill phát hiện thêm trong audit trang bị.
4. Đo PHLT trước tối ưu; xử lý shop/UI/potion, rồi các đề xuất thiết kế.
5. Mỗi ticket phải ghi tái hiện, nguyên nhân xác nhận, file sửa, test tự động hoặc ca kiểm tra thiết bị, tác động save cũ. Các báo cáo chưa tái hiện không được đánh dấu đã fix. Không triển khai sửa dữ liệu D1 chỉ dựa trên ảnh.
