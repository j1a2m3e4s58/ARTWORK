import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSONFilePreset } from 'lowdb/node';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
const backupDir = path.join(dataDir, 'backups');
await mkdir(dataDir, { recursive: true });
await mkdir(backupDir, { recursive: true });
const databasePath = path.join(dataDir, 'db.json');

const entityNames = [
  'Artwork', 'ArtworkLike', 'AuditLog', 'BlogPost', 'CommissionRequest', 'Message', 'NewsletterSubscriber',
  'Notification', 'Order', 'Outbox', 'Quote', 'ShopProduct', 'SiteContent',
  'Testimonial', 'User', 'Video',
];

const defaults = Object.fromEntries(entityNames.map(name => [name, []]));
defaults.passwordResetTokens = [];
defaults.inviteTokens = [];
defaults.emailVerificationTokens = [];

let postgresPool = null;
let database;

if (process.env.DATABASE_URL) {
  postgresPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_SIZE || 5),
  });
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS atelier_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await postgresPool.query(
    `INSERT INTO atelier_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(defaults)],
  );
  const result = await postgresPool.query('SELECT data FROM atelier_state WHERE id = 1');
  database = {
    data: result.rows[0].data,
    async write() {
      await postgresPool.query(
        'UPDATE atelier_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(database.data)],
      );
    },
  };
} else {
  database = await JSONFilePreset(databasePath, defaults);
}

export const db = database;
export const databaseKind = postgresPool ? 'postgresql' : 'json-development';
export const closeDatabase = () => postgresPool?.end() || Promise.resolve();

for (const name of entityNames) {
  if (!Array.isArray(db.data[name])) db.data[name] = [];
}
if (!Array.isArray(db.data.passwordResetTokens)) db.data.passwordResetTokens = [];
if (!Array.isArray(db.data.inviteTokens)) db.data.inviteTokens = [];
if (!Array.isArray(db.data.emailVerificationTokens)) db.data.emailVerificationTokens = [];

let writeQueue = Promise.resolve();
export const save = () => {
  writeQueue = writeQueue.then(() => db.write());
  return writeQueue;
};
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export async function backupDatabase({ force = false } = {}) {
  if (postgresPool) return null;
  try {
    const info = await stat(databasePath);
    const backups = (await readdir(backupDir)).filter(name => name.endsWith('.json')).sort();
    const latest = backups.at(-1);
    if (!force && latest) {
      const latestInfo = await stat(path.join(backupDir, latest));
      if (Date.now() - latestInfo.mtimeMs < 24 * 60 * 60 * 1000) return null;
    }
    const stamp = new Date(info.mtimeMs || Date.now()).toISOString().replace(/[:.]/g, '-');
    const destination = path.join(backupDir, `db-${stamp}.json`);
    await copyFile(databasePath, destination);
    const updated = (await readdir(backupDir)).filter(name => name.endsWith('.json')).sort();
    await Promise.all(updated.slice(0, -14).map(name => rm(path.join(backupDir, name))));
    return destination;
  } catch {
    return null;
  }
}

await backupDatabase();
