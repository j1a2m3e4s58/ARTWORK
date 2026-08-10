import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';

const envPath = path.resolve(process.cwd(), '.env');
const source = await fs.readFile(envPath, 'utf8').catch(() => '');
const lines = source ? source.replace(/\r\n/g, '\n').split('\n') : [];
const values = new Map();
for (const line of lines) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

const setValue = (name, value) => {
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (index >= 0) lines[index] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
  values.set(name, value);
};

const hasPublic = Boolean(values.get('VAPID_PUBLIC_KEY'));
const hasPrivate = Boolean(values.get('VAPID_PRIVATE_KEY'));
if (hasPublic !== hasPrivate) {
  throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must either both be set or both be empty.');
}
if (!hasPublic) {
  const generated = webpush.generateVAPIDKeys();
  setValue('VAPID_PUBLIC_KEY', generated.publicKey);
  setValue('VAPID_PRIVATE_KEY', generated.privateKey);
}
if (!values.get('VAPID_SUBJECT')) {
  const email = String(values.get('ADMIN_EMAIL') || '').trim();
  setValue('VAPID_SUBJECT', email ? `mailto:${email}` : 'mailto:admin@reignsatelier.com');
}
if (!values.get('STUN_URLS')) setValue('STUN_URLS', 'stun:stun.l.google.com:19302');

await fs.writeFile(envPath, `${lines.filter((line, index) => line || index < lines.length - 1).join('\n').replace(/\n*$/, '')}\n`, { mode: 0o600 });
console.log('Secure-chat local configuration is ready (VAPID keys are stored in ignored .env; values were not printed).');
console.log(values.get('TURN_URLS') ? 'TURN is configured.' : 'TURN is not configured; add provider credentials before production deployment.');
