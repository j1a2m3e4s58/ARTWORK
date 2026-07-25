import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes = [
  '/', '/gallery', '/commission', '/shop', '/about', '/contact',
  '/privacy', '/terms', '/login', '/register', '/forgot-password',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('atelier_loaded', 'true'));
});

for (const route of publicRoutes) {
  test(`${route} renders without overflow or serious accessibility violations`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    ))).toBe(true);
    await page.waitForTimeout(1_200);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter(item => ['serious', 'critical'].includes(item.impact));
    expect(serious.length, serious.map(item => (
      `${item.id}: ${item.help}\n${item.nodes.slice(0, 5).map(node => `  ${node.target.join(' ')} ${node.html}`).join('\n')}`
    )).join('\n')).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('mobile navigation opens, traps the page, and closes with Escape', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile-only interaction');
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open navigation menu' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Site navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Site navigation' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('pressing and holding the brand logo selects administrator sign-in', async ({ page }) => {
  await page.goto('/login');
  const brand = page.getByRole('button', { name: 'Open administrator sign-in', exact: true });
  await brand.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/login\?redirect=\/admin&mode=admin/);
  await expect(page.getByRole('heading', { name: 'Studio administrator' })).toBeVisible();
});

test('the visible security icon opens administrator sign-in', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Open administrator sign-in from the security icon' }).click();
  await expect(page).toHaveURL(/\/login\?redirect=\/admin&mode=admin/);
});

test('admin requires account login and then a password re-check', async ({ page }) => {
  test.skip(page.viewportSize()?.width < 768, 'Run the security flow once on desktop.');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel('Email address').fill(process.env.E2E_ADMIN_EMAIL || 'e2e-admin@example.com');
  await page.locator('#login-password').fill(process.env.E2E_ADMIN_PASSWORD || 'E2e-Admin-Password-2026!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Studio Control' })).toBeVisible();
  await page.getByLabel('Admin password').fill('wrong-password');
  await page.getByRole('button', { name: 'Open admin' }).click();
  await expect(page.getByRole('alert')).toContainText('try again');
  await page.getByLabel('Admin password').fill(process.env.E2E_ADMIN_PASSWORD || 'E2e-Admin-Password-2026!');
  await page.getByRole('button', { name: 'Open admin' }).click();
  await expect(page.getByText('Studio Control', { exact: true })).toBeVisible();
});
