'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

/**
 * The API has one consistent habit worth pinning down: read routes catch their
 * own failures and answer with an empty payload rather than propagating. That
 * keeps the UI from crashing, but it also means a database outage is
 * indistinguishable from an empty result — see the `todo` entries here.
 */

describe('failure paths on read routes', () => {
  const api = useServer();

  const readRoutes = [
    ['GET', '/api/tavolinat/status', /FROM tavolinat t/, []],
    ['GET', '/api/punonjesit', /FROM punonjesit/, []],
    ['GET', '/api/pagesat/42', /FROM pagesat WHERE pagese_id/, { error: 'Gabim' }],
  ];

  for (const [method, path, pattern, expected] of readRoutes) {
    test(`${method} ${path} answers 500 with a safe fallback`, async () => {
      db.when(pattern, new Error('connection terminated unexpectedly'));

      const res = await api.request(method, path);

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, expected);
    });
  }

  test(
    'an outage is distinguishable from an empty table',
    { todo: 'every read route returns [] for both, so the dashboard shows zeroes during an outage instead of an error' },
    async () => {
      db.when(/FROM tavolinat/, new Error('down'));
      const outage = await api.request('GET', '/api/tavolinat');

      db.reset();
      db.when(/FROM tavolinat/, { rows: [] });
      const empty = await api.request('GET', '/api/tavolinat');

      assert.notDeepEqual(
        { status: outage.status, body: outage.body },
        { status: empty.status, body: empty.body }
      );
    }
  );
});

describe('unmatched routes and malformed input', () => {
  const api = useServer();

  test('an unknown path returns 404', async () => {
    const res = await api.request('GET', '/api/nuk-ekziston');
    assert.equal(res.status, 404);
  });

  test('a wrong method on a known path returns 404', async () => {
    const res = await api.request('DELETE', '/api/menu');
    assert.equal(res.status, 404);
  });

  test('malformed JSON is rejected by the body parser', async () => {
    const res = await fetch(`${api.url}/api/menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
      signal: AbortSignal.timeout(3000),
    });

    assert.equal(res.status, 500, 'the error middleware turns a parse failure into a 500');
    assert.deepEqual(await res.json(), { error: 'Internal Server Error' });
    assert.equal(db.calls.length, 0, 'nothing should reach the database');
  });

  test(
    'malformed JSON returns 400 rather than 500',
    { todo: 'express.json() throws a 400-shaped SyntaxError, but the error middleware rewrites every error to 500' },
    async () => {
      const res = await fetch(`${api.url}/api/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not json',
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(res.status, 400);
    }
  );
});

describe('CORS', () => {
  const api = useServer();

  test('allows any origin', async () => {
    const res = await api.request('GET', '/health');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  test(
    'restricts origins to the deployed front end',
    { todo: 'cors() runs with no options, so any site can call this API from a browser — combined with the lack of auth, any page can read takings' },
    async () => {
      const res = await api.request('GET', '/health');
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
    }
  );
});
