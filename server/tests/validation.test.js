import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntity } from '../validation.js';
import { renderWhatsAppOrderMessage } from '../../src/lib/commerceOptions.js';

test('contact messages are trimmed and bounded', () => {
  const record = validateEntity('Message', { name: '  James  ', subject: 'Hello', message: ' A real message ' });
  assert.equal(record.name, 'James');
  assert.equal(record.message, 'A real message');
});

test('unsafe upload URLs are rejected', () => {
  assert.throws(() => validateEntity('Artwork', { title: 'Test', imageUrl: 'javascript:alert(1)' }));
});

test('orders require positive quantities', () => {
  assert.throws(() => validateEntity('Order', {
    items: [{ productId: 'one', title: 'Print', price: 10, qty: 0 }],
    total: 0, channel: 'whatsapp',
}));
});

test('manual commerce orders accept managed delivery and payment fields', () => {
  const order = validateEntity('Order', {
    items: [{ productId: 'one', title: 'Original painting', price: 800, qty: 1 }],
    total: 825,
    channel: 'whatsapp',
    paymentMethod: 'mobile_money',
    deliveryMethod: 'delivery',
    deliveryZoneId: 'accra',
    shippingAddress: {
      recipientName: 'Collector',
      phone: '+233000000000',
      addressLine1: 'Studio Road',
      city: 'Accra',
      country: 'Ghana',
    },
  });
  assert.equal(order.paymentMethod, 'mobile_money');
  assert.equal(order.deliveryZoneId, 'accra');
  assert.throws(() => validateEntity('Order', { paymentStatus: 'invented' }, { partial: true }));
});

test('secure online commerce orders accept the Paystack payment method', () => {
  const order = validateEntity('Order', {
    items: [{ productId: 'one', title: 'Original painting', price: 800, qty: 1 }],
    total: 825,
    channel: 'paystack',
    paymentMethod: 'paystack',
    deliveryMethod: 'delivery',
    deliveryZoneId: 'accra',
    shippingAddress: {
      recipientName: 'Collector',
      phone: '+233000000000',
      addressLine1: 'Studio Road',
      city: 'Accra',
      country: 'Ghana',
    },
  });
  assert.equal(order.paymentMethod, 'paystack');
  assert.equal(order.channel, 'paystack');
});

test('WhatsApp order templates replace managed checkout placeholders', () => {
  const message = renderWhatsAppOrderMessage(
    'Order {trackingCode}\n{items}\n{customerNote}',
    { trackingCode: 'RA-1234', items: '• Portrait × 1', customerNote: '' },
  );
  assert.equal(message, 'Order RA-1234\n• Portrait × 1');
});

test('published blog slugs are URL safe', () => {
  assert.throws(() => validateEntity('BlogPost', { title: 'Post', slug: '../bad', content: 'Content' }));
});

test('home banners require safe images and bounded ordering', () => {
  assert.throws(() => validateEntity('HeroSlide', {
    title: 'Unsafe banner',
    imageUrl: 'javascript:alert(1)',
    sortOrder: 1,
  }));
  assert.equal(validateEntity('HeroSlide', {
    title: 'Studio Stories',
    imageUrl: 'https://images.example.com/studio.jpg',
    sortOrder: 3,
  }).sortOrder, 3);
});
