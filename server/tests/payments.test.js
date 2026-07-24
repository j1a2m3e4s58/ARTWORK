import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

test('Paystack webhook signatures use constant provider-compatible HMAC verification', async () => {
  process.env.PAYSTACK_SECRET_KEY = 'test-paystack-secret';
  const { verifyPaymentWebhook } = await import(`../payments.js?test=${Date.now()}`);
  const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 42, reference: 'atelier-order' } }));
  const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
  assert.equal(verifyPaymentWebhook(body, signature), true);
  assert.equal(verifyPaymentWebhook(body, `${signature.slice(0, -1)}0`), false);
});
