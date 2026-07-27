import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksEntityReadForPendingMfa, canUseProtectedFeature, passwordProblem, requiresProductionMfa } from '../security.js';
import { validateRuntimeConfiguration } from '../runtime-config.js';

test('password policy rejects weak credentials and accepts a strong passphrase', () => {
  assert.match(passwordProblem('short'), /12 characters/);
  assert.match(passwordProblem('alllowercase123'), /uppercase/);
  assert.match(passwordProblem('NoNumbersHere!'), /number/);
  assert.equal(passwordProblem('CanvasStudio2026!'), null);
});

test('protected customer features require an active verified account', () => {
  assert.equal(canUseProtectedFeature({ status: 'active', emailVerified: true }), true);
  assert.equal(canUseProtectedFeature({ status: 'active', emailVerified: false }), false);
  assert.equal(canUseProtectedFeature({ status: 'suspended', emailVerified: true }), false);
});

test('production administrators must enable MFA', () => {
  assert.equal(requiresProductionMfa({ role: 'admin', mfaEnabled: false }, 'production', true), true);
  assert.equal(requiresProductionMfa({ role: 'admin', mfaEnabled: true }, 'production', true), false);
  assert.equal(requiresProductionMfa({ role: 'editor', mfaEnabled: false }, 'production', true), false);
});

test('pending administrator MFA never blocks public portfolio reads', () => {
  const administrator = { role: 'admin', mfaEnabled: false };
  assert.equal(blocksEntityReadForPendingMfa(administrator, true, 'production', true), false);
  assert.equal(blocksEntityReadForPendingMfa(administrator, false, 'production', true), true);
});

test('production configuration rejects temporary services and insecure origins', () => {
  const problems = validateRuntimeConfiguration({
    NODE_ENV: 'production',
    TRUST_PROXY: 'false',
    STORAGE_PROVIDER: 'local',
    JWT_SECRET: 'short',
    ADMIN_PASSWORD: 'short',
    APP_ORIGIN: 'http://example.com',
    SITE_URL: 'http://example.com',
  });
  assert.ok(problems.some(problem => problem.includes('DATABASE_URL')));
  assert.ok(problems.some(problem => problem.includes('TRUST_PROXY')));
  assert.ok(problems.some(problem => problem.includes('cloudinary')));
  assert.ok(problems.some(problem => problem.includes('HTTPS')));
});

test('development configuration permits local infrastructure', () => {
  assert.deepEqual(validateRuntimeConfiguration({ NODE_ENV: 'development' }), []);
});

test('production refuses unsafe multi-instance web concurrency', () => {
  const problems = validateRuntimeConfiguration({
    NODE_ENV: 'production',
    WEB_CONCURRENCY: '2',
  });
  assert.ok(problems.some(problem => problem.includes('WEB_CONCURRENCY must remain 1')));
});
