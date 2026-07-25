import test from 'node:test';
import assert from 'node:assert/strict';

test('PostgreSQL entity storage persists and paginates records', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const database = await import(`../db.js?postgres-test=${Date.now()}`);
  const first = { id: database.newId(), title: 'Database Study A', category: 'Tests', created_date: new Date().toISOString() };
  const second = { id: database.newId(), title: 'Database Study B', category: 'Tests', created_date: new Date(Date.now() + 10).toISOString() };
  database.db.data.Artwork.push(first, second);
  await database.save();
  const page = await database.queryCollection('Artwork', { filters: { category: 'Tests' }, sort: 'created_date', limit: 1, offset: 1 });
  assert.equal(page.total >= 2, true);
  assert.equal(page.records.length, 1);
  assert.equal(page.records[0].title, 'Database Study B');
  const outbox = {
    id: database.newId(),
    to: 'collector@example.test',
    subject: 'Queue test',
    text: 'Durable delivery',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    created_date: new Date().toISOString(),
  };
  database.db.data.Outbox.push(outbox);
  await database.save();
  const claimed = await database.claimOutboxBatch(50);
  assert.equal(claimed.some(item => item.id === outbox.id && item.status === 'processing'), true);
  const delivery = claimed.find(item => item.id === outbox.id);
  assert.equal(await database.completeOutboxRecord(delivery.id, delivery.leaseId, { status: 'delivered' }), true);
  const delivered = await database.queryCollection('Outbox', { filters: { status: 'delivered' }, limit: 10 });
  assert.equal(delivered.records.some(item => item.id === outbox.id), true);
  database.db.data.Artwork = database.db.data.Artwork.filter(item => ![first.id, second.id].includes(item.id));
  database.db.data.Outbox = database.db.data.Outbox.filter(item => item.id !== outbox.id);
  await database.save();
  await database.closeDatabase();
});
