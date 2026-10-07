"use strict";

// Give legacy and new saves a stable identity independent of their slot number.
{
  const newCharacterId = () => {
    try { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return "c_" + crypto.randomUUID(); } catch (e) {}
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  };
  const legacyNewSave = newSave;
  newSave = function () {
    const state = legacyNewSave();
    if (!/^c_[A-Za-z0-9_-]{8,100}$/.test(String(state.cid || ""))) state.cid = newCharacterId();
    return state;
  };
}

// A stage quest cannot advance beyond the hard stage cap. Convert an existing
// or newly rolled impossible daily quest to a kill fallback; preserve claims.
{
  const legacyDailyQuests = dailyQuests;
  dailyQuests = function (reset) {
    const quests = legacyDailyQuests(reset);
    if (S && S.stage >= STAGE_CAP) {
      for (const quest of quests.list || []) {
        if (quest.k === "stages" && !quest.done) {
          quest.k = "kills";
          quest.t = `Hạ ${150 + S.lvl * 3} quái (thay nhiệm vụ vượt ải ở trần)`;
          quest.need = 150 + S.lvl * 3;
          quest.have = 0;
        }
      }
    }
    return quests;
  };
}

// Replacing/importing a character must not inherit another character's online
// bearer token, even when the slot number is reused.
{
  const legacyWriteSlot = writeSlot;
  writeSlot = function (slot, state) {
    try {
      const old = localStorage.getItem(slotKey(slot));
      const previous = old && unpack(old).state;
      if (previous && previous.cid && state && state.cid && previous.cid !== state.cid) unlinkSlotOnline(slot);
    } catch (e) {}
    return legacyWriteSlot(slot, state);
  };
  const legacyImportSave = importSave;
  importSave = function (text) {
    const previous = S && S.cid;
    legacyImportSave(text);
    if (previous && S && S.cid && previous !== S.cid) unlinkSlotOnline(SLOT);
  };
}
