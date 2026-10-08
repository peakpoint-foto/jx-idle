# TODO triển khai: cân bằng và chặn lỗ hổng hoạt động

Tài liệu này ghi lại kế hoạch và tiêu chí nghiệm thu xử lý các lỗi luồng, reset lượt và vòng lặp thưởng tìm thấy khi rà soát CTC, PHLT và 2.0. Phần hardening, giới hạn thưởng, độ khó Tháp 2.0 và ledger CTC Online đã được triển khai trong working tree; các mục còn lại là kiểm tra vận hành cân bằng sau khi deploy.

## Trạng thái triển khai

- [x] Khóa run, độ khó, quota đã dùng và chính sách reload cho Tháp, Tống Kim, Công thành và Luyện Công; run không đủ dữ liệu được đánh dấu interrupted, không hoàn lượt và không nhận lại thưởng.
- [x] Tháp 2.0 sau tầng 50 tăng liên tục theo tầng bằng hệ số HP, sát thương, phòng thủ và né tránh; phần thưởng vàng tăng giảm dần để không tạo farm tuyến tính.
- [x] Giới hạn Dã Tẩu theo chu kỳ, quota 5 điểm tiềm năng mỗi tuần cho PHLT/2.0 và ngân sách server tương ứng.
- [x] Kinh thành 2.0 có phần Hoàng Kim bảo đảm tối đa một lần mỗi tuần; các lượt sau vẫn giữ thưởng theo đóng góp.
- [x] Chặn bình máu thứ hai trong Công thành tại nghiệp vụ dùng thuốc; thuốc nội lực không bị ảnh hưởng.
- [x] Sửa ghi nhận thắng Tống Kim chỉ khi hoàn tất trận; shop Công thành migrate khóa index cũ sang ID ổn định và lưu giao dịch thành công.
- [x] Thêm server UTC ledger cho quota CTC Online, khóa sự kiện idempotent và báo cáo kết quả từ client.
- [x] Bổ sung test hồi quy cho độ khó Tháp, reload interrupted, mốc UTC và phần thưởng Kinh thành.

## Luật thiết kế đã chốt

- Giữ ba mode khác biệt theo mục tiêu hiện tại. Không đồng nhất loot, độ khó, tốc độ, quota hoặc tiến trình riêng của CTC, PHLT và 2.0.
- Giữ CTC/PHLT một lượt Công thành và một trận Tống Kim mỗi tuần; giữ quota Tháp theo ngày.
- Giữ 2.0 không giới hạn lượt vào hoạt động. Thưởng lặp lại phải tương ứng với đóng góp thực tế; giới hạn mua từng món trong shop vẫn một lần mỗi tuần.
- Tháp 2.0 vô tận sau tầng 50, nhưng **độ khó phải tiếp tục tăng theo tầng**. Không để cấp quái hoặc hệ số HP/sát thương dừng ở một mức phẳng sau tầng 50. Có thể đặt giới hạn số học để tránh tràn số, nhưng không được tạo trần gameplay.
- Nhân vật chuyển sinh thiếu checkpoint cấp 180 phía server tiếp tục ở trạng thái chờ xác minh, không bị gắn cờ gian lận và chưa được xếp hạng.
- Với chơi offline, không tuyên bố quota hay save phía client là chống chỉnh sửa. Với CTC Online, server phải là nguồn xác thực cho thời gian và phần thưởng có ảnh hưởng tới xếp hạng.

## P0 — Chặn vòng lặp thưởng vượt trội

### A01. Tháp vô tận 2.0: tăng độ khó liên tục từ tầng 50 và ghìm lạm phát thưởng

Hiện `towerLevel()` đưa quái 2.0 về cấp nhân vật (tối đa cấp nhân vật) sau tầng 50, còn `towerMul()` giữ hệ số ở 1.05. Trong khi đó, tầng kỷ lục mới tiếp tục thưởng vàng theo `150 × tầng` hoặc `300 × tầng`, rồi `grant()` nhân thêm theo cấp nhân vật. Đây là đường farm vàng vô hạn với độ khó gần như không tăng.

- [ ] Tách rõ ba khái niệm: cấp nhân vật, cấp nền của Tháp ở tầng 50 và độ khó cộng thêm theo số tầng vượt 50.
- [ ] Định nghĩa hàm khó `towerDifficulty(floor, characterLevel)` sao cho tầng 50 là mốc chuẩn và độ khó hữu hiệu tăng đơn điệu ở mọi đoạn sau đó. Nếu cấp quái chạm giới hạn engine, HP/sát thương/kháng hoặc cơ chế địch vẫn phải tăng tiếp.
- [ ] Không giữ công thức hiện tại khiến `towerLevel` và `towerMul` đứng yên sau tầng 50. Kiểm tra các hệ số trong `towerSpawn()`, không chỉ con số cấp hiển thị.
- [ ] Rà soát `makeEnemy()`/`enemyStats()` khi cấp quái vượt `MAX_LEVEL`; hỗ trợ cấp cao an toàn hoặc dùng hệ số tầng có giới hạn số học nhưng không có trần gameplay.
- [ ] Điều chỉnh thưởng tầng mới theo độ khó và thời gian/đóng góp. Không để vàng thưởng tăng tuyến tính không giới hạn trong khi thời gian hạ tầng không tăng tương ứng. Giữ phần thưởng tiến trình có ý nghĩa, nhưng định nghĩa mức tăng giảm dần hoặc ngân sách thưởng theo bậc tầng.
- [ ] Bảo đảm tầng vô tận vẫn có thể chơi được: có kiểm tra thời gian hạ quái, sát thương nhận vào, hồi phục và khả năng sống sót ở các mốc cao; tránh tăng chỉ số tới mức không thể gây sát thương hoặc số học tràn.
- [ ] Sửa mô tả trong `README.md` và UI Tháp để nói rõ độ khó sau tầng 50 tăng theo tầng; không còn câu gây hiểu rằng độ khó không tăng.

**Nghiệm thu:**

- [ ] Kiểm tra mốc tầng 49, 50, 51, 60, 100, 250, 500 và 1.000 ở cấp nhân vật 40, 100 và 180.
- [ ] Với mọi mốc sau 50, độ khó hữu hiệu tăng; không có đoạn phẳng kéo dài do cap cấp nhân vật.
- [ ] Phần thưởng mỗi giờ không tăng nhanh hơn độ khó/chi phí thời gian ở các bậc cao.
- [ ] Test không cần khởi tạo hàng nghìn tầng thật: dùng hàm thuần để kiểm tra tính đơn điệu, biên số học và bảng thưởng.

### A02. Dã Tẩu lặp vô hạn: chặn phần thưởng tăng theo số vòng

Trong CTC, Phúc Duyên mỗi việc là `6 + cycle`; trong PHLT/2.0 là `5 + cycle` (việc nguyên liệu có mức cơ sở khác). Ở PHLT/2.0, hầu hết mỗi việc còn cộng 1 điểm tiềm năng vô hạn. Hệ số EXP CTC đã có trần ×2,5, nhưng các phần thưởng khác thì chưa.

- [ ] Giữ chuỗi nhiệm vụ lặp lại vô hạn và giữ đặc trưng bảy bước của CTC, năm bước của PHLT/2.0.
- [ ] Thêm hệ số vòng có trần dùng chung; không dùng `cycle` thô làm số lượng Phúc Duyên tăng mãi.
- [ ] Đặt ngân sách điểm tiềm năng từ Dã Tẩu cho PHLT/2.0 theo tuần trên từng nhân vật. Đề xuất khởi điểm để cân bằng: tối đa 5 điểm/tuần từ chuỗi; sau quota, thay điểm bằng phần thưởng không tăng chỉ số vĩnh viễn.
- [ ] Giữ EXP Dã Tẩu CTC tăng theo vòng nhưng không vượt trần ×2,5 hiện có.
- [ ] Chọn trần Phúc Duyên theo ngân sách kinh tế sau khi mô phỏng. Giá trị ban đầu để kiểm thử: cycle reward tối đa bằng cycle 10 (CTC tối đa 16 FD/việc; generic tối đa 15 FD/việc; việc nguyên liệu tối đa 18 FD). Đưa các mức này thành hằng số có tên, không rải công thức khắp UI và logic thưởng.
- [ ] Hiển thị rõ quota điểm tiềm năng còn lại và cách đổi thưởng sau khi chạm quota.
- [ ] Đối chiếu nguồn Phúc Duyên từ Dã Tẩu với rương Phúc Duyên, vòng quay 2.0 và ngân sách `attrBudget()` phía server; phần thưởng hợp lệ không được khiến nhân vật hợp lệ bị gắn cờ do mô hình ngân sách thiếu nguồn.

**Nghiệm thu:**

- [ ] Test chu kỳ 0, 1, 10, 50 và 1.000: FD không vượt trần; điểm tiềm năng không vượt quota tuần; chuỗi vẫn tiếp tục và EXP CTC không vượt ×2,5.
- [ ] Test đổi ngày/tuần không cho nhận lại quota của cùng tuần.
- [ ] Test rút lui/nộp đồ/nhận thưởng lặp không cấp hai lần một việc.

### A03. Công thành 2.0: giới hạn phần thưởng Hoàng Kim bảo đảm, giữ lượt vào vô hạn

Mỗi lần thắng Kinh thành, `siegeExit()` thử cấp một món Hoàng Kim nếu mode cho phép. 2.0 vào không giới hạn nên phần thưởng trực tiếp này không bị giới hạn tuần như các món shop.

- [ ] Giữ lượt vào Công thành 2.0 không giới hạn.
- [ ] Giới hạn phần thưởng Hoàng Kim bảo đảm ở Kinh thành một lần mỗi tuần trên từng nhân vật. Dùng khóa thưởng ổn định theo tuần, không dùng chỉ số mảng.
- [ ] Sau khi nhận phần Hoàng Kim tuần, các lượt thắng tiếp theo vẫn nhận thưởng tham gia theo đóng góp (Lệnh Công thành/EXP theo luật đã chọn), nhưng không nhận lại món Hoàng Kim bảo đảm.
- [ ] Đảm bảo PHLT vẫn nhận thưởng theo luật hiện tại và giới hạn một lượt tuần; CTC vẫn nhận Phúc Duyên/EXP thay Hoàng Kim.
- [ ] Rà xác suất rơi Hoàng Kim từ Tống Kim 2.0 ở độ khó Khó: giữ là phần thưởng ngẫu nhiên có chủ ý hoặc giới hạn ngân sách/tuần riêng; không để thay đổi độ khó giữa trận kích hoạt xác suất.

**Nghiệm thu:**

- [ ] Thắng Kinh thành nhiều lần trong cùng tuần 2.0: tối đa một món Hoàng Kim bảo đảm; Lệnh/EXP vẫn khớp số lớp hoàn thành.
- [ ] Sang tuần mới nhận lại đúng một phần thưởng.
- [ ] CTC và PHLT không đổi hành vi hoặc nhận nhầm phần thưởng 2.0.

## P1 — Khóa trạng thái trận, lượt và độ khó

### A04. Khóa độ khó trong suốt một lượt hoạt động

Ở 2.0, đổi độ khó từ Hệ thống khi đang ở Tháp/Tống Kim/Công thành có thể xóa `R.enemies`; tick sau tạo lại địch cho cùng tầng/đợt. Điều này cho phép làm mới địch mà không đặt lại tiến độ. Luyện công còn dùng độ khó hiện tại khi tính thưởng cuối, dù thông số sống sót đã được tính lúc bắt đầu.

- [ ] Khi bắt đầu Tháp, Tống Kim, Công thành hoặc Luyện công, chụp `difficulty` vào trạng thái run.
- [ ] Dùng độ khó đã chụp cho toàn bộ chỉ số địch, sát thương, hiệu ứng tuần và phần thưởng cuối run.
- [ ] Vô hiệu hóa bộ chọn độ khó khi hoạt động đang chạy; thêm guard trong handler/hàm, không dựa riêng vào UI.
- [ ] Đổi độ khó ngoài hoạt động không được xóa hoặc tạo lại địch của hoạt động đang chạy.
- [ ] Giữ quyền chọn độ khó 2.0 trước khi vào hoạt động; CTC/PHLT tiếp tục cố định theo luật mode.
- [ ] Nếu cần cho phép đổi độ khó giữa các đợt, kết thúc run hiện tại trước rồi mới áp lựa chọn mới; không tạo lại đợt hiện tại.

**Nghiệm thu:**

- [ ] Test đổi độ khó giữa từng loại hoạt động: độ khó của run không đổi, số địch/HP hiện tại không được reset và không sinh thêm phần thưởng.
- [ ] Test Tống Kim: không thể dùng độ khó Thường để đánh rồi chuyển sang Khó trước khi hạ Tướng Kim để lấy xác suất Hoàng Kim.
- [ ] Test Luyện công: đổi độ khó ở màn thưởng không thay đổi hệ số EXP/vàng của lượt vừa hoàn tất.
- [ ] Test Tháp tầng đang nhận thưởng lần đầu: đổi độ khó không nhân đôi `R.tower.pend`, kill quest hoặc drop.

### A05. Xử lý tải lại/đóng tab giữa trận theo một chính sách duy nhất

`S.siege` được lưu, nhưng HP/đội địch không được lưu tương ứng; tải lại hồi đầy máu và dựng lại nguyên lớp. Tống Kim/Tháp/Luyện công lại lưu quota nhưng trạng thái trận là runtime, nên tải lại có thể mất run và mất lượt.

- [ ] Chuẩn hóa trạng thái hoạt động thành một run có `runId`, mode, hoạt động, độ khó đã chụp, thời điểm vào, quota đã dùng, lớp/đợt hiện tại, số đóng góp và trạng thái quyết toán.
- [ ] Dùng chính sách phục hồi nhất quán: tiếp tục đúng trạng thái đã lưu; nếu dữ liệu trận không đủ/không hợp lệ thì kết thúc lượt như thất bại/gián đoạn, không dựng lại nguyên đợt với máu đầy.
- [ ] Khi bị gián đoạn, lượt CTC/PHLT đã bắt đầu vẫn bị tính; không hoàn lại quota để thử lại. Với 2.0 không có quota vào, nhưng không được tạo phần thưởng thắng hoặc phần thưởng chưa đóng góp.
- [ ] Ghi checkpoint ở ranh giới đợt/lớp và lưu đủ dữ liệu cần để không reset HP người chơi, bình đã dùng, địch đã hạ hoặc tiến độ.
- [ ] Quyết toán thưởng theo `runId + rewardKey` đúng một lần; gọi lại exit, tải lại hoặc lỗi save không cấp trùng.
- [ ] Lưu số đóng góp đã hoàn tất trước khi phát thưởng. Nếu save thất bại, rollback toàn bộ kết quả hoặc để trạng thái pending có thể quyết toán lại idempotent.
- [ ] Khi load save có hoạt động đang mở, xử lý nó trước `offlineGains()`.
- [ ] Không tính tu luyện offline qua thời gian mà nhân vật đang ở hoạt động; áp dụng cùng chính sách cho Công thành, Tống Kim, Tháp và Luyện công.

**Nghiệm thu:**

- [ ] Kiểm thử reload ở đầu trận, giữa đợt, sau khi hạ một phần địch, sau khi qua lớp/đợt và ngay trước/sau khi quyết toán.
- [ ] Không tình huống nào hồi đầy máu hoặc hồi bình đã dùng mà vẫn giữ tiến độ/nhận thưởng cũ.
- [ ] Không tình huống nào mất lượt mà cấp thưởng trùng; không tình huống nào nhận offline gains trong hoạt động.

### A06. Thực thi giới hạn bình máu tại điểm dùng thuốc

`autoPotion()` kiểm tra `siegePotLeft()`, nhưng lệnh uống thủ công gọi `usePotion()` mà không kiểm tra hạn mức.

- [ ] Đặt guard một bình sinh lực ở `usePotion()` hoặc lớp nghiệp vụ chung trước khi trừ thuốc/vàng, cộng bộ đếm, tick quest hay đặt cooldown.
- [ ] Áp cùng guard cho phím tắt, nút UI, gamepad và tự động uống.
- [ ] Không áp nhầm giới hạn này cho thuốc nội lực; CTC/PHLT/G2 giữ luật thuốc riêng hiện có.
- [ ] Nếu dùng thuốc bị từ chối, không trừ vàng/thuốc, không tăng `potUsed`, không tick nhiệm vụ và không tiêu cooldown.

**Nghiệm thu:**

- [ ] Thử uống 2+ bình máu trong một lượt qua từng input; chỉ bình đầu có hiệu lực.
- [ ] Thử mua thuốc bằng vàng và dùng thuốc tồn kho.
- [ ] Thử Bất dược và đảm bảo không có đường input nào bỏ qua luật.

### A07. Cân bằng thưởng theo đóng góp, không thưởng lợi thế cho việc chỉ farm đợt dễ

Tống Kim/Công thành ghi nhận `kills`, nhưng payout chính dựa vào số đợt/lớp hoàn tất. Trong 2.0, người chơi có thể lặp vào không giới hạn; cần so sánh hiệu quả farm lớp/đợt đầu rồi rút lui với hoàn thành toàn trận.

- [ ] Lập bảng reward/minute cho từng wave/layer và full clear tại các mốc cấp 40, 80, 120, 180; bao gồm Lệnh, EXP, buff, vàng, drop và token sự kiện.
- [ ] Giữ nguyên nguyên tắc CTC/PHLT một lượt tuần và phần thưởng theo lớp/đợt đã hoàn tất.
- [ ] Với 2.0, chọn công thức contribution rõ ràng: số đợt/lớp hoàn tất cộng phần đóng góp có thể kiểm chứng trong đợt dang dở; chặn việc nhận thưởng tối đa khi chỉ tham gia hoặc không gây đóng góp.
- [ ] Đảm bảo tỷ lệ thưởng/thời gian của vòng “vào → dọn wave/layer đầu → rút lui → vào lại” không lấn át hoàn thành toàn trận ngoài chủ ý.
- [ ] Ghi rõ thành phần payout nào lặp mỗi run, thành phần nào giới hạn tuần và thành phần nào chỉ trả khi full clear.
- [ ] Không giảm thưởng đóng góp vô hạn của 2.0 một cách đồng loạt; chỉ điều chỉnh thành phần gây farm vượt trội và giữ entry vô hạn.

## P1 — Nguồn thời gian và giới hạn shop

### A08. Dùng thời gian máy chủ cho giới hạn CTC Online

Giới hạn ngày dùng `today()` theo đồng hồ thiết bị. `weekKey()` dùng `clockNow()` với chặn lùi giờ, nhưng vẫn chấp nhận đồng hồ nhảy về trước; người dùng có thể đẩy thời gian tiến để mở tuần mới. Server hiện kiểm định snapshot nhân vật, không có sổ cái lượt/thưởng hoạt động.

- [ ] Với tài khoản Online, lấy ngày/tuần từ server; client chỉ hiển thị quota được server trả về.
- [ ] Tạo sự kiện thưởng có khóa duy nhất (account/character, activity, period, runId, rewardKey); server từ chối quyết toán trùng hoặc sai quota.
- [ ] Không tin timestamp, `used`, `buy`, `best` hoặc `won` do client tự gửi.
- [ ] Lưu lịch sử tối thiểu đủ đối chiếu quota, phần thưởng cửa hàng, điểm tiềm năng và phần thưởng Hoàng Kim.
- [ ] Xử lý lệch giờ thiết bị, múi giờ, DST và tuần bắt đầu theo một chuẩn UTC rõ ràng.
- [ ] Giữ offline mode hoạt động không cần server; ghi rõ quota offline là dữ liệu cục bộ và không bảo đảm chống chỉnh sửa.
- [ ] Không biến nhân vật chuyển sinh thiếu checkpoint thành vi phạm khi đối chiếu reward/skill; giữ chính sách `pending_verification` đã chốt.

**Nghiệm thu:**

- [ ] Đổi đồng hồ thiết bị tiến/lùi/ngày/tuần không làm tăng quota hoặc nhận lại phần thưởng Online.
- [ ] Gửi lại cùng một giao dịch thưởng nhiều lần chỉ nhận một lần.
- [ ] Lỗi mạng giữa client/server có thể retry mà không mất thưởng và không cấp trùng.

### A09. Dùng ID ổn định cho mọi món shop giới hạn

Tống Kim đã dùng ID theo món; shop Công thành đang dùng index mảng làm khóa tuần.

- [ ] Khai báo `id` ổn định riêng cho từng món shop Công thành.
- [ ] Migrate các save cũ có `buy` theo index sang ID tương ứng.
- [ ] Kiểm tra index đầu vào, trạng thái tuần, quota, số token và khả năng save trước khi trừ token.
- [ ] Thực hiện mua như giao dịch nguyên tử: trừ token + ghi quota + cấp item; không mất token nếu ghi/cấp thưởng thất bại.
- [ ] Đảm bảo các mode không có Huyền Tinh/Hoàng Kim chuyển phần thưởng sang giá trị tương đương đúng một lần.

## P2 — Kiểm toán bảng cân bằng và các phần thưởng liên quan

### A10. Đối chiếu phần thưởng theo mode/cấp/độ khó

- [ ] Lập bảng thưởng thắng, thua, rút lui và từng mốc đóng góp cho Công thành, Tống Kim, Tháp và Luyện công.
- [ ] Tính riêng CTC, PHLT và 2.0 tại cấp 40, 80, 120 và 180; gồm mode multiplier, buff EXP, tuần biến động, độ khó và thưởng trực tiếp.
- [ ] Kiểm tra Tống Kim 2.0: entry vô hạn nhưng mỗi full clear có EXP theo cấp và buff EXP; xác nhận tốc độ tăng cấp/đạt trần không phá vai trò của các mode khác.
- [ ] Kiểm tra Tống Kim Khó ở 2.0: xác suất Hoàng Kim từ Tướng Kim (hiện có đường `goldBoss`) theo số run/ngày và không có pity ngoài chủ ý.
- [ ] Kiểm tra nguồn Phúc Duyên, Huyền Tinh, mảnh Hoàng Kim, token sự kiện, thuốc, vàng và điểm tiềm năng; xác định sink tương ứng và tốc độ tích lũy.
- [ ] Kiểm tra phần thưởng event, Kỳ ngộ, vòng quay 2.0, rương Phúc Duyên và nhiệm vụ ngày khi cùng cộng dồn với hoạt động.
- [ ] Kiểm tra phần thưởng tầng 50/Tháp tuần để đảm bảo không bị lặp qua reload hoặc thay đổi độ khó; phân biệt thưởng mốc một lần với thưởng tuần.
- [ ] Giữ thưởng cấp/điểm danh/thành tựu idempotent; lỗi save không làm mất hoặc nhân đôi claim.
- [ ] Xem xét `score` Công thành/Tống Kim hiện chỉ dùng trong log; hoặc biến nó thành thống kê có luật rõ, hoặc bỏ nhãn điểm để không hàm ý có xếp hạng hoạt động.

### A11. Bổ sung test hồi quy và kiểm thử mô phỏng

- [ ] Test độ khó Tháp đơn điệu sau tầng 50 và payout ở các mốc cao.
- [ ] Test giới hạn Dã Tẩu theo chu kỳ/tuần, cả thưởng trực tiếp và phần thưởng quy đổi.
- [ ] Test phần thưởng Kinh thành 2.0 có quota tuần và payout lặp sau quota.
- [ ] Test thay đổi độ khó giữa Công thành/Tống Kim/Tháp/Luyện công.
- [ ] Test reload/đóng tab ở các điểm của A05; test quyết toán idempotent và lỗi storage/network.
- [ ] Test giới hạn thuốc mọi input và chế độ Bất dược.
- [ ] Test timestamp thiết bị giả lập, ranh giới tuần UTC và đồng bộ đồng thời ở hai tab.
- [ ] Test partial clear/full clear/abandon theo cả ba mode; kiểm tra `kills`, nhiệm vụ, token event, pet XP và payout không bị đếm trùng.
- [ ] Test shop mua trùng, đổi thứ tự item, migration save cũ, đầy túi và lỗi lưu.
- [ ] Test ngân sách điểm tiềm năng hợp lệ phía Worker với các nguồn thưởng lặp mới; giữ case chuyển sinh thiếu lịch sử ở trạng thái chờ xác minh.
- [ ] Chạy `npm test`, kiểm tra `git diff --check`, rà UI text so với luật thật và kiểm thử thủ công luồng hoạt động trên browser.

## Thứ tự thực hiện đề xuất

1. A04 khóa độ khó và A05 xử lý khôi phục run để ngăn reset địch/lợi dụng payout.
2. A01 tăng khó Tháp từ tầng 50 và cân lại payout tầng vô tận.
3. A02 chặn thưởng Dã Tẩu tăng vô hạn.
4. A03 giới hạn thưởng Hoàng Kim bảo đảm ở Kinh thành 2.0 nhưng giữ lượt vào vô hạn.
5. A06 chặn bình máu vượt quota; A07 cân bằng partial rewards.
6. A08 dùng thời gian/quota server cho CTC Online; A09 chuẩn hóa shop.
7. A10/A11 chốt bảng cân bằng, cập nhật mô tả và thêm test hồi quy trước khi phát hành.

## Phạm vi tin cậy

Hoạt động hiện chạy chủ yếu ở client. Guard trong UI không chống được người dùng sửa save hoặc gọi hàm bằng DevTools. Các thay đổi phía client có thể sửa gameplay offline và giảm lỗi vô ý; muốn bảo vệ bảng xếp hạng CTC Online cần server kiểm tra quota và quyết toán thưởng, không chỉ kiểm tra snapshot chỉ số nhân vật.
