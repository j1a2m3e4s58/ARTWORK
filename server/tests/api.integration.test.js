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
      API_PORT: String(port),
      API_HOST: '127.0.0.1',
      APP_ORIGIN: baseUrl,
      SITE_URL: baseUrl,
      DATA_DIR: dataDir,
      JWT_SECRET: 'integration-test-secret-that-is-longer-than-32-characters',
      ADMIN_EMAIL: '',
      ADMIN_PASSWORD: '',
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
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await rm(dataDir, { recursive: true, force: true });
  }
});
