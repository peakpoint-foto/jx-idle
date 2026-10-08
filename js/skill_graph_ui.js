"use strict";

function skillSupportText(link) {
  const name = link.status === "unsupported" ? "ID " + link.target : link.targetName;
  return `Bổ trợ ${name}: +${link.percent}% — ${link.reason}`;
}

function skillGraphHTML() {
  if (!S || !FAC[S.fac] || !featureEnabled("skill_graph")) return "";
  const links = factionSkillGraph(S.fac, S);
  const sections = FAC[S.fac].skills.map(id => {
    const rows = links.filter(x => x.source === +id);
    if (!rows.length) return "";
    return `<div class="card"><button class="btn sm" data-graph-skill="${id}">${esc(SK[id].n)}</button>` +
      rows.map(x => `<div class="qrow"><span>→ ${x.status === "unsupported" ? `ID ${x.target}` : esc(x.targetName)}<small>${esc(x.reason)}</small></span><b class="${x.active ? "good" : "dim"}">+${x.percent}%</b>${x.status === "learnable" ? `<button class="btn sm" data-graph-skill="${x.target}">Xem chiêu</button>` : ""}</div>`).join("") + "</div>";
  }).join("");
  return `<details class="card" id="skillGraph"><summary>Trục bổ trợ · ${esc(FAC[S.fac].n)}</summary><p class="dim small">Phần trăm dùng cấp kỹ năng hiện tại; chiêu chưa học hiển thị dự kiến cấp 1. Kỹ năng con và đích thiếu không được cộng thêm vào chiêu gốc. Điều kiện vũ khí của nội tại xem trong thông tin kỹ năng.</p>${sections || '<p class="dim">Không có liên kết bổ trợ trong dữ liệu.</p>'}</details>`;
}

{
  const originalLines = skillEffectLines;
  skillEffectLines = function (skill, level) {
    const lines = originalLines(skill, level);
    lines.push(...skillSupportLinks(skill.id, level, S).map(skillSupportText));
    if (!isAttack(skill) && !isCurse(skill)) {
      const wc = weaponCode(S.eq);
      for (const name in skill.attr) {
        if (SKIP_PASSIVE.test(name)) continue;
        const value = skVal(skill, name, level);
        if (value && !passiveApplies(skill, name, value, wc)) {
          lines.push("Một phần nội tại chưa kích hoạt: cần đúng loại vũ khí");
          break;
        }
      }
    }
    return lines;
  };

  // Loaded after jxorig so the original-layout wrapper cannot erase the graph.
  const originalRender = renderSkill;
  renderSkill = function () {
    const result = originalRender.apply(this, arguments);
    const panel = document.getElementById("t-skill");
    if (!panel || !S || !S.fac) return result;
    const old = panel.querySelector("#skillGraph");
    if (old) old.remove();
    panel.insertAdjacentHTML("beforeend", skillGraphHTML());
    panel.querySelectorAll("[data-graph-skill]").forEach(button => {
      button.onclick = () => skillModal(+button.dataset.graphSkill);
    });
    return result;
  };
}
