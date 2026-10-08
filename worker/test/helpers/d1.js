// Execute real SQLite SQL with D1-shaped results and transactional batch.
// This checks SQL invariants locally, not Cloudflare transport/production latency.
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/db.js";

export async function localD1({initialSql=""}={}) {
  if (process.env.JX_D1_RUNTIME === "1") {
    const runtime = await import("miniflare");
    const options={ modules:true,script:"export default {fetch(){return new Response('local test')}}",
      d1Databases:{DB:"jx-local-test"},compatibilityDate:"2025-09-01",cf:false };
    const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
    try {
      const binding=await mf.getD1Database("DB");
      const db={prepare:binding.prepare.bind(binding),batch:binding.batch.bind(binding),close:()=>mf.dispose()};
      if(initialSql)await db.batch(initialSql.split(";").map(sql=>sql.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
      await ensureSchema(db);return db;
    } catch (e) { await mf.dispose();throw e; }
  }
  const sqlite = new DatabaseSync(":memory:");
  if(initialSql)sqlite.exec(initialSql);
  function prepare(sql, values = []) {
    function execute(kind) {
      const bindings = [];
      const normalized = sql.replace(/\?(\d+)/g, (_, n) => { bindings.push(values[+n-1]); return "?"; });
      const stmt = sqlite.prepare(normalized);
      if (kind === "first") return stmt.get(...bindings) || null;
      if (kind === "all") return { results: stmt.all(...bindings), success: true };
      const result = stmt.run(...bindings);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    }
    return { bind(...args) { return prepare(sql,args); },
      async first() { return execute("first"); }, async all() { return execute("all"); },
      async run() { return execute("run"); }, execute };
  }
  const db = { prepare, async batch(statements) {
    sqlite.exec("BEGIN IMMEDIATE");
    try { const results=statements.map(s=>s.execute("run")); sqlite.exec("COMMIT"); return results; }
    catch (e) { sqlite.exec("ROLLBACK"); throw e; }
  }, close() { sqlite.close(); } };
  await ensureSchema(db);
  return db;
}
