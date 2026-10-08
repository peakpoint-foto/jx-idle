import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export function auditSkillGraph(data) {
  const skills = data.skills, links = [], malformed = [];
  function containsChild(root, target) {
    const seen = new Set();
    let current = skills[root];
    while (current && current.child && !seen.has(current.id)) {
      seen.add(current.id);
      if (+current.child === target) return true;
      current = skills[current.child];
    }
    return false;
  }
  for (const faction of data.factions) {
    const owned = new Set(faction.skills.map(Number));
    for (const id of owned) {
      const skill = skills[id];
      if (!skill) { malformed.push({ faction: faction.key, source: id, reason: "missing_source" }); continue; }
      for (const [attribute, ranks] of Object.entries(skill.attr || {})) {
        if (!attribute.startsWith("addskilldamage")) continue;
        if (!Array.isArray(ranks) || !ranks.length || ranks.some(row => !Array.isArray(row) || !Number.isInteger(row[0]) || row[0] <= 0 || !Number.isFinite(row[2]) || row[0] !== ranks[0][0])) {
          malformed.push({ faction: faction.key, source: id, attribute, reason: "invalid_rank_data" }); continue;
        }
        const target = ranks[0][0];
        const status = !skills[target] ? "missing" : owned.has(target) ? "learnable" : "existing_outside_faction";
        links.push({ faction: faction.key, source: id, sourceName: skill.n, attribute, target,
          targetName: skills[target]?.n || null, status,
          // These are candidates for review, not automatic remapping or bonuses.
          childOf: status === "existing_outside_faction" ? [...owned].filter(parent => containsChild(parent, target)) : [],
          ranks: ranks.map(row => ({ target: row[0], percent: row[2] })),
        });
      }
    }
  }
  return { total: links.length, learnable: links.filter(x => x.status === "learnable").length,
    existingOutside: links.filter(x => x.status === "existing_outside_faction").length,
    missing: links.filter(x => x.status === "missing").length, malformed, links };
}

export function loadSkillData() {
  const file = fileURLToPath(new URL("../data.js", import.meta.url));
  const source = fs.readFileSync(file, "utf8"), context = { window: {} };
  vm.runInNewContext(source, context, { filename: file, timeout: 10000 });
  return { data: context.window.JX, sha256: crypto.createHash("sha256").update(source).digest("hex") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { data, sha256 } = loadSkillData();
  const report = auditSkillGraph(data);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ dataSha256: sha256, ...report }, null, 2));
  else {
    console.log(`Skill graph: ${report.total} links; ${report.learnable} learnable; ${report.existingOutside} existing outside faction; ${report.missing} missing; ${report.malformed.length} malformed.`);
    for (const link of report.links.filter(x => x.status !== "learnable")) console.log(`${link.faction}: ${link.source} (${link.sourceName}) -> ${link.target}: ${link.status}${link.childOf.length ? `; child of ${link.childOf.join(",")}` : ""}`);
    console.log(`data.js sha256: ${sha256}`);
  }
  // Reporting stays usable while legacy issues exist; strict is an explicit release gate.
  if (process.argv.includes("--strict") && (report.missing || report.malformed.length)) process.exitCode = 1;
}
