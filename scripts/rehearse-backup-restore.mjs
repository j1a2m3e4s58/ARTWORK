import 'dotenv/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

if (!process.env.DATABASE_URL || !process.env.RESTORE_DATABASE_URL) {
  process.stderr.write('Set DATABASE_URL and a separate, disposable RESTORE_DATABASE_URL. Production data is never restored in place.\n');
  process.exit(1);
}
if (process.env.DATABASE_URL === process.env.RESTORE_DATABASE_URL) {
  process.stderr.write('RESTORE_DATABASE_URL must point to a separate disposable database.\n');
  process.exit(1);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'atelier-restore-'));
const archive = path.join(tempDir, 'atelier.dump');
const command = name => process.platform === 'win32' ? `${name}.exe` : name;
try {
  const dump = spawnSync(command('pg_dump'), ['--format=custom', '--no-owner', '--file', archive, process.env.DATABASE_URL], { stdio: 'inherit' });
  if (dump.status !== 0) throw new Error('pg_dump failed. Install PostgreSQL client tools and verify database access.');
  const restore = spawnSync(command('pg_restore'), [
    '--clean', '--if-exists', '--no-owner', '--dbname', process.env.RESTORE_DATABASE_URL, archive,
  ], { stdio: 'inherit' });
  if (restore.status !== 0) throw new Error('pg_restore failed.');
  const source = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  const restored = new pg.Client({ connectionString: process.env.RESTORE_DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await Promise.all([source.connect(), restored.connect()]);
  const countSql = `SELECT relname, n_live_tup::bigint AS rows FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`;
  const [sourceCounts, restoredCounts] = await Promise.all([source.query(countSql), restored.query(countSql)]);
  await Promise.all([source.end(), restored.end()]);
  const sourceMap = Object.fromEntries(sourceCounts.rows.map(row => [row.relname, Number(row.rows)]));
  const restoredMap = Object.fromEntries(restoredCounts.rows.map(row => [row.relname, Number(row.rows)]));
  const missingTables = Object.keys(sourceMap).filter(table => !(table in restoredMap));
  if (missingTables.length) throw new Error(`Restored database is missing tables: ${missingTables.join(', ')}`);
  process.stdout.write(`${JSON.stringify({ success: true, sourceTables: sourceMap, restoredTables: restoredMap }, null, 2)}\n`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
