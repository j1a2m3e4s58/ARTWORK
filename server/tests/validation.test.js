import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntity } from '../validation.js';

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

test('published blog slugs are URL safe', () => {
  assert.throws(() => validateEntity('BlogPost', { title: 'Post', slug: '../bad', content: 'Content' }));
});
