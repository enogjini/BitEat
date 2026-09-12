'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');
const { authHeader } = require('./helpers/auth');

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
    ['GET', '/api/tavolinat/3/porosite', /FROM tavolinat WHERE tavoline_id/, { error: 'Gabim' }],
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

  test('malformed JSON returns 400 rather than 500', async () => {
    const res = await fetch(`${api.url}/api/menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
      body: '{ not json',
      signal: AbortSignal.timeout(3000),
    });

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { success: false, error: 'JSON i pavlefshëm' });
    assert.equal(db.calls.length, 0, 'nothing should reach the database');
  });

  test('malformed JSON is rejected before the token is checked', async () => {
    // express.json() runs ahead of the auth gate, so a bad body never
    // reaches it — but it must still be a 400, not a crash.
    const res = await fetch(`${api.url}/api/menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(res.status, 400);
  });
});

describe('CORS', () => {
  describe('default (development)', () => {
    const api = useServer({ CORS_ORIGIN: undefined, NODE_ENV: undefined });

    test('allows the CRA dev server', async () => {
      const res = await api.request('GET', '/health', { headers: { Origin: 'http://localhost:3000' } });
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    });

    test('does not reflect an arbitrary origin', async () => {
      const res = await api.request('GET', '/health', { headers: { Origin: 'https://evil.example' } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('never answers with a wildcard', async () => {
      const res = await api.request('GET', '/health');
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
    });
  });

  describe('CORS_ORIGIN', () => {
    const api = useServer({ CORS_ORIGIN: 'https://biteat.example, https://staging.biteat.example' });

    test('allows each listed origin', async () => {
      for (const origin of ['https://biteat.example', 'https://staging.biteat.example']) {
        const res = await api.request('GET', '/health', { headers: { Origin: origin } });
        assert.equal(res.headers.get('access-control-allow-origin'), origin);
      }
    });

    test('refuses an origin that is not listed', async () => {
      const res = await api.request('GET', '/health', { headers: { Origin: 'http://localhost:3000' } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  describe('production with no CORS_ORIGIN', () => {
    // The front end is same-origin on Vercel, so nothing needs allowing.
    const api = useServer({ NODE_ENV: 'production', CORS_ORIGIN: undefined, JWT_SECRET: 'prod-secret' });

    test('allows no cross-origin caller', async () => {
      const res = await api.request('GET', '/health', { as: null, headers: { Origin: 'http://localhost:3000' } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  describe("CORS_ORIGIN='*'", () => {
    const api = useServer({ CORS_ORIGIN: '*' });

    test('opts back into a wildcard explicitly', async () => {
      const res = await api.request('GET', '/health');
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });
  });
});
