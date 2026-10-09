"use strict";
// 2.15: UI guild tech tree — hiển thị cây, đóng góp vàng.
async function guildTechLoad() {
  if (!featureEnabled("guild_tech")) return null;
  const gid = S.guildId || (S.guild && S.guild.id);
  if (!gid) return {error: "Chưa vào bang"};
  try {
    const r = await fetch(`/api/guild-tech?guild_id=${encodeURIComponent(gid)}`);
    return await r.json();
  } catch (e) { return {error: "Không tải được"}; }
}
function guildTechHTML(data) {
  if (!data) return "";
  if (data.error) return `<p class="dim">${esc(data.error)}</p>`;
  const {def, nodes} = data;
  return `<h4>Cây công nghệ bang (mùa ${data.seasonIdx})</h4>` +
    `<p class="dim small">Hiệu quả hiện tại: +${data.effects.expPct}% EXP, -${data.effects.forgeDiscount}% phí rèn, +${data.effects.memberSlots} slot.</p>` +
    def.nodes.map(n => {
      const st = nodes[n.id] || {level: 0, contributed: 0};
      const maxed = st.level >= n.maxLevel;
      const cost = maxed ? 0 : n.costs[st.level];
      const locked = n.requires && !(nodes[n.requires]?.level > 0);
      return `<div class="card"><b>${esc(n.name)}</b> <small>Cấp ${st.level}/${n.maxLevel}</small><br>` +
        `<small class="dim">${esc(n.desc)}</small><br>` +
        (maxed ? `<small class="ok">Đã max</small>` :
          locked ? `<small class="dim">Cần mở ${esc(n.requires)} trước</small>` :
          `<small>Đã góp ${fmt(st.contributed)}/${fmt(cost)} vàng</small>
           <div class="btnrow"><button class="btn sm" data-tech="${n.id}" data-cost="${cost - st.contributed}">Đóng góp ${fmt(cost - st.contributed)} vàng</button></div>`) +
        `</div>`;
    }).join("");
}
async function guildTechDonate(nodeId, gold) {
  const gid = S.guildId || (S.guild && S.guild.id);
  if (!gid || S.gold < gold) { toast("Không đủ vàng"); return; }
  const nonce = Math.random().toString(36).slice(2);
  try {
    const r = await fetch("/api/guild-tech", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({guild_id: gid, node_id: nodeId, gold, nonce}),
    });
    const j = await r.json();
    if (j.ok) {
      S.gold -= gold; save();
      toast(j.leveledUp ? `Lên cấp ${j.level}!` : "Đã đóng góp");
      if (typeof refreshGuild === "function") refreshGuild();
    } else toast(j.msg || "Thất bại");
  } catch (e) { toast("Lỗi mạng"); }
}
