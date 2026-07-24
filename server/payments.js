import { createHmac, timingSafeEqual } from 'node:crypto';

const provider = process.env.PAYMENT_PROVIDER || 'manual';
const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

export const paymentStatus = {
  provider,
  configured: provider === 'paystack' && Boolean(paystackSecret),
  currency: process.env.PAYMENT_CURRENCY || 'GHS',
};

async function paystackRequest(path, options = {}) {
  if (!paymentStatus.configured) throw new Error('Online payment is not configured.');
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.status) throw new Error(result.message || 'Payment provider request failed.');
  return result.data;
}

export async function initializePayment({ email, amount, reference, callbackUrl, metadata }) {
  if (provider !== 'paystack') throw new Error('Secure online checkout is not enabled.');
  return paystackRequest('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email,
      amount: Math.round(Number(amount) * 100),
      currency: paymentStatus.currency,
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
  });
}

export async function verifyPayment(reference) {
  if (provider !== 'paystack') throw new Error('Secure online checkout is not enabled.');
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function verifyPaymentWebhook(rawBody, signature) {
  if (!paystackSecret || !signature) return false;
  const expected = createHmac('sha512', paystackSecret).update(rawBody).digest('hex');
  const first = Buffer.from(expected);
  const second = Buffer.from(String(signature));
  return first.length === second.length && timingSafeEqual(first, second);
}
