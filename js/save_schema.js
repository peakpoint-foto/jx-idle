"use strict";

// Read after save.js, before main.js. Versioned extension state is separate from
// legacy combat/inventory data; later tasks must explicitly migrate their fields.
function saveSchemaVersion(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Bản lưu không hợp lệ");
  const version = state.v == null ? 1 : Number(state.v);
  if (!Number.isInteger(version) || version < 1) throw new Error("Phiên bản bản lưu không hợp lệ");
  if (version > SAVE_V) throw new Error("Bản lưu thuộc phiên bản mới hơn; hãy cập nhật game trước khi nạp");
  return version;
}

function migrateSaveSchema(state) {
  saveSchemaVersion(state);
  // Never mutate the caller's export/backup, even when a later migration fails.
  const copy = JSON.parse(JSON.stringify(state));
  const extensions = copy.extensions;
  if (extensions != null && (typeof extensions !== "object" || Array.isArray(extensions)))
    throw new Error("Dữ liệu mở rộng của bản lưu không hợp lệ");
  if (extensions && extensions.v !== 1) throw new Error("Phiên bản dữ liệu mở rộng chưa được hỗ trợ");
  copy.extensions = extensions || { v: 1 };
  // Migration wave (1.4): save mới lẫn save cũ nhiều version đều đi qua đây.
  if (typeof runSaveWaves === "function") runSaveWaves(copy);
  copy.v = SAVE_V;
  return copy;
}

function preservePreMigrationSlot(slot) {
  if (ADMV.sandbox) return;
  const key = slotKey(slot);
  let raw = localStorage.getItem(key);
  let decoded;
  try { decoded = raw && unpack(raw); } catch (e) { decoded = null; }
  if (!decoded || !decoded.ok || !decoded.state) {
    raw = localStorage.getItem(key + "_bak");
    if (!raw) return;
    try { decoded = unpack(raw); } catch (e) { return; }
    if (!decoded || !decoded.ok || !decoded.state) return;
  }
  migrateSaveSchema(decoded.state);
  const version = saveSchemaVersion(decoded.state);
  if (version >= SAVE_V) return;
  const backupKey = key + "_pre_v" + SAVE_V;
  if (localStorage.getItem(backupKey) == null) localStorage.setItem(backupKey, raw);
}

{
  const previousMigrate = migrate;
  migrate = function (state) { return previousMigrate(migrateSaveSchema(state)); };
  const previousNewSave = newSave;
  newSave = function () { return migrateSaveSchema(previousNewSave()); };

  const previousLoad = load;
  load = function () {
    try {
      const raw = localStorage.getItem(saveKey());
      if (raw) {
        let decoded;
        try { decoded = unpack(raw); } catch (e) { decoded = null; }
        if (decoded && decoded.ok) migrateSaveSchema(decoded.state);
      }
      preservePreMigrationSlot(SLOT);
    } catch (e) {
      // Do not let old clients sanitize a future save or overwrite it with a new
      // character when a migration backup cannot be written.
      SAVE_LOCK = true;
      S = newSave();
      window.__saveBlocked = e.message;
      if (typeof toast === "function") toast(e.message);
      return false;
    }
    return previousLoad();
  };

  const previousWriteSlot = writeSlot;
  writeSlot = function (slot, state) {
    if (ADMV.sandbox) throw new Error("Không thay bản lưu trong phiên thử nghiệm");
    saveSchemaVersion(state);
    preservePreMigrationSlot(slot);
    return previousWriteSlot(slot, state);
  };
  const previousImportSave = importSave;
  importSave = function (text) {
    if (ADMV.sandbox) throw new Error("Không nhập bản lưu trong phiên thử nghiệm");
    // Validate before previousImportSave can replace S or call save().
    const incoming = unpack(decodeURIComponent(escape(atob(String(text).trim()))));
    if (!incoming.ok) throw new Error("Mã đã bị chỉnh sửa (sai chữ ký)");
    migrateSaveSchema(incoming.state);
    preservePreMigrationSlot(SLOT);
    return previousImportSave(text);
  };
}
