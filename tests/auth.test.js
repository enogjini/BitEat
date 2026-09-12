'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');
const { tokenFor } = require('./helpers/auth');
const auth = require('../lib/auth');

const ADMIN_ROW = { punonjes_id: 99, emri: 'admin', mbiemri: '', password: 'sekret', lloji_perdoruesit: 'admin' };
const MANAGER_ROW = { punonjes_id: 5, emri: 'Ilir', mbiemri: 'Berisha', password: 'm1', lloji_perdoruesit: 'menaxher' };
const WAITER_ROW = { punonjes_id: 1, emri: 'Arben', mbiemri: 'Hoxha', password: 'w1', lloji_perdoruesit: 'kamarier' };

describe('POST /api/login', () => {
  const api = useServer();

  describe('admin', () => {
    test('returns the user and a token on matching credentials', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [ADMIN_ROW] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.lloji, 'admin');
      assert.equal(res.body.user.punonjes_id, 99);
      assert.ok(res.body.token, 'expected a session token');
      assert.equal(res.body.expires_in, auth.TOKEN_TTL_SECONDS);
    });

    test('looks the account up by name and role, then checks the password in process', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [ADMIN_ROW] });

      await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });

      const select = db.calls[0];
      assert.match(select.text, /WHERE emri = \$1 AND \(lloji_perdoruesit = \$2 OR emri = \$2\)/);
      assert.deepEqual(select.params, ['admin', 'admin']);
      assert.doesNotMatch(select.text, /password = \$/, 'the password never goes to SQL');
      assert.doesNotMatch(select.text, /SELECT \*/, 'columns are named explicitly');
    });

    test('rejects wrong credentials with 401', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [ADMIN_ROW] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', password: 'gabim', lloji: 'admin' },
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Kredencialet gabim!');
      assert.equal(res.body.token, undefined);
    });

    test('rejects an unknown name with 401', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [] });
      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'nobody', password: 'x', lloji: 'admin' },
      });
      assert.equal(res.status, 401);
    });

    test('requires name and password', async () => {
      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', lloji: 'admin' },
      });
      assert.equal(res.status, 400);
      assert.equal(db.calls.length, 0);
    });
  });

  describe('menaxher', () => {
    test('constrains the role in SQL', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [MANAGER_ROW] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'Ilir', password: 'm1', lloji: 'menaxher' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.lloji, 'menaxher');
      assert.match(db.calls[0].text, /WHERE emri = \$1 AND lloji_perdoruesit = \$2/);
      assert.deepEqual(db.calls[0].params, ['Ilir', 'menaxher']);
    });

    test('an admin row does not satisfy a manager login', async () => {
      // The role predicate is in SQL, so a non-manager simply returns no rows.
      db.when(/SELECT .* FROM punonjesit/, { rows: [] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'menaxher' },
      });

      assert.equal(res.status, 401);
    });
  });

  describe('kamarier', () => {
    test('authenticates by employee id rather than name', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [WAITER_ROW] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: 1, password: 'w1', lloji: 'kamarier' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.lloji, 'kamarier');
      assert.match(db.calls[0].text, /WHERE punonjes_id = \$1 AND lloji_perdoruesit = \$2/);
      assert.deepEqual(db.calls[0].params, [1, 'kamarier']);
    });

    test('accepts the id as a numeric string', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [WAITER_ROW] });
      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: '1', password: 'w1', lloji: 'kamarier' },
      });
      assert.equal(res.status, 200);
      assert.equal(db.calls[0].params[0], 1);
    });

    test('requires both id and password', async () => {
      for (const body of [
        { password: 'w1', lloji: 'kamarier' },
        { punonjes_id: 1, lloji: 'kamarier' },
        { lloji: 'kamarier' },
        { punonjes_id: 'abc', password: 'w1', lloji: 'kamarier' },
      ]) {
        db.reset();
        const res = await api.request('POST', '/api/login', { as: null, body });
        assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
        assert.equal(res.body.message, 'Plotëso fushat!');
        assert.equal(db.calls.length, 0, 'should not query on invalid input');
      }
    });

    test('rejects an unknown id with 401', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [] });
      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: 4242, password: 'x', lloji: 'kamarier' },
      });
      assert.equal(res.status, 401);
    });
  });

  describe('passwords', () => {
    test('verifies a scrypt hash and does not rewrite it', async () => {
      const hashed = await auth.hashPassword('w1');
      db.when(/SELECT .* FROM punonjesit/, { rows: [{ ...WAITER_ROW, password: hashed }] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: 1, password: 'w1', lloji: 'kamarier' },
      });

      assert.equal(res.status, 200);
      assert.equal(db.matching(/UPDATE punonjesit/).length, 0, 'an already-hashed password is left alone');
    });

    test('rejects the wrong password against a hash', async () => {
      const hashed = await auth.hashPassword('w1');
      db.when(/SELECT .* FROM punonjesit/, { rows: [{ ...WAITER_ROW, password: hashed }] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: 1, password: 'w2', lloji: 'kamarier' },
      });

      assert.equal(res.status, 401);
    });

    test('upgrades a legacy plaintext password to a hash on first login', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [WAITER_ROW] });

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: 1, password: 'w1', lloji: 'kamarier' },
      });

      assert.equal(res.status, 200);
      const upgrade = db.matching(/UPDATE punonjesit SET password/)[0];
      assert.ok(upgrade, 'expected the stored password to be re-hashed');
      assert.equal(upgrade.params[1], 1);
      assert.ok(auth.isHashed(upgrade.params[0]));
      assert.equal(await auth.verifyPassword('w1', upgrade.params[0]), true);
    });

    test('a failed hash upgrade does not block the login', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [WAITER_ROW] });
      db.when(/UPDATE punonjesit/, new Error('read-only replica'));

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { punonjes_id: 1, password: 'w1', lloji: 'kamarier' },
      });

      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });

    test('never returns the stored password to the client', async () => {
      db.when(/SELECT .* FROM punonjesit/, { rows: [ADMIN_ROW] });
      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });
      assert.equal(res.body.user.password, undefined);
      assert.doesNotMatch(res.text, /sekret/);
    });
  });

  describe('failure handling', () => {
    test('returns 500 when the database errors', async () => {
      db.when(/SELECT .* FROM punonjesit/, new Error('connection terminated'));

      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });

      assert.equal(res.status, 500);
      assert.equal(res.body.success, false);
    });

    test('answers a request with an unrecognised lloji', async () => {
      const res = await api.request('POST', '/api/login', {
        as: null,
        body: { emri_perdoruesit: 'x', password: 'y', lloji: 'kuzhinier' },
        timeoutMs: 1000,
      });
      assert.equal(res.status, 400);
      assert.equal(db.calls.length, 0);
    });
  });
});

describe('bearer-token gate on /api', () => {
  const api = useServer();

  test('a request without a token is refused with 401', async () => {
    db.when(/FROM artikujt_menu/, { rows: [] });
    const res = await api.request('GET', '/api/menu', { as: null });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(db.calls.length, 0, 'the database is never consulted');
  });

  test('a valid token is accepted', async () => {
    db.when(/FROM artikujt_menu/, { rows: [] });
    const res = await api.request('GET', '/api/menu', { as: 'kamarier' });
    assert.equal(res.status, 200);
  });

  test('a tampered token is refused', async () => {
    const [h, p, s] = tokenFor('admin').split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 1, emri: 'x', lloji: 'admin', exp: 9999999999 })).toString('base64url');
    const res = await api.request('GET', '/api/menu', {
      as: null,
      headers: { Authorization: `Bearer ${h}.${forged}.${s}` },
    });
    assert.equal(res.status, 401);
  });

  test('an expired token is refused', async () => {
    const res = await api.request('GET', '/api/menu', {
      as: null,
      headers: { Authorization: `Bearer ${tokenFor('admin', { ttl: -1 })}` },
    });
    assert.equal(res.status, 401);
  });

  test('a token signed with another secret is refused', async () => {
    const other = auth.signToken({ sub: 99, emri: 'admin', lloji: 'admin' }, 'not-the-secret');
    const res = await api.request('GET', '/api/menu', {
      as: null,
      headers: { Authorization: `Bearer ${other}` },
    });
    assert.equal(res.status, 401);
  });

  test('garbage in the header is refused rather than crashing', async () => {
    for (const value of ['Bearer', 'Bearer x.y', 'Basic abc', 'Bearer a.b.c.d']) {
      const res = await api.request('GET', '/api/menu', { as: null, headers: { Authorization: value } });
      assert.equal(res.status, 401, `expected 401 for "${value}"`);
    }
  });

  test('the login page can list waiters before signing in', async () => {
    db.when(/FROM punonjesit/, { rows: [] });
    const res = await api.request('GET', '/api/punonjesit?lloji=kamarier', { as: null });
    assert.equal(res.status, 200);
  });

  test('/health needs no token', async () => {
    const res = await api.request('GET', '/health', { as: null });
    assert.equal(res.status, 200);
  });

  test('an unknown /api path without a token is 401, not 404', async () => {
    const res = await api.request('GET', '/api/nuk-ekziston', { as: null });
    assert.equal(res.status, 401);
  });

  test('GET /api/auth/me echoes the token holder', async () => {
    const res = await api.request('GET', '/api/auth/me', { as: 'kamarier' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, { punonjes_id: 1, emri: 'Arben', lloji: 'kamarier' });
  });
});

describe('role restrictions', () => {
  const api = useServer();

  const staffOnly = [
    ['POST', '/api/menu', { emri: 'x', cmimi: 1, kategori_id: 1 }],
    ['GET', '/api/inventar'],
    ['POST', '/api/inventar/pije', { emri_pijes: 'x', njesia: 'u', stoku_aktual: 1, stoku_minimal: 1 }],
    ['PATCH', '/api/inventar/pije/1', { sasia: 1 }],
    ['GET', '/api/pagesat'],
    ['GET', '/api/pagesat/1'],
    ['GET', '/api/statistika/xhiro-ditore'],
    ['GET', '/api/statistika/money-peak'],
    ['PATCH', '/api/porosite/1/statusi', { statusi_porosise: 'Anuluar' }],
    ['DELETE', '/api/porosite/1'],
    ['DELETE', '/api/rezervimet/1'],
  ];

  for (const [method, path, body] of staffOnly) {
    test(`${method} ${path} is 403 for a waiter`, async () => {
      const res = await api.request(method, path, { as: 'kamarier', body });
      assert.equal(res.status, 403);
      assert.equal(db.calls.length, 0);
    });

    test(`${method} ${path} is open to a manager`, async () => {
      const res = await api.request(method, path, { as: 'menaxher', body });
      assert.notEqual(res.status, 403);
      assert.notEqual(res.status, 401);
    });
  }

  test('a waiter can still read the menu, tables and their orders', async () => {
    for (const path of ['/api/menu', '/api/tavolinat', '/api/kategorite', '/api/porosite', '/api/rezervimet']) {
      db.reset();
      const res = await api.request('GET', path, { as: 'kamarier' });
      assert.equal(res.status, 200, path);
    }
  });
});
