"use strict";
// Bách khoa theo đợt (1.4): nội dung bách khoa mở theo đợt (wave). Đợt 1 là bách
// khoa hiện có; các đợt sau mở theo tiến trình và được migration wave đưa vào
// save cũ (không mất dữ liệu). Mặc định tắt (flag codex_waves).
const CODEX_WAVES = [
  {wave: 1, name: "Khởi hành", desc: "Bách khoa cơ bản: vùng và quái, bộ Hoàng Kim, nguyên liệu rèn.",
   unlock: () => true, go: () => codexModal()},
  {wave: 2, name: "Thâm nhập", desc: "Mẹo chơi nâng cao.", unlock: () => (typeof S !== "undefined" && S && S.lvl >= 30),
   need: "đạt cấp 30",
   tips: [
    ["Tự mặc đồ", "Thẻ Hành trang có \"Tự động mặc đồ mạnh hơn\" — nhân vật tự thay món tốt hơn khi nhặt được."],
    ["Sao lưu", "Thẻ Khác → \"Tải file lưu\": game chạy trên máy bạn, hãy sao lưu trước khi đổi thiết bị."],
    ["Trục bổ trợ", "Thẻ Võ công hiện trục bổ trợ giữa các chiêu (học chiêu trước mở khóa chiêu sau)."],
    ["Kháng", "Thẻ Nhân vật hiện kháng ngũ hành — kháng thấp nhất quyết định độ trâu trước trùm dùng hệ đó."],
    ["Tắt gợi ý", "Thẻ Võ công → Gợi ý build có nút Tắt nếu bạn muốn tự mày mò."],
   ]},
];
function codexWaveUnlocked(wave) {
  const w = CODEX_WAVES.find(x => x.wave === wave);
  if (!w) return false;
  try { return !!w.unlock(); } catch (e) { return false; }
}
// HTML tách riêng để test được.
function codexWavesHTML() {
  if (!featureEnabled("codex_waves")) return "";
  const rows = CODEX_WAVES.map(w => {
    const open = codexWaveUnlocked(w.wave);
    const tips = open && w.tips ? w.tips.map(t => `<p><b>${esc(t[0])}</b> — ${esc(t[1])}</p>`).join("") : "";
    const go = open && w.go ? ` <button class="btn sm" data-wave-go="${w.wave}">Mở bách khoa</button>` : "";
    return `<div class="card${open ? "" : " lock"}"><b>Đợt ${w.wave}: ${esc(w.name)}</b>` +
      (open ? "" : ` <small class="dim">· chưa mở (${esc(w.need || "")})</small>`) + go +
      `<br><small class="dim">${esc(w.desc)}</small>${tips}</div>`;
  }).join("");
  return `<section class="card" id="codexWavesCard"><h4>Bách khoa theo đợt</h4>${rows}</section>`;
}
function codexWavesRender() {
  const host = document.getElementById("t-more");
  if (!host) return;
  host.querySelector("#codexWavesCard")?.remove();
  const html = codexWavesHTML();
  if (html) {
    host.insertAdjacentHTML("afterbegin", html);
    host.querySelectorAll("#codexWavesCard [data-wave-go]").forEach(b => b.onclick = () => {
      const w = CODEX_WAVES.find(x => x.wave === +b.dataset.waveGo);
      if (w && w.go) w.go();
    });
  }
}
{
  const original = typeof renderMore === "function" ? renderMore : null;
  if (original) renderMore = function () { const v = original.apply(this, arguments); codexWavesRender(); return v; };
}
