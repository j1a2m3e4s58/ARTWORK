import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSONFilePreset } from 'lowdb/node';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
await mkdir(dataDir, { recursive: true });

const entityNames = [
  'Artwork', 'BlogPost', 'CommissionRequest', 'Message', 'NewsletterSubscriber',
  'Outbox', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'User', 'Video',
];

const defaults = Object.fromEntries(entityNames.map(name => [name, []]));
defaults.passwordResetTokens = [];

export const db = await JSONFilePreset(path.join(dataDir, 'db.json'), defaults);

for (const name of entityNames) {
  if (!Array.isArray(db.data[name])) db.data[name] = [];
}
if (!Array.isArray(db.data.passwordResetTokens)) db.data.passwordResetTokens = [];

export const save = () => db.write();
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
