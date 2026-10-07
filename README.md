# Võ Lâm Idle — Cẩm nang dành cho người chơi

## Mục đích sử dụng

Võ Lâm Idle là trò chơi nhập vai offline chạy trên trình duyệt. Nhân vật có thể tự hành tẩu, chiến đấu, nhặt đồ và vượt ải; người chơi quản lý trang bị, võ công, cách nhặt đồ và tốc độ mô phỏng.

**Gói này chỉ dành cho nghiên cứu, học tập và tìm hiểu cách một trò chơi offline vận hành. Không được sử dụng, phân phối hoặc khai thác vì mục đích kinh doanh.** Tên gọi, hình ảnh, âm thanh và dữ liệu liên quan tới Võ Lâm Truyền Kỳ thuộc về các chủ sở hữu tương ứng. Đây là bản fan-made không chính thức, không được chủ sở hữu nhãn hiệu hay dữ liệu bảo trợ.

## Cài đặt và khởi động trên Windows

1. Giải nén toàn bộ tệp ZIP vào một thư mục có quyền ghi, ví dụ C:\Games\VoLamIdle. Không chạy trò chơi bên trong tệp ZIP.
2. Bấm đúp tệp start_game.bat. Một cửa sổ máy chủ cục bộ sẽ mở và trình duyệt sẽ truy cập trò chơi.
3. Giữ cửa sổ máy chủ mở trong lúc chơi. Đóng cửa sổ đó sẽ dừng máy chủ; lần sau chỉ cần chạy lại start_game.bat.
4. Địa chỉ mặc định là http://127.0.0.1:8080. Đây là địa chỉ chỉ dành cho máy tính hiện tại; trò chơi không cần tài khoản hoặc máy chủ bên ngoài.

Máy tính cần Windows PowerShell đi kèm hệ điều hành. Nếu Windows hoặc phần mềm bảo vệ hỏi về tệp khởi chạy, hãy chỉ tiếp tục khi bạn tin cậy nguồn nhận gói. Máy chủ chỉ đọc các tệp trò chơi trong thư mục đã giải nén và không cài chương trình vào hệ điều hành.

### Khởi động thủ công

Mở PowerShell tại thư mục trò chơi và chạy:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server.ps1

Tuỳ chọn ExecutionPolicy ở trên chỉ áp dụng cho tiến trình PowerShell dùng để chạy máy chủ, không thay đổi chính sách của toàn máy. Khi máy chủ báo sẵn sàng, mở http://127.0.0.1:8080 trong trình duyệt.

### Khởi động trên macOS hoặc Linux

Nếu đã có Python 3, mở Terminal tại thư mục trò chơi và chạy:

    python3 -m http.server 8080 --bind 127.0.0.1

Sau đó mở http://127.0.0.1:8080. Giữ cửa sổ Terminal mở trong lúc chơi.

## Yêu cầu và lưu ý

- Trình duyệt máy tính gần đây như Microsoft Edge, Google Chrome hoặc Firefox; bật JavaScript.
- Cần giải nén đủ thư mục ảnh, âm thanh, giao diện và dữ liệu nhân vật. Không tách index.html ra khỏi các thư mục này.
- Nên có khoảng 1 GB dung lượng trống để giải nén đầy đủ dữ liệu hình ảnh.
- Trò chơi hoạt động offline sau khi giải nén. Máy chủ cục bộ chỉ cung cấp tệp cho trình duyệt trên cùng máy tính.
- Màn hình rộng hoặc xoay ngang giúp quan sát chiến trường. Giao diện tự thu gọn cho màn hình hẹp và thiết bị cảm ứng.
- Dữ liệu lưu gắn với hồ sơ trình duyệt và địa chỉ cục bộ. Xoá dữ liệu trang web có thể xoá nhân vật; hãy xuất bản sao lưu định kỳ.

## Tạo nhân vật và chọn chế độ

Khi bắt đầu, chọn chế độ, môn phái, tên, giới tính và thử thách. Đọc mô tả trên màn hình chọn trước khi xác nhận: chế độ được gắn với nhân vật và có thể quy định độ khó, tốc độ, vật phẩm hay giới hạn hoạt động khác nhau.

- **Công Thành Chiến:** nhịp chơi tiêu chuẩn, phù hợp hành tẩu và vượt ải theo tiến trình.
- **Phong Hỏa Liên Thành:** thử thách sinh tồn khắc nghiệt hơn; tiến độ và chiến lợi phẩm tuân theo luật riêng của chế độ.
- **2.0:** nhịp chơi nhanh, thuận tiện thử các hệ thống và hoạt động.

Dã Tẩu ở Công Thành Chiến là chuỗi 7 việc lặp vô hạn, chỉ gồm việc làm được ở chế độ này: hạ quái, hạ tinh anh, vượt ải, leo 3 tầng tháp, hạ trùm, hoàn thành một lượt Luyện công và tìm một món đồ theo hệ có dòng thuộc tính yêu cầu (rơi ra là tính, hoặc nộp từ túi). EXP theo độ khó: 10% đến 35% một cấp mỗi việc, mỗi vòng tăng thêm 15% (tối đa ×2,5). Chuỗi Dã Tẩu ở chế độ khác giữ nguyên.

Ở Công Thành Chiến, may mắn được nhân 5 lần (cộng nền 10) nhưng **chỉ cho chất lượng đồ Xanh**: dòng thuộc tính hiếm hơn và giá trị nghiêng về mức cao. Số lượng đồ rơi và tỉ lệ ra đồ Vàng không đổi. Khoảng 0,8% đồ Xanh (khi may mắn bằng 0, tăng dần theo may mắn) là đồ **Cực phẩm**: mọi dòng đạt từ 95% giá trị tối đa, tên có tiền tố «Cực phẩm» và nhật ký báo khi rơi.

Ở Công Thành Chiến, ngoài đánh quái còn có các nguồn EXP khác: trùm cho EXP ×3, tự điều khiển (joystick/chuột) +20% EXP, tháp ×0.65 EXP quái, mỗi lớp công thành và mỗi đợt Tống Kim cộng EXP theo % của cấp hiện tại (thắng Kinh thành ≈ 100% một cấp, thắng Tống Kim ≈ 42%), nhiệm vụ ngày và Dã Tẩu cộng EXP theo cấp, điểm danh/thắng hoạt động tặng buff EXP +25% (cộng dồn tối đa 6 giờ). Cửa hàng công thành và Tống Kim có thêm Đan Kinh Nghiệm và Linh Đan Tu Luyện. Chạm vào thanh KN trên đầu màn hình để xem thời gian dự kiến lên cấp.

Nhân vật ở chế độ thường có thể chuyển sang 2.0 bằng chức năng trong trò chơi. Việc chuyển là một chiều, không thể trở lại chế độ cũ. Dữ liệu nhân vật ở mỗi chế độ được lưu tách biệt.

Mỗi môn phái thuộc một trong năm hệ Kim, Mộc, Thủy, Hỏa hoặc Thổ. Quy tắc tương sinh trong trò chơi là Kim sinh Thủy, Thủy sinh Mộc, Mộc sinh Hỏa, Hỏa sinh Thổ, Thổ sinh Kim. Mối quan hệ này ảnh hưởng tới các dòng ẩn của trang bị.

## Năm nút hoạt động trên chiến trường

Các nút **Vượt ải**, **Luyện công**, **Công thành**, **Tống Kim** và **Leo tháp** được xếp cạnh nhau thành một hàng. Nhãn trạng thái cho biết tính năng đang bật hay đang mở bảng hoạt động.

- **Vượt ải:** tự đi tiếp khi hạ đủ quái ở ải hiện tại.
- **Luyện công:** bật chế độ sinh tồn theo quy tắc riêng.
- **Công thành:** mở bảng thành, tham gia trận và đổi phần thưởng. Chế độ 2.0 và các chế độ khác áp dụng số lượt theo luật hiển thị trong bảng hoạt động. Cửa hàng hoạt động giới hạn mua mỗi vật phẩm một lần mỗi tuần.
- **Tống Kim:** mở chiến trường và phần thưởng. Số trận được giới hạn theo tuần như nội dung ghi trong bảng.
- **Leo tháp:** mở Tháp thử thách. Ở 2.0, lượt vào và số tầng đều không giới hạn; chế độ khác có số lượt theo ngày và chinh phục tối đa 50 tầng. Cấp nhân vật tối thiểu và tầng đang tiến triển được hiển thị trong bảng.

Trong tháp, mỗi tầng có một đợt quái tinh anh; tầng chia hết cho năm là tầng trùm. Qua tầng mới lần đầu sẽ nhận thưởng tiến trình. Mọi chế độ đều tiếp tục leo vô tận ngay trong lượt hiện tại sau khi qua tầng 50 (không tự thoát); chỉ chế độ 2.0 không giới hạn lượt vào, các chế độ khác vẫn có số lượt theo ngày và lần vào sau khi đã chinh phục tháp bắt đầu lại từ tầng 40. Phần thưởng lần đầu chỉ trao khi đạt tầng cao hơn kỷ lục trước đó.

Ba mục Công thành, Tống Kim và Tháp được mở từ các nút riêng trên chiến trường, không còn nằm trong dãy tab Hệ thống/Phần thưởng. Cửa hàng, trạng thái hoạt động và các mục thưởng khác vẫn hiển thị trong bảng hoạt động tương ứng.

## Thao tác một tay

- Trên màn dọc cảm ứng, năm nút hoạt động nằm ở góc trên bên trái, ngay dưới dòng thông báo; các nút điều hướng (Nhật ký, Quà, Tự cày, Hôm nay, Nhặt, ⋯) xếp một hàng căn giữa ở đáy chiến trường. Trên màn ngang, mọi nút và thông báo bên trái gói trong cột rộng khoảng 230px để không che chiến trường. Vào Hệ thống > Trợ năng > **Tay thuận** để đổi bên vùng kéo di chuyển (và cột nút ở màn ngang).
- **Tự cày:** bật hoặc tắt cùng lúc Vượt ải, Tự nhặt và Xoay chiêu.
- **Hôm nay:** danh sách điểm danh, nhiệm vụ, công thành, Tống Kim, tháp còn lượt; chạm để vào thẳng mục tương ứng.
- **Dọn đồ** (trong nút ⋯): bán rác theo chính sách an toàn và mặc đồ tốt hơn.
- Công thành và Tống Kim hỏi xác nhận trước khi dùng lượt tuần (trừ chế độ 2.0 không giới hạn lượt).

## Góp ý

Nút **Góp ý** nằm trong menu ⋯ và trong Hệ thống > Góp ý & dữ liệu. Người chơi chọn loại (Lỗi, Giao diện, Cân bằng, Ý tưởng, Khác), viết nội dung (tối đa 2.000 ký tự), có thể để lại liên hệ và đính kèm thông tin kỹ thuật. Bản nháp được giữ trong trình duyệt tới khi gửi thành công. Mỗi địa chỉ IP gửi tối đa 5 góp ý mỗi giờ.

Dành cho chủ host Cloudflare:

- Góp ý lưu trong bảng `feedback` của D1 (tự tạo khi Worker nhận request đầu tiên).
- Đọc: `GET /api/admin/feedback` (thêm `?status=open` để lọc) với header `x-admin-key: <ADMIN_KEY>`.
- Đánh dấu đã xử lý: `POST /api/admin/feedback` với body `{"id": 12}` (thêm `"status":"open"` để mở lại).
- Tùy chọn: đặt secret `FEEDBACK_WEBHOOK` là URL webhook Discord hoặc Slack để nhận tin nhắn ngay khi có góp ý mới. Tin nhắn tắt mọi lượt nhắc (@everyone, @here) nên người chơi không ping được máy chủ của bạn.

## Bảng điều khiển (chỉ chế độ 2.0)

Hệ thống > Bảng điều khiển > **Bật phiên thử nghiệm**. Có 6 nhóm: Hệ số (EXP, vàng, rơi đồ, máu/sát thương quái, sát thương của bạn, số quái, may mắn, tốc độ 0.5–10×, bất tử, nội lực vô hạn, bộ cài sẵn), Nhân vật, Thế giới, Đồ, Hoạt động và Công cụ (EXP/phút, quái/giây). Từ lúc bật, **tiến trình không được lưu**; tải lại trang là về đúng trạng thái đã lưu trước đó và hệ số trở về mặc định. Trong phiên, trò chơi không ghi bất kỳ dữ liệu nào vào trình duyệt (kể cả kho chung, bang hội, gia tộc, bộ sưu tập) và khoá các nút tải/xuất/nạp file lưu. Trước khi bật phải đánh dấu ô xác nhận đã hiểu; trong bảng luôn có khung đỏ ghi giờ của bản lưu cuối và nút "Thoát & về bản lưu" (bấm hai lần). Cảnh báo chỉ nằm trong bảng, không hiện ra màn hình chơi.

## Giao diện gọn

- Trên màn dọc nhỏ (rộng dưới 360px hoặc cao dưới 640px), dải trạng thái và dòng thông báo trên chiến trường được ẩn cho đỡ chật; xem nhật ký ở nút Nhật ký.
- Dải trạng thái dưới tên nhân vật cho biết đang Tự cày, Thủ công (kèm đếm ngược tự đánh lại), trong tháp/công thành/Tống Kim, tốc độ và buff EXP.
- Thẻ **Hệ thống** gom thành 4 nhóm gập (Chơi & tự động, Nhân vật & lưu trữ, Hiển thị & điều khiển, Dữ liệu). "Thao tác nhanh" có đủ công tắc Vượt ải, Xoay chiêu, Tự dùng thuốc, Thủ công.
- Chấm xanh báo có thứ nhận được: trên nút Quà, nút Hôm nay, từng thẻ trong hộp Quà (điểm danh, mốc cấp, nhiệm vụ, Dã Tẩu, Phúc Duyên, sự kiện, đồng hành, chuyển sinh) và viền xanh ở dòng có nút Nhận.
- Hộp **Quà** chia thẻ theo nhóm (Hôm nay, Hoạt động, Thưởng, Nhân vật, Cộng đồng); phần luật dài được gập lại.
- Màn dọc thấp (dưới 640px cao) tự ẩn bản đồ nhỏ và đưa nút Hôm nay vào menu ⋯ để không chồng nút; chạm nút bản đồ để mở lại.

## Điều khiển

Nhân vật mặc định tự chiến đấu. Trên máy tính, có thể dùng các phím:

| Phím | Tác dụng |
| --- | --- |
| W, A, S, D hoặc phím mũi tên | Di chuyển thủ công |
| 1 đến 4 | Dùng kỹ năng gán vào ô nhanh |
| Q, E | Dùng kỹ năng bổ trợ tương ứng nếu đã gán |
| Shift + Q hoặc Shift + E | Thao tác bổ trợ biến thể |
| T | Bật hoặc tắt Luyện công |
| F | Bật hoặc tắt Vượt ải |
| R | Bật hoặc tắt xoay chiêu |
| X | Đổi tốc độ mô phỏng |
| G | Bật hoặc tắt tự nhặt |
| M | Mở bản đồ |
| B | Mở Hành trang |
| Esc | Đóng cửa sổ đang mở |

Trên điện thoại hoặc máy tính bảng, dùng joystick cảm ứng và chạm nút giao diện. Mở thẻ Võ công để xem mô tả, cộng hoặc rút điểm, rồi gán kỹ năng vào ô nhanh. Một số bùa chú được giữ ở trạng thái không tác dụng trong bản idle; phần mô tả kỹ năng trong trò chơi nêu phạm vi tác dụng.

## Nhân vật và trang bị

Thẻ **Nhân vật** hiển thị trang bị đang mặc, lực chiến, chỉ số, kháng và điểm tiềm năng. Chạm vào ô trang bị để đọc chi tiết hoặc tháo món đồ. Những món thiếu yêu cầu cấp, thuộc tính, giới tính hoặc môn phái sẽ được đánh dấu và không cộng chỉ số.

Khung **Gợi ý mặc theo ngũ hành** xuất hiện trong cả thẻ Nhân vật và Hành trang. Khung này xét hệ phái, quan hệ tương sinh, yêu cầu mặc, lực chiến tổng thể và dòng ẩn đang mở. Nó xếp tối đa ba món có thể làm tăng lực chiến; bấm vào gợi ý để xem so sánh chi tiết trước khi tự quyết định. Gợi ý không tự thay đồ.

Dòng ẩn của món đồ được mở dựa trên tương sinh giữa hệ nhân vật với hệ món đồ và hệ trang bị ở các ô liên kết. Trang bị theo bộ có quy tắc kích hoạt riêng. Trong so sánh trang bị, hãy xem chỉ số tăng giảm, điều kiện còn thiếu và dòng ẩn được mở hoặc đóng.

Trong Hành trang, nút **Mặc đồ tốt** chọn lần lượt các món tăng lực chiến theo mức ưu tiên hiện tại. Hãy xem lại kết quả sau thao tác vì có thể thay nhiều ô. Tuỳ chọn tự mặc đồ tốt hơn có thể bật hoặc tắt trong Hệ thống.

## Hành trang, lọc và tự nhặt

Hành trang gồm túi đồ, đồ rơi trên sân và bộ lọc. Mỗi món đồ chiếm đúng một ô (lưới 6×10, tối đa 60 món), kể cả áo, vũ khí, ngựa. Từ khoá tên áp dụng cho việc tự nhặt, kiểm tra đồ trên đất và bán hàng loạt. Bộ lọc hỗ trợ:

- Cách nhặt: theo bộ lọc, ưu tiên nâng cấp hoặc nhặt tất cả trang bị.
- Độ hiếm tối thiểu và cấp trang bị.
- Nhóm thuộc tính và hệ ngũ hành.
- Tối đa nhiều tiêu chí thuộc tính cụ thể cùng ngưỡng giá trị.
- Chỉ giữ món mặc được/đúng loại vũ khí; chỉ xét dòng thuộc tính đang kích hoạt.
- Ưu tiên tự mặc theo cấu hình cân bằng, sát thương hoặc sinh tồn.

Các mẫu nhanh gồm **Theo môn phái**, **Sát thương**, **Sinh tồn** và **Xóa tiêu chí**. Mẫu theo phái chọn các chỉ số phù hợp lối đánh của môn phái. Mẫu sát thương hướng tới đòn đánh và kỹ năng; mẫu sinh tồn thiên về sinh lực, kháng và hồi phục.

Chế độ **Theo bộ lọc** chỉ giữ món khớp điều kiện. **Ưu tiên nâng cấp** vẫn có thể nhặt món mạnh hơn trang bị hiện tại dù món đó không khớp mọi bộ lọc. **Tất cả trang bị** nhận mọi món hợp lệ. Nhặt bằng cách chạm vào món trên sân bỏ qua bộ lọc.

Khi túi gần đầy, món không được bảo vệ có thể bị dọn theo chính sách nhặt đồ. Món đang khoá, đồ bộ, món đã đầu tư cường hoá/khảm và món có giá trị nâng cấp được giữ an toàn khi dọn túi hoặc bán hàng loạt. Đọc dòng mô tả ở Hành trang để biết số món khớp, số món rơi và cách xử lý khi túi đầy.

## Võ công và điểm tiềm năng

Điểm tiềm năng được phân phối trong thẻ Nhân vật; mỗi lần bấm **+** cộng 5 điểm (còn ít hơn 5 thì cộng hết), nút **−** vẫn rút lại 1 điểm. Điểm võ công được quản lý trong thẻ Võ công. Nút **Gợi ý** xem phân phối đề xuất; **Tẩy** hoặc nút trừ điểm dùng để phân bổ lại khi điều kiện cho phép.

Kỹ năng phụ trợ có dòng «nội công sát thương» theo hệ (ví dụ Nga Mi Chưởng pháp, Võ Đang Quyền Pháp, Cái Bang Chưởng Pháp) cộng 50% giá trị đó vào chiêu nội công (dòng độc tính theo tổng 3 giây độc). Kỹ năng phụ trợ theo loại vũ khí (Đao pháp, Kiếm pháp, Côn pháp…) chỉ có tác dụng khi cầm đúng loại vũ khí. Trang bị tăng cấp kỹ năng được tính cho kỹ năng đã học và thể hiện ngay cạnh cấp kỹ năng. Nếu tổng điểm cộng vượt giới hạn, giao diện cho biết phần nhận được và phần bị giới hạn. Kỹ năng bổ trợ đủ điều kiện được đưa vào chỉ số nhân vật và danh sách giao diện; mở thông tin kỹ năng để xem hiệu ứng cụ thể. Một số kỹ năng kiểu bùa chú không có tác dụng trong chế độ idle.

Ô kỹ năng nhanh ở thanh phía dưới cho phép gán kỹ năng để sử dụng. Chọn kỹ năng trong thẻ Võ công rồi chọn ô nhanh mong muốn.

## Lưu game, sao lưu và chuyển thiết bị

Trò chơi tự lưu trong trình duyệt hiện tại. Mỗi trình duyệt có ba ô nhân vật; dữ liệu không tự đồng bộ giữa thiết bị hoặc giữa các trình duyệt.

1. Mở **Hệ thống** rồi tới phần **Lưu game**.
2. Chọn **Tải file lưu** để tải tệp có đuôi .jxsave.
3. Chép tệp đó sang thiết bị cần chuyển.
4. Mở trò chơi trên thiết bị mới, chọn **Nạp từ file** và tìm tệp đã chép.

Có thể chọn **Xuất mã** và **Nhập mã** thay cho tệp. Hãy sao lưu trước khi xoá dữ liệu trình duyệt, cài lại hệ điều hành hoặc đổi thư mục game. Kiểm tra dữ liệu giúp hạn chế lỗi nạp nhầm, nhưng vì game chạy cục bộ nên đây không phải dịch vụ lưu trữ trực tuyến.

## Chơi Online (PvP Công Thành Chiến)

Chỉ nhân vật **Công Thành Chiến** chơi online được, và online chỉ dùng cho PvP.

- Ở màn tạo nhân vật, khi chọn Công Thành Chiến, ô **Đăng ký chơi Online** được tick sẵn. Giữ ô này để có tên trên bảng xếp hạng.
- Quên tick thì vào **Hệ thống › Chơi Online** để đăng ký, nhưng chỉ khi nhân vật còn dưới cấp 40.
- Không đăng ký vẫn PvP được, chỉ là không có tên trên bảng xếp hạng.
- Khi đã đăng ký, game gửi tín hiệu mỗi phút để máy chủ đo giờ chơi, và đồng bộ nhân vật mỗi 5 phút. Thời gian offline được tính theo đúng giới hạn tu luyện offline của game (8 giờ mỗi lần, 12 giờ mỗi ngày).
- **Mã khôi phục** trong Hệ thống thay cho mật khẩu. Giữ kín, không chia sẻ.
- Từ cấp 40, nhân vật vào bậc PvP: **Sơ cấp** 40–79, **Trung cấp** 80–99, **Cao cấp** 100–119, **Thượng thừa** 120 trở lên. Bảng xếp hạng mỗi bậc xếp theo lực chiến do máy chủ tự tính.
- Mỗi lần đồng bộ, máy chủ kiểm tra trang bị (chỉ số gốc, thuộc tính, cường hóa, trần đồ của chế độ), điểm tiềm năng, điểm kỹ năng và cấp so với giờ chơi đã đo. Vi phạm thì nhân vật bị **loại khỏi bảng xếp hạng** và hiện trên **bảng thông báo** kèm lý do, nhưng vẫn chơi bình thường. Cờ chỉ được gỡ bởi quản trị.

Bản chạy cục bộ (start_game.bat) vẫn gọi được máy chủ online, miễn là máy có mạng.

### Triển khai máy chủ (dành cho người quản trị)

Máy chủ là Cloudflare Worker `jx-idle-final` (cấu hình trong `wrangler.jsonc`, mã trong `worker/`), phục vụ cả game lẫn API `/api/*`, dữ liệu lưu trong D1.

1. `npm install`, rồi `npx wrangler deploy`. D1 `jx-idle-final-db` đã khai báo kèm `database_id` trong `wrangler.jsonc`.
2. Bảng dữ liệu được Worker tự tạo ở request đầu tiên. Không cần chạy migration riêng.
3. Tùy chọn: đặt `TURNSTILE_SITEKEY` (biến) và `TURNSTILE_SECRET` (secret) để bật chống bot khi đăng ký, và `IP_SALT` (secret) làm muối băm IP.
4. Đặt secret `ADMIN_KEY` (ít nhất 16 ký tự) để dùng API quản trị, gửi kèm header `x-admin-key`:
   - `GET /api/admin/flags?name=<tên>`: xem cờ của một nhân vật (bỏ `name` để xem 200 cờ mới nhất).
   - `POST /api/admin/unflag` với `{"name":"<tên>"}`: gỡ mọi cờ đang mở. Nếu nhân vật vẫn vi phạm, lần đồng bộ sau sẽ bị gắn cờ lại.
5. Ngưỡng cấp theo giờ chơi nằm ở `LV_TIME` trong `worker/src/validate.js`. Mặc định cố ý rộng tay: 2 quái/giây, hệ số EXP ×4, thêm 25% và 1 giờ dự phòng. Ví dụ cấp 100 cần khoảng 1,8 giờ, cấp 120 khoảng 4,8 giờ, cấp 160 khoảng 16 giờ.
6. Máy chủ dùng lại mã game: `worker/build-game.mjs` đóng gói các script cần thiết thành `worker/gen/game.js`. Wrangler tự chạy bước này trước mỗi lần dev/deploy (`build.command`).
7. Chạy thử cục bộ: `npx wrangler dev`, kiểm thử: `npm test`.

## Tốc độ, âm thanh và hiển thị

Trong Hệ thống, người chơi có thể điều chỉnh tốc độ mô phỏng, hiệu ứng âm thanh, nhạc nền, cỡ chữ và tiết kiệm pin. Giảm hiệu ứng, hạ tốc độ và đóng bớt tab trình duyệt có thể giúp máy yếu ổn định hơn khi nhiều quái xuất hiện.

Giao diện co theo kích thước cửa sổ và thiết bị. Nếu bảng chật, hãy phóng to cửa sổ hoặc xoay điện thoại ngang. Các bảng dài cuộn bên trong; kéo trong vùng nội dung để xem những mục phía dưới.

## Xử lý sự cố

**Trang trắng hoặc thiếu hình:** kiểm tra đã giải nén toàn bộ ZIP; tải lại mạnh bằng Ctrl+F5. Không chuyển riêng index.html ra khỏi thư mục game.

**Không mở được địa chỉ:** để cửa sổ máy chủ chạy, nhập đúng địa chỉ mà cửa sổ hiển thị. Nếu cổng mặc định đang bận, máy chủ có thể báo một cổng tiếp theo để mở.

**Không thấy nhân vật đã lưu:** dùng cùng trình duyệt và địa chỉ cục bộ đã chơi. Nếu đã đổi trình duyệt hoặc xoá dữ liệu trang web, hãy nạp bản sao .jxsave.

**Máy chạy chậm:** hạ tốc độ game, bật tiết kiệm pin, giảm hiệu ứng, đóng tab không dùng và tránh mở nhiều bản trò chơi cùng lúc.

**Chữ hoặc bảng bị chật:** giảm cỡ chữ trong Trợ năng, phóng to cửa sổ, cuộn ngay trong bảng hoặc xoay thiết bị ngang.

## Thành phần bàn giao

ZIP gồm tệp cần để chạy trò chơi offline, dữ liệu nhân vật, giao diện, hình ảnh, âm thanh, máy chủ cục bộ và hướng dẫn người chơi. JavaScript chạy trong trình duyệt vẫn cần thiết để trò chơi hoạt động và được đóng gói ở dạng thu gọn. Gói bàn giao không kèm lịch sử Git, bộ công cụ phát triển, bộ kiểm thử hoặc tài liệu làm việc nội bộ.

**Chỉ sử dụng cho nghiên cứu và học tập; không sử dụng cho mục đích kinh doanh.**
