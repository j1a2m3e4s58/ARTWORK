import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const port = 43291;
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Test API did not start.');
}

test('API keeps public reads open while blocking unverified customer mutations', { timeout: 30_000 }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'atelier-api-test-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      RENDER: 'true',
      PORT: String(port),
      API_PORT: '',
      API_HOST: '',
      APP_ORIGIN: baseUrl,
      SITE_URL: baseUrl,
      DATA_DIR: dataDir,
      JWT_SECRET: 'integration-test-secret-that-is-longer-than-32-characters',
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD: 'AdminCanvas2026!',
    },
    stdio: 'ignore',
  });
  try {
    await waitForServer();
    const publicResponse = await fetch(`${baseUrl}/api/entities/Artwork?limit=1`);
    assert.equal(publicResponse.status, 200);

    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Test Collector', email: 'collector@example.test', password: 'CanvasStudio2026!' }),
    });
    assert.equal(register.status, 201);
    const setCookies = register.headers.getSetCookie();
    const cookieHeader = setCookies.map(value => value.split(';')[0]).join('; ');
    const csrf = decodeURIComponent(cookieHeader.match(/atelier_csrf=([^;]+)/)?.[1] || '');
    assert.ok(csrf);

    const protectedResponse = await fetch(`${baseUrl}/api/entities/Message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({ name: 'Test Collector', subject: 'Question', message: 'Can I commission a portrait?' }),
    });
    assert.equal(protectedResponse.status, 403);
    const payload = await protectedResponse.json();
    assert.equal(payload.code, 'email_verification_required');

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.test', password: 'AdminCanvas2026!' }),
    });
    assert.equal(login.status, 200);
    const adminCookieHeader = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const adminCsrf = decodeURIComponent(adminCookieHeader.match(/atelier_csrf=([^;]+)/)?.[1] || '');
    const securedHeaders = { 'Content-Type': 'application/json', Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrf };
    const productResponse = await fetch(`${baseUrl}/api/entities/ShopProduct`, {
      method: 'POST',
      headers: securedHeaders,
      body: JSON.stringify({ title: 'Numbered Studio Print', type: 'Print', price: 250, imageUrl: 'https://example.com/print.jpg', inventory: 2, status: 'published' }),
    });
    assert.equal(productResponse.status, 201);
    const product = await productResponse.json();
    const orderPayload = {
      items: [{ productId: product.id, title: product.title, price: 1, qty: 1 }],
      total: 1,
      channel: 'manual',
      deliveryMethod: 'pickup',
    };
    const orderHeaders = { ...securedHeaders, 'Idempotency-Key': 'integration-order-1' };
    const firstOrderResponse = await fetch(`${baseUrl}/api/entities/Order`, { method: 'POST', headers: orderHeaders, body: JSON.stringify(orderPayload) });
    const secondOrderResponse = await fetch(`${baseUrl}/api/entities/Order`, { method: 'POST', headers: orderHeaders, body: JSON.stringify(orderPayload) });
    assert.equal(firstOrderResponse.status, 201);
    assert.equal(secondOrderResponse.status, 200);
    const firstOrder = await firstOrderResponse.json();
    const secondOrder = await secondOrderResponse.json();
    assert.equal(firstOrder.id, secondOrder.id);
    assert.equal(firstOrder.total, 250);

    const cancelResponse = await fetch(`${baseUrl}/api/orders/${firstOrder.id}/cancel`, { method: 'POST', headers: securedHeaders });
    assert.equal(cancelResponse.status, 200);
    const productsAfter = await fetch(`${baseUrl}/api/entities/ShopProduct?limit=10`, { headers: { Cookie: adminCookieHeader } }).then(response => response.json());
    assert.equal(productsAfter.find(item => item.id === product.id).inventory, 2);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await rm(dataDir, { recursive: true, force: true });
  }
});
