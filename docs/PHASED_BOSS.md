# C01 — Encounter trận kỳ của trùm (CTC solo)

phased_boss default-off chỉ CTC, không sandbox/tower/TK/siege/survival/town/training. Trong wave farm có boss thường, chọn một boss đầu tiên, không Hoàng Kim. Đây là một loại encounter MVP trên NPC thật sẵn có; không phụ bản co-op/realtime và không thêm entry quota.

Rule v1: HP≤60% vào pha2, sinh một trận kỳ có HP8% max trùm, trùm hồi1.5% max/s khi kỳ còn sống. Phá kỳ ngắt phần hồi mới, không đổi base regen. HP≤25% vào pha3; pha chỉ tiến tới. Mỗi6s báo vòng tại vị trí nhân vật, radius90, reaction1.5s; pha3 chu kỳ4.5s. Burst25% HP max qua heroGuard khi nhân vật còn trong vòng. Autoplay dùng obsSteer tránh vòng, tạm giữ đòn khi tránh; manual chọn đường. UI vòng canvas có viền/chữ, HUD gọn, nút rút lui44px.

Kỳ là mục tiêu objective/dummy đứng yên, không tấn công hoặc nhận EXP/loot/collection/kill contribution kinh tế. Dùng NPC placeholder có nhãn kỳ, chưa có sprite riêng. Mọi phái có thể phá bằng chiêu học thật và DOT. Vai trò damage/control/duy trì từ chỉ số build, không khóa phái. Contribution chỉ damage hữu ích/heal hữu ích/CC quan sát qua B04 event contract. Heal là self-sustain trong solo, không giả là chữa đồng đội.

Hạ boss gọi luồng onKill/payKill cũ một lần; không reward riêng, không trả thưởng theo số damage tự khai. Rút lui/gục reset encounter cùng wave, không biến các quái còn lại thành victory clear, không trả loot boss. Kết quả runtime R.phaseBossResult xem ở Sổ tay; B04 archive/timeline giữ phase/damage khi capability báo cáo bật. Reload bỏ runtime theo farm hiện có, không tạo claim receipt; authoritative reward chờ C05. Không đưa prototype này vào ranked server combat.

Build/profile/policy đổi bị chặn khi encounter active. Flag off khôi phục regen, xóa kỳ/warning; chuyển nhân vật không trao reward boss của nhân vật trước. Phase state không vào S/save; R pointer và dummy owner reference chỉ runtime.

5 case threshold/regen/ward-no-reward, telegraph hit/safe, damage/heal clipping và 10 phái phá kỳ bằng starter+DOT, win once/abort/wipe/mode, flag/identity ownership. npm test170/170 pass. Chromium CTC hai viewport kiểm tra HUD, canvas ring, abort và contribution modal; hai mode khác denied. Không deploy hoặc benchmark cân bằng production.
