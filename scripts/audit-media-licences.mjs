import 'dotenv/config';
import { db, closeDatabase } from '../server/db.js';

const strict = process.argv.includes('--strict');
const collections = {
  Artwork: ['imageUrl'],
  HeroSlide: ['imageUrl'],
  Video: ['videoUrl', 'thumbnailUrl'],
  ShopProduct: ['imageUrl'],
  BlogPost: ['coverImageUrl'],
};
const report = [];

for (const [collection, fields] of Object.entries(collections)) {
  for (const record of db.data[collection] || []) {
    for (const field of fields) {
      const url = record[field];
      if (!url) continue;
      const original = record.contentStatus === 'original' || record.sourceType === 'original';
      const licensed = original || Boolean(record.sourceName && record.licenseUrl && record.licenseVerifiedAt);
      report.push({
        collection,
        id: record.id,
        title: record.title || record.name || '',
        field,
        url,
        sourceName: record.sourceName || '',
        licenseUrl: record.licenseUrl || '',
        licenseVerifiedAt: record.licenseVerifiedAt || '',
        status: licensed ? 'verified' : 'unverified',
      });
    }
  }
}

const unverified = report.filter(item => item.status === 'unverified');
process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  assets: report.length,
  verified: report.length - unverified.length,
  unverified: unverified.length,
  records: report,
}, null, 2)}\n`);
await closeDatabase();
if (strict && unverified.length) process.exitCode = 1;
