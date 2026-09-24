import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.MIGRATION_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  throw new Error("DATABASE_URL and MIGRATION_DATABASE_URL are required.");
}
if (sourceUrl === targetUrl) {
  throw new Error("Source and target databases must be different.");
}

const source = new pg.Client({
  connectionString: sourceUrl,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});
const target = new pg.Client({ connectionString: targetUrl, ssl: false });
const quoteIdentifier = value => '"' + String(value).replaceAll('"', '""') + '"';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");
const tableSql = "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = $2";

await Promise.all([source.connect(), target.connect()]);
try {
  await target.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const migrations = (await readdir(migrationsDir)).filter(name => name.endsWith(".sql")).sort();
  const applied = new Set((await target.query("SELECT version FROM schema_migrations")).rows.map(row => row.version));
  for (const version of migrations) {
    if (applied.has(version)) continue;
    await target.query(await readFile(path.join(migrationsDir, version), "utf8"));
    await target.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [version]);
  }

  const sourceTables = new Set((await source.query(tableSql, ["public", "BASE TABLE"])).rows.map(row => row.table_name));
  const tables = (await target.query(tableSql, ["public", "BASE TABLE"])).rows
    .map(row => row.table_name)
    .filter(name => name !== "schema_migrations");
  if (tables.length < 30) throw new Error(`Target schema is incomplete: only ${tables.length} data tables.`);
  for (const table of tables) {
    if (!sourceTables.has(table)) throw new Error(`Source is missing target table: ${table}`);
  }

  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await source.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["reigns_atelier_state_write"]);
  await target.query("BEGIN");
  try {
    await target.query("TRUNCATE TABLE " + tables.map(quoteIdentifier).join(", ") + " CASCADE");
    const expected = new Map();
    for (const table of tables) {
      const rows = (await source.query("SELECT * FROM " + quoteIdentifier(table))).rows;
      expected.set(table, rows.length);
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, index) => "$" + (index + 1));
        await target.query(
          "INSERT INTO " + quoteIdentifier(table) + " (" + columns.map(quoteIdentifier).join(", ") + ") VALUES (" + placeholders.join(", ") + ")",
          columns.map(column => row[column]),
        );
      }
    }
    for (const table of tables) {
      const count = Number((await target.query("SELECT COUNT(*) AS count FROM " + quoteIdentifier(table))).rows[0].count);
      if (count !== expected.get(table)) throw new Error(`Row-count mismatch for ${table}: ${expected.get(table)} != ${count}`);
    }
    await target.query("COMMIT");
    await source.query("COMMIT");
    const rows = [...expected.values()].reduce((sum, count) => sum + count, 0);
    process.stdout.write(JSON.stringify({ success: true, tables: tables.length, rows }) + "\n");
  } catch (error) {
    await target.query("ROLLBACK").catch(() => {});
    await source.query("ROLLBACK").catch(() => {});
    throw error;
  }
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
