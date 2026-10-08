# E04 — Danh mục nguồn/chi và ledger tách chế độ

Hai feature độc lập, đều mặc định tắt: `resource_summary` local cả ba mode; `online_economy` chỉ tài khoản CTC verified/fresh/nonsandbox. Không tin vàng, delta, loot, contribution hoặc mode gửi từ client để mint tài nguyên online.

| Mode | Nguồn / chi | Cap và cách tách |
|---|---|---|
| CTC local | Quái/hoạt động/Phúc Duyên theo điều kiện native; thuốc/shop/cường hóa legacy | Rarity≤Vàng, không lab/rforge; summary không là server wallet |
| PHLT local | Native gear hunt; hành trình trả phí, bank sau rút an toàn; lab/rforge được phép qua bàn preview | Tím/Hoàng Kim, không Bạch Kim; gross vàng hành trình≤1.5phí; session thuốc2+2, loot unbanked không vào kho |
| 2.0 local | Native nguồn/recipes đầy đủ; công cụ thử build không cấp tài nguyên | Bạch Kim; không nhận ví/receipt CTC hoặc tài nguyên từ mã build |
| CTC online | Receipt boss thực do Worker lưu → công trạng; công trạng → XP bang | 1/receipt hôm nay UTC, tối đa3/ngày; ví30; đóng góp≤3/ngày; 100XP/đơn vị; cấp bang≤30/XP≤29.000 |

Các mức công trạng và XP là policy thử nghiệm opt-in, không là kết luận đã cân bằng production. Công trạng ghi nhận lượt tham gia boss từ nền verified snapshot/heuristic hiện có; không tuyên bố đây là bằng chứng combat realtime C05 hay ownership inventory cho giao dịch E05. Donation vàng client trên API guild legacy vẫn bị từ chối. Chỉ endpoint economy donation tiêu công trạng đã có ledger.

Server migration0006 additive, `resource_ledger` append qua API, khóa(account,mode,asset,request_id); balance=sumdelta, không có endpoint setbalance. Collect chỉ tra receipt boss thật của hôm nay, positive useful damage, limit3/earned3/wallet30. Request amount/delta/gold không được dùng. Mỗi nguồn có ID `boss:<receipt>` ổn định. Đổi tuần không xóa ví; ngày mới đổi quota theo UTC, không backfill receipt ngày cũ. Quota boss được kiểm tra cả receipt tài khoản/ngày để rời/tạo bang không reset lượt.

Donation amount integer1–3, request ID payload-bound, current membership/verified mode được recheck trong INSERT. Batch nguyên tử ghi debit rồi cập nhật XP bang/contrib chỉ nếu INSERT mới; underflow/quota/XPcap/membership mismatch không có debit hoặc XP. Retry có receipt trả lại, không cộng lần2; cùng ID khác payload409. SQLite trigger lỗi xác minh batch rollback; D1 runtime kiểm tra lại concurrency và JSON mode guard. History API chỉ32dòng gần nhất, không chứa token/snapshot/IP. Ledger lưu lâu dài để balance/audit không mất bằng chứng; không purge debit/credit tùy tiện. Cần đo cost/retention vận hành O04 trước public.

Local namespace `extensions.resourceLedger` v1, mode/character,32net entries,8aggregate fields. Save wrapper so resource snapshot với save đã lưu cùng nhân vật/mode: vàng, tổng đồ, HT/khoáng/mảnh/vật liệu/thuốc. Không giữ UID/nội dung snapshot/tên vật liệu tùy ý trong log. Chỉ net giữa hai lần lưu; có thể gộp farm/shop/kho, không suy ra gross source/sink chính xác. Source workbench/expedition chỉ nhãn khi receipt/session mới thay đổi, phần khác `local_net`. Preview thuần; không cấp tài nguyên. Lỗi save rollback phần log; future/malformed summary được giữ và bỏ capture. Flag-off không xóa history; sandbox không ghi. Local summary không validate ownership hoặc balance cho server.

UI ví server có quota/cap, nhận receipt, đóng góp vào bang; timeout/ack-loss giữ cùng nonce để thử lại. Wallet không chạm S.gold/S.inv/S.mats. Nút bang dẫn ví thay đóng góp vô hiệu khi feature được bật. UI summary local phản ánh rarity và nguồn/chi riêng mode.

Evidence: 3 client cases +4 SQLite/D1 cases, gồm duplicate/underflow/daily/weekly/rejoin reset/receipt payload/trigger rollback/walletcap/legacy migration/flags/mode/future. Browser sáu mode/viewport: local net/cap; CTC wallet/ack-loss same nonce/touch; PHLT/g2 online denied. Không deploy hoặc test DB production.
