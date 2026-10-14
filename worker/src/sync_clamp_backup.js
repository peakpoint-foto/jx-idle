const MAX_PER_ACCOUNT = 3;
const RETAIN_MS = 30 * 864e5;

/** Lưu bản save client trước khi server clamp; giữ tối đa 3/account, xóa >30 ngày. */
export async function storeSyncClampBackup(db, accountId, save, reason, now = Date.now()) {
  const snapshot = typeof save === "string" ? save : JSON.stringify(save);
  const bytes = new TextEncoder().encode(snapshot).byteLength;
  const cutoff = now - RETAIN_MS;
  await db.prepare("DELETE FROM sync_clamp_backups WHERE created_at<?1").bind(cutoff).run();
  await db
    .prepare(
      "INSERT INTO sync_clamp_backups(account_id,created_at,reason,snapshot,bytes) VALUES(?1,?2,?3,?4,?5)"
    )
    .bind(String(accountId), now, String(reason).slice(0, 64), snapshot, bytes)
    .run();
  const rows = await db
    .prepare("SELECT id FROM sync_clamp_backups WHERE account_id=?1 ORDER BY created_at DESC, id DESC")
    .bind(accountId)
    .all();
  const stale = (rows.results || []).slice(MAX_PER_ACCOUNT);
  if (stale.length) {
    await db.batch(stale.map(r => db.prepare("DELETE FROM sync_clamp_backups WHERE id=?1").bind(r.id)));
  }
  return { bytes };
}
