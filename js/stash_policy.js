"use strict";

const ITEM_POLICY_VERSION = 1;
if (typeof newSave === "function") {
  const legacyNewSave = newSave;
  newSave = function (...args) {
    const state = legacyNewSave.apply(this, args);
    state.itemPolicyV = ITEM_POLICY_VERSION;
    return state;
  };
}
if (typeof migrate === "function") {
  const legacyMigrate = migrate;
  migrate = function (...args) {
    const state = legacyMigrate.apply(this, args);
    state.itemPolicyV = ITEM_POLICY_VERSION;
    return state;
  };
}

// Apply item migrations to the shared stash as well as character saves.
// stash.js is intentionally kept as a legacy single-file module, so this
// adapter runs after it has defined stashRead and before any UI can use it.
if (typeof stashRead === "function" && typeof normalizeElementSkillItem === "function") {
  const readStash = stashRead;
  stashRead = function (...args) {
    const result = readStash.apply(this, args);
    for (const item of result && result.st && result.st.items || [])
      normalizeElementSkillItem(item);
    return result;
  };
}

if (typeof stashWrite === "function" && typeof normalizeElementSkillItem === "function") {
  const writeStash = stashWrite;
  stashWrite = function (stash) {
    for (const item of stash && stash.items || []) normalizeElementSkillItem(item);
    return writeStash.apply(this, arguments);
  };
}
