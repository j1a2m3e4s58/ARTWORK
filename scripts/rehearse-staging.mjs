const baseUrl = String(process.env.STAGING_URL || process.argv[2] || 'http://127.0.0.1:43127').replace(/\/+$/, '');

async function get(path, { allowUnavailable = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && !allowUnavailable) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response;
}

try {
  const home = await get('/');
  const health = await (await get('/api/health')).json();
  const readyResponse = await get('/api/ready', { allowUnavailable: true });
  const ready = await readyResponse.json();
  const payment = await (await get('/api/payments/config')).json();
  const manifest = await (await get('/manifest.webmanifest')).json();

  if (!health.ok) throw new Error('Health endpoint did not report ok.');
  if (!ready.ok) throw new Error(`Readiness failed: ${JSON.stringify(ready.services)}`);
  if (!['manual', 'paystack'].includes(payment.provider)) throw new Error(`Unexpected payment provider: ${payment.provider}`);
  if (payment.provider === 'paystack' && !payment.configured) throw new Error('Paystack is selected but not configured.');
  if (!manifest.icons?.some(icon => String(icon.sizes).includes('192x192'))) throw new Error('PWA manifest is missing a 192px icon.');
  if (!manifest.icons?.some(icon => String(icon.sizes).includes('512x512'))) throw new Error('PWA manifest is missing a 512px icon.');

  const csp = home.headers.get('content-security-policy');
  if (ready.environment === 'production' && !csp) throw new Error('Production homepage is missing Content-Security-Policy.');

  process.stdout.write(`Smoke test passed for ${baseUrl}\n`);
  process.stdout.write(`Environment: ${ready.environment}; database: ${ready.services.database.kind}; payment: ${payment.provider}\n`);
  if (payment.provider === 'manual') {
    process.stdout.write('Manual-payment rehearsal passed: online initialization remains disabled for initial testing.\n');
  } else {
    process.stdout.write('Paystack configuration is ready. Complete one test-card checkout in the provider sandbox before launch.\n');
  }
} catch (error) {
  process.stderr.write(`Staging smoke test failed: ${error.message}\n`);
  process.exitCode = 1;
}
