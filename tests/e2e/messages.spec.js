import { expect, test } from '@playwright/test';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const adminEmail = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@example.com';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'E2e-Admin-Password-2026!';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name), 'Focused Chrome desktop/mobile chat coverage.');
  await page.addInitScript(() => sessionStorage.setItem('atelier_loaded', 'true'));
  await page.goto('/login');
  await page.getByLabel('Email address').fill(adminEmail);
  await page.locator('#login-password').fill(adminPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  const me = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
  const conversation = {
    id: 'e2e-chat', type: 'private', participantIds: [me.id, 'e2e-client'],
    participants: [
      { id: me.id, name: me.full_name, role: me.role },
      { id: 'e2e-client', name: 'Preview Client', role: 'customer' },
    ],
    lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0,
    muted: false, archived: false, blocked: false, typingUsers: [],
  };
  await page.route('**/api/chat/conversations', route => route.fulfill({ json: [conversation] }));
  await page.route('**/api/chat/directory', route => route.fulfill({ json: [] }));
  const message = {
    id: 'e2e-message', conversationId: conversation.id, senderId: me.id,
    body: 'A long studio message that must remain inside the conversation column on every screen size.',
    created_date: new Date().toISOString(), reactions: {}, allowForward: true,
  };
  await page.route('**/api/chat/conversations/e2e-chat/messages?*', route => route.fulfill({ json: { items: [message], nextCursor: null } }));
  await page.route('**/api/chat/heartbeat', route => route.fulfill({ json: { success: true } }));
  await page.route('**/api/chat/events', route => route.abort());
});

test('chat previews several selected files without horizontal overflow', async ({ page }) => {
  await page.goto('/messages?conversation=e2e-chat');
  await expect(page.locator('section header').getByText('Preview Client', { exact: true })).toBeVisible();

  const fileInput = page.locator('input[type="file"][multiple]').last();
  await fileInput.setInputFiles([
    path.resolve('public/brand/reigns-app-icon-192.png'),
    path.resolve('public/price-guides/reigns-atelier-pencil-portrait-price-list.pdf'),
  ]);

  const imagePreview = page.getByLabel('Prepare attachments').getByRole('img', { name: 'reigns-app-icon-192.jpg' });
  await expect(imagePreview).toBeVisible();
  await expect.poll(() => imagePreview.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('reigns-atelier-pencil-portrait-price-list.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 10 files selected')).toBeVisible();
  await expect(page.getByText('Add more', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Close attachment preview' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact));
  expect(serious, serious.map(item => `${item.id}: ${item.help}`).join('\n')).toEqual([]);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('sends images, documents, voice notes and GIFs without refresh', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One focused browser-storage regression run is sufficient.');

  const savedMessages = [];
  const uploadSessions = new Map();
  const sentBatches = [];
  let sequence = 0;
  const me = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
  await page.route('**/api/chat/conversations', route => route.fulfill({ json: [{
    id: 'e2e-chat', type: 'announcement', participantIds: [me.id, 'e2e-client'],
    participants: [{ id: me.id, name: me.full_name, role: me.role }, { id: 'e2e-client', name: 'Preview Client', role: 'customer' }],
    lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0, muted: false, archived: false,
    blocked: false, typingUsers: [],
  }] }));

  await page.unroute('**/api/chat/conversations/e2e-chat/messages?*');
  await page.route('**/api/chat/conversations/e2e-chat/messages?*', route => route.fulfill({
    json: { items: [{
      id: 'e2e-message', conversationId: 'e2e-chat', senderId: 'seed', body: 'Ready for media.',
      created_date: new Date().toISOString(), reactions: {}, readBy: [],
    }, {
      id: 'received-audio', conversationId: 'e2e-chat', senderId: 'e2e-client', body: '',
      attachmentUrl: 'https://media.example.test/received-audio.webm', attachmentName: 'voice-message-received.webm',
      attachmentType: 'audio/webm', attachmentBytes: 10, voiceDurationSeconds: 8,
      created_date: new Date().toISOString(), reactions: {}, readBy: [],
    }, ...savedMessages], nextCursor: null },
  }));
  await page.route('**/api/upload-sessions**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method() === 'POST' && parts.length === 2) {
      const upload = request.postDataJSON();
      const sessionId = `upload-${++sequence}`;
      uploadSessions.set(sessionId, upload);
      return route.fulfill({ status: 201, json: { sessionId, offset: 0, totalBytes: upload.size, chunkSize: upload.size, status: 'uploading' } });
    }
    const sessionId = parts[2];
    const upload = uploadSessions.get(sessionId);
    if (request.method() === 'PUT') return route.fulfill({ json: { sessionId, offset: upload.size, totalBytes: upload.size, progress: 100 } });
    if (request.method() === 'POST' && parts.at(-1) === 'complete') {
      return route.fulfill({ status: 201, json: {
        file_url: `https://media.example.test/${sessionId}`,
        media: { filename: upload.name, mime: upload.type, bytes: upload.size },
      } });
    }
    if (request.method() === 'GET') return route.fulfill({ json: { sessionId, offset: 0, totalBytes: upload.size, chunkSize: upload.size, status: 'uploading' } });
    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/upload', route => route.fulfill({ status: 201, json: {
    file_url: 'https://media.example.test/voice-note.webm',
    media: { filename: 'voice-message-browser.webm', mime: 'audio/webm', bytes: 10 },
  } }));
  await page.route('**/api/chat/conversations/e2e-chat/messages/batch', async route => {
    const entries = route.request().postDataJSON().messages;
    sentBatches.push(entries);
    const created = entries.map(entry => ({
      ...entry, id: `saved-${++sequence}`, conversationId: 'e2e-chat', senderId: 'e2e-admin',
      created_date: new Date().toISOString(), reactions: {}, readBy: ['e2e-admin'],
    }));
    savedMessages.push(...created);
    await route.fulfill({ status: 201, json: created });
  });
  await page.route('**/api/chat/gifs?*', route => route.fulfill({ json: { configured: true, items: [{
    id: 'studio-gif', title: 'Studio celebration', url: '/brand/reigns-app-icon-192.png', previewUrl: '/brand/reigns-app-icon-192.png',
  }] } }));
  await page.route('**/api/chat/gifs/import', route => route.fulfill({ status: 201, json: {
    file_url: 'https://media.example.test/studio.gif',
    media: { filename: 'studio-celebration.gif', mime: 'image/gif', bytes: 43 },
  } }));
  await page.route('**/api/chat/keys/*', route => route.fulfill({
    status: 404,
    json: { error: 'No verified recipient devices are available for encrypted messaging.' },
  }));
  await page.route('**/api/chat/keys', route => route.fulfill({ json: { success: true } }));
  await page.route('**/api/chat/conversations/e2e-chat/messages', async route => {
    const entry = route.request().postDataJSON();
    const created = {
      ...entry, id: `saved-${++sequence}`, conversationId: 'e2e-chat', senderId: 'e2e-admin',
      created_date: new Date().toISOString(), reactions: {}, readBy: ['e2e-admin'],
    };
    savedMessages.push(created);
    await route.fulfill({ status: 201, json: created });
  });
  await page.route('**/api/chat/messages/*/attachment*', route => route.fulfill({
    contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  }));

  await page.goto('/messages?conversation=e2e-chat');
  await expect(page.locator('section header').getByText('Preview Client', { exact: true })).toBeVisible();
  const receivedAudio = page.locator('[data-chat-message-id="received-audio"] article');
  const receivedTime = receivedAudio.locator('.chat-delivery-meta');
  await expect(receivedTime).toBeVisible();
  const [audioBox, timeBox] = await Promise.all([receivedAudio.boundingBox(), receivedTime.boundingBox()]);
  expect(Math.abs(timeBox.x - audioBox.x)).toBeLessThan(12);
  const photoInput = page.locator('input[type="file"][multiple][accept^="image/"]');
  await photoInput.setInputFiles(path.resolve('public/brand/reigns-app-icon-192.png'));
  await page.getByRole('button', { name: 'Send attachments' }).click();
  await expect.poll(() => sentBatches.length).toBe(1);
  expect(sentBatches[0]).toHaveLength(1);

  const documentInput = page.locator('input[type="file"][accept^=".pdf"]');
  await documentInput.setInputFiles(path.resolve('public/price-guides/reigns-atelier-pencil-portrait-price-list.pdf'));
  await page.getByRole('button', { name: 'Send attachments' }).click();
  await expect.poll(() => sentBatches.length).toBe(2);
  expect(sentBatches[1]).toHaveLength(1);

  const audioInput = page.locator('input[type="file"][accept="audio/*"]');
  await audioInput.setInputFiles({ name: 'voice-message-browser.webm', mimeType: 'audio/webm', buffer: Buffer.from('voice-note') });
  await page.getByRole('button', { name: 'Send attachments' }).click();
  await expect.poll(() => sentBatches.length).toBe(3);
  expect(sentBatches[2]).toHaveLength(1);
  expect(sentBatches[2][0].voiceDurationSeconds).toBeGreaterThanOrEqual(0);

  await page.unroute('**/api/chat/conversations');
  await page.route('**/api/chat/conversations', route => route.fulfill({ json: [{
    id: 'e2e-chat', type: 'private', participantIds: [me.id, 'e2e-client'],
    participants: [{ id: me.id, name: me.full_name, role: me.role }, { id: 'e2e-client', name: 'Preview Client', role: 'customer' }],
    lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0, muted: false, archived: false,
    blocked: false, typingUsers: [],
  }] }));
  await page.goto('/messages?conversation=e2e-chat');
  await page.getByRole('button', { name: 'Open attachment menu' }).click();
  await page.getByRole('button', { name: 'GIFs' }).click();
  await page.getByTitle('Studio celebration').click();
  const sentGif = page.getByRole('img', { name: 'studio-celebration.gif' });
  await expect(sentGif).toBeVisible();
  await expect.poll(() => sentGif.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('Preparing', { exact: true })).toHaveCount(0);
});
