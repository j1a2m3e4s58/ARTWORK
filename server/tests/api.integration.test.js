import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

let baseUrl;

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Test API did not start.');
}

test('API keeps public reads open while blocking unverified customer mutations', { timeout: 30_000 }, async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
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
      DATABASE_URL: '',
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
    let adminCookieHeader = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const adminCsrf = decodeURIComponent(adminCookieHeader.match(/atelier_csrf=([^;]+)/)?.[1] || '');
    const lockedResponse = await fetch(`${baseUrl}/api/admin/system-status`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(lockedResponse.status, 403);
    assert.equal((await lockedResponse.json()).code, 'admin_unlock_required');

    const unlockResponse = await fetch(`${baseUrl}/api/admin/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrf },
      body: JSON.stringify({ password: 'AdminCanvas2026!' }),
    });
    assert.equal(unlockResponse.status, 200);
    adminCookieHeader = [
      ...adminCookieHeader.split('; ').filter(value => !value.startsWith('atelier_admin_access=')),
      ...unlockResponse.headers.getSetCookie().map(value => value.split(';')[0]),
    ].join('; ');
    const securedHeaders = { 'Content-Type': 'application/json', Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrf };
    const readOutbox = async () => {
      const response = await fetch(`${baseUrl}/api/entities/Outbox?limit=100`, { headers: { Cookie: adminCookieHeader } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const tokenFromEmail = (outbox, recipient, pathName) => {
      const email = [...outbox].reverse().find(item => item.to === recipient && item.text?.includes(pathName));
      assert.ok(email, `Expected ${pathName} email for ${recipient}`);
      return new URL(email.text.match(/https?:\/\/\S+/)?.[0]).searchParams.get('token');
    };

    const verificationToken = tokenFromEmail(await readOutbox(), 'collector@example.test', '/verify-email');
    const verifyResponse = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verificationToken }),
    });
    assert.equal(verifyResponse.status, 200);
    const verifiedMessage = await fetch(`${baseUrl}/api/entities/Message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ name: 'Test Collector', subject: 'Question', message: 'Can I commission a portrait?' }),
    });
    assert.equal(verifiedMessage.status, 201);

    const chatDirectoryResponse = await fetch(`${baseUrl}/api/chat/directory`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(chatDirectoryResponse.status, 200);
    const chatDirectory = await chatDirectoryResponse.json();
    const collectorDirectoryEntry = chatDirectory.find(item => item.name === 'Test Collector');
    assert.ok(collectorDirectoryEntry, 'All active signed-in customers should appear in the private chat directory.');
    assert.equal('email' in collectorDirectoryEntry, false, 'The chat directory must not reveal private email addresses.');

    const conversationResponse = await fetch(`${baseUrl}/api/chat/conversations`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ userId: collectorDirectoryEntry.id }),
    });
    assert.equal(conversationResponse.status, 201);
    const conversation = await conversationResponse.json();
    const chatMessageResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ body: 'Welcome to the studio messenger.' }),
    });
    assert.equal(chatMessageResponse.status, 201);
    const chatMessage = await chatMessageResponse.json();
    const reactionResponse = await fetch(`${baseUrl}/api/chat/messages/${chatMessage.id}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ emoji: '👍' }),
    });
    assert.equal(reactionResponse.status, 200);
    assert.equal(Object.values((await reactionResponse.json()).reactions)[0], '👍');

    const forgotResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'collector@example.test' }),
    });
    assert.equal(forgotResponse.status, 200);
    const resetToken = tokenFromEmail(await readOutbox(), 'collector@example.test', '/reset-password');
    const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: 'UpdatedCanvas2026!' }),
    });
    assert.equal(resetResponse.status, 200);
    const collectorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'collector@example.test', password: 'UpdatedCanvas2026!' }),
    });
    assert.equal(collectorLogin.status, 200);

    const inviteResponse = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: securedHeaders,
      body: JSON.stringify({ email: 'support@example.test', full_name: 'Studio Support', role: 'support' }),
    });
    assert.equal(inviteResponse.status, 201);
    const inviteToken = tokenFromEmail(await readOutbox(), 'support@example.test', '/accept-invite');
    const acceptInvite = await fetch(`${baseUrl}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: 'SupportCanvas2026!' }),
    });
    assert.equal(acceptInvite.status, 200);
    const supportLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'support@example.test', password: 'SupportCanvas2026!' }),
    });
    assert.equal(supportLogin.status, 200);

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
    assert.match(firstOrder.trackingCode, /^RA-[A-F0-9]{8}$/);
    assert.equal(firstOrder.paymentStatus, 'awaiting_payment');

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
