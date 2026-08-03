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

test('chat previews several selected files and leaves the site footer reachable', async ({ page }) => {
  await page.goto('/messages?conversation=e2e-chat');
  await expect(page.locator('section header').getByText('Preview Client', { exact: true })).toBeVisible();

  const fileInput = page.locator('input[type="file"][multiple]').last();
  await fileInput.setInputFiles([
    path.resolve('public/brand/reigns-app-icon-192.png'),
    path.resolve('public/price-guides/reigns-atelier-pencil-portrait-price-list.pdf'),
  ]);

  const imagePreview = page.locator('img[alt="reigns-app-icon-192.png"]');
  await expect(imagePreview).toBeVisible();
  await expect.poll(() => imagePreview.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('reigns-atelier-pencil-portrait-price-list.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 10 files selected')).toBeVisible();
  await expect(page.getByText('Add more', { exact: true })).toBeVisible();

  await page.getByTitle('Message options').click();
  await expect(page.getByRole('button', { name: 'Delete for everyone' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact));
  expect(serious, serious.map(item => `${item.id}: ${item.help}`).join('\n')).toEqual([]);

  const siteFooter = page.getByRole('contentinfo');
  await siteFooter.scrollIntoViewIfNeeded();
  await expect(siteFooter).toBeVisible();
  await expect(siteFooter.getByText('Newsletter', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
