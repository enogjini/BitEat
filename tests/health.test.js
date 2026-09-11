'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer } = require('./helpers/suite');

describe('GET /health', () => {
  const api = useServer();

  test('reports OK with a timestamp', async () => {
    const res = await api.request('GET', '/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'OK');
    assert.ok(
      !Number.isNaN(Date.parse(res.body.timestamp)),
      'timestamp should be parseable'
    );
  });

  test('does not touch the database', async () => {
    const { db } = require('./helpers/suite');
    await api.request('GET', '/health');
    assert.equal(db.calls.length, 0);
  });

  test(
    'reflects database reachability',
    { todo: 'health returns OK even when Postgres is unreachable, so uptime checks cannot detect an outage' },
    async () => {
      const { db } = require('./helpers/suite');
      db.when(/.*/, new Error('connection terminated'));
      const res = await api.request('GET', '/health');
      assert.equal(res.status, 503);
    }
  );
});
