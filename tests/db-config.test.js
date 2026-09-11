'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');
const { db } = require('./helpers/fake-pg');

describe('database pool configuration', () => {
  test('falls back to the local dev database when DATABASE_URL is unset', () => {
    db.reset();
    loadApp({ DATABASE_URL: undefined });
    assert.match(db.lastPoolConfig.connectionString, /^postgresql:\/\/postgres:.*@localhost:5432\/restaurant$/);
    assert.equal(db.lastPoolConfig.ssl, false);
  });


  for (const host of ['supabase', 'render', 'amazonaws', 'neon', 'heroku']) {
    test(`enables SSL for a ${host} connection string`, () => {
      db.reset();
      loadApp({ DATABASE_URL: `postgresql://u:p@db.${host}.example.com:5432/postgres` });
      assert.deepEqual(db.lastPoolConfig.ssl, { rejectUnauthorized: false });
    });
  }

  test('PGSSL=true forces SSL on an otherwise plain host', () => {
    db.reset();
    loadApp({ DATABASE_URL: 'postgresql://u:p@db.internal:5432/x', PGSSL: 'true' });
    assert.deepEqual(db.lastPoolConfig.ssl, { rejectUnauthorized: false });
  });

  test('pool size defaults to 5 and honours PGPOOL_MAX', () => {
    db.reset();
    loadApp({ PGPOOL_MAX: undefined });
    assert.equal(db.lastPoolConfig.max, 5);

    db.reset();
    loadApp({ PGPOOL_MAX: '20' });
    assert.equal(db.lastPoolConfig.max, 20);
  });

  test(
    'rejects self-signed certificates',
    { todo: 'ssl.rejectUnauthorized is hard-coded false, so the pooler connection is not verified' },
    () => {
      db.reset();
      loadApp({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:6543/postgres' });
      assert.equal(db.lastPoolConfig.ssl.rejectUnauthorized, true);
    }
  );
});
