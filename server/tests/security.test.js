import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseProtectedFeature, passwordProblem, requiresProductionMfa } from '../security.js';

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
