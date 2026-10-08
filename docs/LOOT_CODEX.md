# E01 — Nguồn rơi và wishlist

loot_codex default-off cả ba mode. Catalog đọc J.drop qua dropFile cấp bị giới hạn S.lvl+DROP_OVER, nhóm item trong bảng, FD_TABLE/FD_COST, REF.shardNeeds, RCP recipes và mode caps. Quái thường không được mô tả là nguồn rơi Tím/Bạch Kim; HK chỉ mode có hk, điều kiện hkHard hiện hiển thị. Không chuyển trọng số drop thành tỷ lệ item cụ thể.

extensions.lootWishlist v1 lưu mode/phái/filter. Gợi ý thuộc tính theo B03 goal: HP/kháng, mana/regen hoặc skill; người chơi chỉnh ngưỡng và AND/OR, activeOnly. Lưu wishlist và Apply vào bộ lọc là hai thao tác riêng. Preview đếm đồ thực phù hợp mode bằng lootMatch; không áp dụng hoặc bán/chế đồ. Filter chọn wearableOnly, pickMode filter và rarity cap; slot khóa không thay.

Wishlist khác mode/phái hoặc schema mới không tự áp; raw rule lạ/không hữu hạn/vượt cap bị từ chối. Flag off giữ tiêu chí. Save/apply qua buildPersist atomic; sandbox/lock chặn viết; storage failure giữ trạng thái. Namespace được thêm khi dùng, không tự reset wishlist khi chuyển mode.

4 case gồm source config/modecap, AND/OR/hidden activation, stale/future/locks/sandbox, storage/flag. Chromium sáu mode/viewport nguồn không quảng cáo rarity cấm, preview→lưu→áp dụng filter. npm test 157/157 pass. Không đổi luật drop hoặc quota.
