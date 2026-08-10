import 'dotenv/config';

const production = process.argv.includes('--production');
const required = [
  'STAGING_URL', 'DATABASE_URL', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM',
  'TURNSTILE_SECRET_KEY', 'VITE_TURNSTILE_SITE_KEY', 'APP_ORIGIN', 'SITE_URL',
  'METRICS_TOKEN', 'ERROR_WEBHOOK_URL',
];
if (production) required.push(
  'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
);
const missing = required.filter(name => !process.env[name]);
const findings = [];
if (missing.length) findings.push({ check: 'environment', ok: false, detail: `Missing: ${missing.join(', ')}` });
if (process.env.TRUST_PROXY !== 'true') findings.push({ check: 'trust-proxy', ok: false, detail: 'TRUST_PROXY must be true on Render.' });
if (process.env.STORAGE_PROVIDER !== 'cloudinary') findings.push({ check: 'storage', ok: false, detail: 'STORAGE_PROVIDER must be cloudinary.' });
if (production && (!process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') || !process.env.PAYSTACK_PUBLIC_KEY?.startsWith('pk_live_'))) {
  findings.push({ check: 'payments', ok: false, detail: 'Production review requires Paystack live keys.' });
}
const cloudflareTurnConfigured = process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN;
const standardTurnConfigured = process.env.TURN_URLS && (process.env.TURN_SHARED_SECRET || (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL));
if (production && !cloudflareTurnConfigured && !standardTurnConfigured) {
  findings.push({ check: 'turn-auth', ok: false, detail: 'Configure both Cloudflare TURN values, or TURN_URLS with a supported credential method.' });
}

if (process.env.STAGING_URL) {
  const root = process.env.STAGING_URL.replace(/\/$/, '');
  try {
    const response = await fetch(`${root}/api/ready`, { signal: AbortSignal.timeout(15_000) });
    const payload = await response.json();
    findings.push({ check: 'readiness', ok: response.ok && payload.ok === true, detail: payload });
  } catch (error) {
    findings.push({ check: 'readiness', ok: false, detail: error.message });
  }
  if (process.env.METRICS_TOKEN) {
    try {
      const response = await fetch(`${root}/api/metrics`, {
        headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      });
      findings.push({ check: 'metrics', ok: response.ok, detail: `HTTP ${response.status}` });
    } catch (error) {
      findings.push({ check: 'metrics', ok: false, detail: error.message });
    }
  }
}

if (!findings.some(item => item.check === 'environment')) findings.push({ check: 'environment', ok: true, detail: 'Required secrets are present.' });
const ok = findings.every(item => item.ok);
process.stdout.write(`${JSON.stringify({ ok, mode: production ? 'production' : 'staging', findings }, null, 2)}\n`);
if (!ok) process.exitCode = 1;
