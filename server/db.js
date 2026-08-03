import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
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
  'Artwork', 'ArtworkLike', 'ArtRequest', 'Award', 'AuditLog', 'BlogPost', 'ChatConversation', 'ChatMessage', 'CommissionRequest', 'FilmRequest', 'InternshipApplication', 'HeroSlide', 'Message', 'NewsletterSubscriber',
  'Media', 'Notification', 'Order', 'Outbox', 'PaymentEvent', 'PartnerApplication', 'PartnerPayout', 'PriceGuide', 'PushSubscription', 'Quote', 'ShopProduct', 'SiteContent',
  'Testimonial', 'User', 'Video',
];
const tokenCollections = ['passwordResetTokens', 'inviteTokens', 'emailVerificationTokens'];
const collectionNames = [...entityNames, ...tokenCollections];
const tableNames = {
  Artwork: 'artworks',
  ArtworkLike: 'artwork_likes',
  ArtRequest: 'art_requests',
  Award: 'awards',
  AuditLog: 'audit_logs',
  BlogPost: 'blog_posts',
  ChatConversation: 'chat_conversations',
  ChatMessage: 'chat_messages',
  CommissionRequest: 'commission_requests',
  FilmRequest: 'film_requests',
  InternshipApplication: 'internship_applications',
  HeroSlide: 'hero_slides',
  Message: 'messages',
  Media: 'media_assets',
  NewsletterSubscriber: 'newsletter_subscribers',
  Notification: 'notifications',
  Order: 'orders',
  Outbox: 'email_outbox',
  PaymentEvent: 'payment_events',
  PartnerApplication: 'partner_applications',
  PartnerPayout: 'partner_payouts',
  PriceGuide: 'price_guides',
  PushSubscription: 'push_subscriptions',
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

async function applyMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const migrationsDir = path.join(here, 'migrations');
  const files = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
  const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(row => row.version));
  for (const version of files) {
    if (applied.has(version)) continue;
    const sql = await readFile(path.join(migrationsDir, version), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
  }
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
    await applyMigrations(client);
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
          // Serialize state-diff commits across Render instances. The in-process
          // queue below is not sufficient when more than one Node process runs.
          await writer.query("SELECT pg_advisory_xact_lock(hashtext('reigns_atelier_state_write'))");
          for (const name of collectionNames) {
            const table = tableNames[name];
            const before = snapshots.get(name) || new Map();
            const current = new Map((database.data[name] || []).map(record => [record.id, serialize(record)]));
            for (const [id, payload] of current) {
              if (before.get(id) === payload) continue;
              if (!before.has(id)) {
                await writer.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)`, [id, payload]);
                continue;
              }
              const result = await writer.query(
                `UPDATE ${table}
                 SET data = $2::jsonb, updated_at = NOW()
                 WHERE id = $1 AND data = $3::jsonb`,
                [id, payload, before.get(id)],
              );
              if (result.rowCount !== 1) {
                const conflict = new Error(`${name} ${id} changed while this request was being processed. Please retry.`);
                conflict.status = 409;
                throw conflict;
              }
            }
            for (const [id, previousPayload] of before) {
              if (current.has(id)) continue;
              const result = await writer.query(
                `DELETE FROM ${table} WHERE id = $1 AND data = $2::jsonb`,
                [id, previousPayload],
              );
              if (result.rowCount !== 1) {
                const conflict = new Error(`${name} ${id} changed before it could be deleted. Please retry.`);
                conflict.status = 409;
                throw conflict;
              }
            }
          }
          await writer.query('COMMIT');
          takeSnapshots(database.data);
        } catch (error) {
          await writer.query('ROLLBACK');
          if (error.code === '23505' || error.status === 409) {
            const freshData = await loadPostgresData(writer);
            database.data = freshData;
            takeSnapshots(freshData);
            if (!error.status) {
              error.status = 409;
              error.message = 'This record was created by another request. Refresh and try again.';
            }
          }
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

function syncLocalRecord(name, record) {
  const records = database.data[name];
  const index = records.findIndex(item => item.id === record.id);
  if (index === -1) records.push(record);
  else records[index] = record;
  if (snapshots.has(name)) snapshots.get(name).set(record.id, serialize(record));
}

export async function claimOutboxBatch(limit = 10, leaseMilliseconds = 5 * 60 * 1000) {
  const leaseId = crypto.randomUUID();
  const leaseUntil = new Date(Date.now() + leaseMilliseconds).toISOString();
  if (!postgresPool) {
    const due = database.data.Outbox
      .filter(item => (
        item.status === 'pending'
        || (item.status === 'processing' && new Date(item.leaseUntil || 0).getTime() <= Date.now())
      ) && new Date(item.nextAttemptAt || 0).getTime() <= Date.now())
      .slice(0, limit);
    for (const item of due) Object.assign(item, { status: 'processing', leaseId, leaseUntil });
    if (due.length) await save();
    return due.map(item => structuredClone(item));
  }

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, data
       FROM email_outbox
       WHERE (
         data->>'status' = 'pending'
         OR (
           data->>'status' = 'processing'
           AND COALESCE(NULLIF(data->>'leaseUntil', '')::timestamptz, '-infinity') <= NOW()
         )
       )
       AND COALESCE(NULLIF(data->>'nextAttemptAt', '')::timestamptz, '-infinity') <= NOW()
       ORDER BY COALESCE(NULLIF(data->>'nextAttemptAt', '')::timestamptz, created_at)
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [Math.min(50, Math.max(1, Number(limit) || 10))],
    );
    const claimed = [];
    for (const row of result.rows) {
      const record = { ...row.data, status: 'processing', leaseId, leaseUntil };
      await client.query(
        'UPDATE email_outbox SET data = $2::jsonb, updated_at = NOW() WHERE id = $1',
        [row.id, serialize(record)],
      );
      claimed.push(record);
    }
    await client.query('COMMIT');
    for (const record of claimed) syncLocalRecord('Outbox', record);
    return claimed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function completeOutboxRecord(id, leaseId, changes) {
  const current = database.data.Outbox.find(item => item.id === id);
  if (!current || current.leaseId !== leaseId) return false;
  const record = { ...current, ...changes };
  delete record.leaseId;
  delete record.leaseUntil;
  if (!postgresPool) {
    syncLocalRecord('Outbox', record);
    await save();
    return true;
  }
  const result = await postgresPool.query(
    `UPDATE email_outbox
     SET data = $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND data->>'leaseId' = $2
     RETURNING data`,
    [id, leaseId, serialize(record)],
  );
  if (!result.rowCount) return false;
  syncLocalRecord('Outbox', result.rows[0].data);
  return true;
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
