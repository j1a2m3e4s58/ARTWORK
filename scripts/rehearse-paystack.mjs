import 'dotenv/config';

const required = ['STAGING_URL', 'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_TEST_EMAIL'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  process.stderr.write(`Paystack rehearsal blocked. Configure: ${missing.join(', ')}\n`);
  process.exit(1);
}
if (!process.env.PAYSTACK_PUBLIC_KEY.startsWith('pk_test_') || !process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
  process.stderr.write('Rehearsal accepts Paystack test keys only (pk_test_ and sk_test_).\n');
  process.exit(1);
}

const staging = process.env.STAGING_URL.replace(/\/$/, '');
const [readyResponse, configResponse] = await Promise.all([
  fetch(`${staging}/api/ready`, { signal: AbortSignal.timeout(15_000) }),
  fetch(`${staging}/api/payments/config`, { signal: AbortSignal.timeout(15_000) }),
]);
if (!readyResponse.ok) throw new Error(`Staging readiness failed: HTTP ${readyResponse.status}`);
const readiness = await readyResponse.json();
const config = await configResponse.json();
if (!readiness.ok) throw new Error(`Staging is not ready: ${JSON.stringify(readiness.services)}`);
if (config.provider !== 'paystack' || !config.configured) {
  throw new Error('Staging payment configuration is not using configured Paystack test mode.');
}

let initialization = null;
if (process.argv.includes('--initialize')) {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: process.env.PAYSTACK_TEST_EMAIL,
      amount: 100,
      currency: process.env.PAYMENT_CURRENCY || 'GHS',
      callback_url: `${staging}/shop?payment=rehearsal`,
      metadata: { rehearsal: true, environment: 'staging' },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.status) throw new Error(payload.message || `Paystack returned HTTP ${response.status}`);
  initialization = { reference: payload.data.reference, authorizationUrl: payload.data.authorization_url };
}

process.stdout.write(`${JSON.stringify({
  success: true,
  staging,
  ready: readiness.ok,
  provider: config.provider,
  initialization,
  next: initialization
    ? 'Open the authorization URL and complete payment using a Paystack sandbox card, then verify the webhook and order status.'
    : 'Rerun with --initialize to create a GHS 1.00 unpaid sandbox transaction.',
}, null, 2)}\n`);
