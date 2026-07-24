import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSONFilePreset } from 'lowdb/node';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(here, 'data');
const backupDir = path.join(dataDir, 'backups');
await mkdir(dataDir, { recursive: true });
await mkdir(backupDir, { recursive: true });
const databasePath = path.join(dataDir, 'db.json');

const entityNames = [
  'Artwork', 'ArtworkLike', 'AuditLog', 'BlogPost', 'CommissionRequest', 'HeroSlide', 'Message', 'NewsletterSubscriber',
  'Media', 'Notification', 'Order', 'Outbox', 'PaymentEvent', 'Quote', 'ShopProduct', 'SiteContent',
  'Testimonial', 'User', 'Video',
];
const tokenCollections = ['passwordResetTokens', 'inviteTokens', 'emailVerificationTokens'];
const collectionNames = [...entityNames, ...tokenCollections];
const tableNames = {
  Artwork: 'artworks',
  ArtworkLike: 'artwork_likes',
  AuditLog: 'audit_logs',
  BlogPost: 'blog_posts',
  CommissionRequest: 'commission_requests',
  HeroSlide: 'hero_slides',
  Message: 'messages',
  Media: 'media_assets',
  NewsletterSubscriber: 'newsletter_subscribers',
  Notification: 'notifications',
  Order: 'orders',
  Outbox: 'email_outbox',
  PaymentEvent: 'payment_events',
  Quote: 'quotes',
  ShopProduct: 'shop_products',
  SiteContent: 'site_content',
  Testimonial: 'testimonials',
  User: 'users',
  Video: 'videos',
  passwordResetTokens: 'password_reset_tokens',
  inviteTokens: 'invite_tokens',
  emailVerificationTokens: 'email_verification_tokens',
};

const defaults = Object.fromEntries(collectionNames.map(name => [name, []]));
let postgresPool = null;
let database;
let snapshots = new Map();

const serialize = value => JSON.stringify(value);

async function createRelationalSchema(client) {
  for (const table of Object.values(tableNames)) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id UUID PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ${table}_updated_at_idx ON ${table} (updated_at DESC)`);
  }
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(data->>\'email\'))');
  await client.query('CREATE INDEX IF NOT EXISTS messages_user_idx ON messages ((data->>\'userId\'))');
  await client.query('CREATE INDEX IF NOT EXISTS media_owner_idx ON media_assets ((data->>\'userId\'))');
  await client.query('CREATE INDEX IF NOT EXISTS commissions_user_idx ON commission_requests ((data->>\'userId\'))');
  await client.query('CREATE INDEX IF NOT EXISTS orders_user_idx ON orders ((data->>\'userId\'))');
  await client.query('CREATE INDEX IF NOT EXISTS orders_payment_reference_idx ON orders ((data->>\'paymentReference\'))');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_id_idx ON payment_events ((data->>\'providerEventId\'))');
  await client.query('CREATE INDEX IF NOT EXISTS site_content_key_idx ON site_content ((data->>\'key\'))');
}

async function importLegacySingleton(client) {
  const legacy = await client.query("SELECT to_regclass('public.atelier_state') AS name");
  if (!legacy.rows[0]?.name) return;
  const total = await client.query(
    `SELECT ${Object.values(tableNames).map(table => `(SELECT COUNT(*) FROM ${table})`).join(' + ')} AS total`,
  );
  if (Number(total.rows[0]?.total || 0) > 0) return;
  const result = await client.query('SELECT data FROM atelier_state WHERE id = 1');
  const legacyData = result.rows[0]?.data;
  if (!legacyData) return;
  for (const name of collectionNames) {
    const table = tableNames[name];
    for (const record of legacyData[name] || []) {
      if (!record.id) continue;
      await client.query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`,
        [record.id, serialize(record)],
      );
    }
  }
}

async function loadPostgresData(client) {
  const data = structuredClone(defaults);
  for (const name of collectionNames) {
    const result = await client.query(`SELECT data FROM ${tableNames[name]} ORDER BY created_at ASC`);
    data[name] = result.rows.map(row => row.data);
  }
  return data;
}

function takeSnapshots(data) {
  snapshots = new Map(collectionNames.map(name => [
    name,
    new Map((data[name] || []).map(record => [record.id, serialize(record)])),
  ]));
}

if (process.env.DATABASE_URL) {
  postgresPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
  });
  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');
    await createRelationalSchema(client);
    await importLegacySingleton(client);
    await client.query('COMMIT');
    const data = await loadPostgresData(client);
    takeSnapshots(data);
    database = {
      data,
      async write() {
        const writer = await postgresPool.connect();
        try {
          await writer.query('BEGIN');
          for (const name of collectionNames) {
            const table = tableNames[name];
            const before = snapshots.get(name) || new Map();
            const current = new Map((database.data[name] || []).map(record => [record.id, serialize(record)]));
            for (const [id, payload] of current) {
              if (before.get(id) === payload) continue;
              await writer.query(
                `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)
                 ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
                [id, payload],
              );
            }
            for (const id of before.keys()) {
              if (!current.has(id)) await writer.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
            }
          }
          await writer.query('COMMIT');
          takeSnapshots(database.data);
        } catch (error) {
          await writer.query('ROLLBACK');
          throw error;
        } finally {
          writer.release();
        }
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} else {
  database = await JSONFilePreset(databasePath, defaults);
}

export const db = database;
export const databaseKind = postgresPool ? 'postgresql-relational' : 'json-development';
export const closeDatabase = () => postgresPool?.end() || Promise.resolve();
export const checkDatabase = async () => {
  if (!postgresPool) return { ok: true, kind: databaseKind };
  const result = await postgresPool.query('SELECT 1 AS ok');
  return { ok: result.rows[0]?.ok === 1, kind: databaseKind };
};
export const hasRelationalDatabase = Boolean(postgresPool);

export async function queryCollection(name, { filters = {}, sort = '-created_date', limit = 50, offset = 0, includeDeleted = false } = {}) {
  if (!postgresPool || !tableNames[name]) return null;
  const values = [];
  const where = [];
  if (!includeDeleted) where.push("COALESCE(data->>'deleted_at', '') = ''");
  for (const [key, value] of Object.entries(filters)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) continue;
    values.push(key, String(value));
    where.push(`data ->> $${values.length - 1} = $${values.length}`);
  }
  const descending = String(sort).startsWith('-');
  const sortKey = String(sort).replace(/^-/, '');
  const safeSort = /^[A-Za-z][A-Za-z0-9_]*$/.test(sortKey) ? sortKey : 'created_date';
  values.push(safeSort, Math.min(200, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0));
  const sortParam = values.length - 2;
  const limitParam = values.length - 1;
  const offsetParam = values.length;
  const table = tableNames[name];
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [records, count] = await Promise.all([
    postgresPool.query(
      `SELECT data FROM ${table} ${condition}
       ORDER BY COALESCE(data ->> $${sortParam}, '') ${descending ? 'DESC' : 'ASC'}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      values,
    ),
    postgresPool.query(`SELECT COUNT(*)::int AS total FROM ${table} ${condition}`, values.slice(0, values.length - 3)),
  ]);
  return { records: records.rows.map(row => row.data), total: count.rows[0]?.total || 0 };
}

for (const name of collectionNames) {
  if (!Array.isArray(db.data[name])) db.data[name] = [];
}

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
