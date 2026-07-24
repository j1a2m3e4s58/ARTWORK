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
  database.db.data.Artwork = database.db.data.Artwork.filter(item => ![first.id, second.id].includes(item.id));
  await database.save();
  await database.closeDatabase();
});
