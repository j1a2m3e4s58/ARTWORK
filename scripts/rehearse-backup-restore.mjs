import 'dotenv/config';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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
if (!process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY.length < 32) {
  process.stderr.write('Set BACKUP_ENCRYPTION_KEY to a separate random secret containing at least 32 characters.\n');
  process.exit(1);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'atelier-restore-'));
const archive = path.join(tempDir, 'atelier.dump');
const encryptedArchive = path.join(tempDir, 'atelier.dump.enc');
const restoreArchive = path.join(tempDir, 'atelier.restore.dump');
const command = name => process.platform === 'win32' ? `${name}.exe` : name;
try {
  const dump = spawnSync(command('pg_dump'), ['--format=custom', '--no-owner', '--file', archive, process.env.DATABASE_URL], { stdio: 'inherit' });
  if (dump.status !== 0) throw new Error('pg_dump failed. Install PostgreSQL client tools and verify database access.');
  const key = createHash('sha256').update(process.env.BACKUP_ENCRYPTION_KEY).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = await readFile(archive);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  await writeFile(encryptedArchive, Buffer.concat([Buffer.from('RAB1'), iv, cipher.getAuthTag(), ciphertext]), { mode: 0o600 });
  await rm(archive, { force: true });
  const encrypted = await readFile(encryptedArchive);
  if (encrypted.subarray(0, 4).toString() !== 'RAB1') throw new Error('Encrypted backup header is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(4, 16));
  decipher.setAuthTag(encrypted.subarray(16, 32));
  await writeFile(restoreArchive, Buffer.concat([decipher.update(encrypted.subarray(32)), decipher.final()]), { mode: 0o600 });
  const restore = spawnSync(command('pg_restore'), [
    '--clean', '--if-exists', '--no-owner', '--dbname', process.env.RESTORE_DATABASE_URL, restoreArchive,
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
  process.stdout.write(`${JSON.stringify({ success: true, encryption: 'AES-256-GCM', encryptedBackupBytes: (await stat(encryptedArchive)).size, sourceTables: sourceMap, restoredTables: restoredMap }, null, 2)}\n`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
