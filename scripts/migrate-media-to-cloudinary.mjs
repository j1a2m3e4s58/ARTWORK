import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, save, closeDatabase } from '../server/db.js';

const apply = process.argv.includes('--apply');
const fieldsByCollection = {
  Artwork: ['imageUrl'],
  HeroSlide: ['imageUrl'],
  Video: ['videoUrl', 'thumbnailUrl'],
  ShopProduct: ['imageUrl'],
  BlogPost: ['imageUrl'],
};
const isRemoteLegacyUrl = value => /^https?:\/\//i.test(value || '') && !/\.cloudinary\.com\//i.test(value);
const candidates = [];

for (const [collection, fields] of Object.entries(fieldsByCollection)) {
  for (const record of db.data[collection] || []) {
    for (const field of fields) {
      if (isRemoteLegacyUrl(record[field])) candidates.push({ collection, record, field, url: record[field] });
    }
  }
}

if (!apply) {
  process.stdout.write(`Dry run: ${candidates.length} external media asset(s) can be migrated.\n`);
  for (const item of candidates) process.stdout.write(`${item.collection} ${item.record.id} ${item.field}: ${item.url}\n`);
  process.stdout.write('Set Cloudinary credentials and rerun with --apply to upload and update records.\n');
  await closeDatabase();
  process.exit(0);
}

const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  process.stderr.write(`Missing required Cloudinary variables: ${missing.join(', ')}\n`);
  await closeDatabase();
  process.exit(1);
}
process.env.STORAGE_PROVIDER = 'cloudinary';
const { storeFile } = await import('../server/storage.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
let migrated = 0;
try {
  for (const item of candidates) {
    const response = await fetch(item.url, { redirect: 'follow', signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`Download failed (${response.status}) for ${item.url}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 50 * 1024 * 1024) throw new Error(`Asset exceeds 50 MB: ${item.url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 50 * 1024 * 1024) throw new Error(`Asset exceeds 50 MB: ${item.url}`);
    const mime = response.headers.get('content-type')?.split(';')[0] || (item.field === 'videoUrl' ? 'video/mp4' : 'image/jpeg');
    const extension = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || 'bin';
    const stored = await storeFile({
      buffer,
      mime,
      extension,
      uploadDir: scriptDir,
      id: `${item.collection.toLowerCase()}-${item.record.id}-${item.field.toLowerCase()}`,
    });
    item.record[`${item.field}SourceUrl`] = item.url;
    item.record[item.field] = stored.url;
    item.record[`${item.field}CloudinaryPublicId`] = stored.publicId;
    item.record.updated_date = new Date().toISOString();
    await save();
    migrated += 1;
    process.stdout.write(`Migrated ${migrated}/${candidates.length}: ${item.collection}.${item.field}\n`);
  }
} finally {
  await closeDatabase();
}

process.stdout.write(`Cloudinary migration complete: ${migrated} asset(s).\n`);
