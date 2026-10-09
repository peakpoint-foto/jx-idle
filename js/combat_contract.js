"use strict";

const COMBAT_MODEL_VERSION = "jx-combat-v3"; // 3.4: thêm aggro, vai trò tank/support
const COMBAT_EVENT_KINDS = Object.freeze(["damage", "heal", "mana", "control", "death", "phase", "objective"]);

function combatModelDescriptor() {
  return { version: COMBAT_MODEL_VERSION, snapshotVersion: 1,
    elements: ELEM.slice(), events: COMBAT_EVENT_KINDS.slice(),
    critMultiplier: CRIT_MULT, skillLevelBonusCap: SKILL_LV_MAX };
}

// Shared status tick used by combat and the fixed-condition training runner.
// Clamp the last DOT tick to remaining duration, never pay an expired full step.
function tickEnemyStatuses(enemy,dt) {
  if(!Number.isFinite(dt)||dt<0)throw new Error("Invalid combat step");
  let healed=0,raw=0,useful=0;
  if(enemy.regen && enemy.hp>0) {
    const before=enemy.hp;enemy.hp=Math.min(enemy.max,enemy.hp+enemy.max*enemy.regen*dt);healed=enemy.hp-before;
  }
  if(enemy.poison>0 && enemy.hp>0) {
    const elapsed=Math.min(dt,enemy.poison);raw=Math.max(0,enemy.poisonDmg||0)*elapsed;
    useful=Math.min(raw,Math.max(0,enemy.hp));enemy.hp-=raw;enemy.poison=Math.max(0,enemy.poison-elapsed);
  }
  return {raw,useful,healed};
}

// Diagnostic event contract. This is not validation of a client-reported result:
// an authoritative session must calculate its own amounts and publish receipts.
function combatEvent(kind, data) {
  if (!COMBAT_EVENT_KINDS.includes(kind) || !data || !isMode(data.mode)) throw new Error("Invalid combat event");
  const at = Number(data.at);
  if (!Number.isFinite(at) || at < 0) throw new Error("Invalid event time");
  const event = { version: COMBAT_MODEL_VERSION, kind, mode: data.mode, at };
  for (const key of ["sourceId", "targetId", "skillId", "element", "reason"]) {
    if (data[key] != null) event[key] = String(data[key]).slice(0, 100);
  }
  if (kind === "damage" || kind === "heal" || kind === "mana") {
    const raw = Number(data.raw), capacity = Number(data.capacity);
    if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(capacity) || capacity < 0) throw new Error("Invalid combat amount");
    event.raw = raw;
    event.useful = Math.min(raw, capacity);
    event.excess = raw - event.useful;
  } else if (kind === "control") {
    const duration = Number(data.duration);
    if (!Number.isFinite(duration) || duration < 0) throw new Error("Invalid control duration");
    event.duration = duration;
  } else if (kind === "objective") {
    for (const key of ["phase", "count"]) if (data[key] != null) {
      const value = Number(data[key]);if(!Number.isSafeInteger(value)||value<0||value>1000)throw new Error("Invalid objective progress");event[key]=value;
    }
  }
  return event;
}
