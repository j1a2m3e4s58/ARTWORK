import 'dotenv/config';
import { db, save, closeDatabase } from '../server/db.js';

const apply = process.argv.includes('--apply');
const replacements = new Map([
  ['stat_artworks', new Map([['350+', '—']])],
  ['stat_clients', new Map([['180+', '—']])],
  ['stat_years', new Map([['8', '—']])],
  ['stat_awards', new Map([['12', '—']])],
  ['about_timeline', new Map([[
    '2016|First sketchbook — drawing obsessively since childhood becomes a craft\n2018|First paid commission at 17 — a portrait that changed everything\n2020|Went fully digital — mastered Procreate and the Wacom tablet universe\n2022|Opened Reigns Atelier — turned passion into a professional studio\n2023|100+ commissions completed across 20 countries\n2025|First gallery exhibition — "Shadows & Lines" in Nairobi',
    '',
  ]])],
  ['about_skills', new Map([[
    'Pencil & Charcoal|97\nDigital Illustration|93\nOil & Acrylic|85\nWatercolor|80\nInk Drawing|90\nPortrait Study|95',
    '',
  ]])],
]);

const updates = [];
for (const record of db.data.SiteContent || []) {
  const replacement = replacements.get(record.key)?.get(String(record.value));
  if (replacement === undefined) continue;
  updates.push({ record, from: record.value, to: replacement });
}

process.stdout.write(`${apply ? 'Applying' : 'Dry run:'} ${updates.length} unverified content replacement(s).\n`);
for (const update of updates) process.stdout.write(`${update.record.page || 'Settings'}.${update.record.key}\n`);

if (apply && updates.length) {
  const timestamp = new Date().toISOString();
  for (const update of updates) {
    update.record.value = update.to;
    update.record.updated_date = timestamp;
  }
  await save();
  process.stdout.write('Unverified starter claims were replaced without changing administrator-authored values.\n');
}

await closeDatabase();
