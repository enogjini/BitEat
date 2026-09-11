'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

const ADMIN_ROW = { punonjes_id: 99, emri: 'admin', mbiemri: '', password: 'sekret', lloji_perdoruesit: 'admin' };
const MANAGER_ROW = { punonjes_id: 5, emri: 'Ilir', mbiemri: 'Berisha', password: 'm1', lloji_perdoruesit: 'menaxher' };
const WAITER_ROW = { punonjes_id: 1, emri: 'Arben', mbiemri: 'Hoxha', password: 'w1', lloji_perdoruesit: 'kamarier' };

describe('POST /api/login', () => {
  const api = useServer();

  describe('admin', () => {
    test('returns the user on matching credentials', async () => {
      db.when(/FROM punonjesit/, { rows: [ADMIN_ROW] });

      const res = await api.request('POST', '/api/login', {
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.lloji, 'admin');
      assert.equal(res.body.user.punonjes_id, 99);
    });

    test('matches on name and password only', async () => {
      db.when(/FROM punonjesit/, { rows: [ADMIN_ROW] });

      await api.request('POST', '/api/login', {
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });

      assert.equal(db.calls.length, 1);
      assert.match(db.calls[0].text, /WHERE emri = \$1 AND password = \$2/);
      assert.deepEqual(db.calls[0].params, ['admin', 'sekret']);
    });

    test('rejects wrong credentials with 401', async () => {
      db.when(/FROM punonjesit/, { rows: [] });

      const res = await api.request('POST', '/api/login', {
        body: { emri_perdoruesit: 'admin', password: 'gabim', lloji: 'admin' },
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Kredencialet gabim!');
    });
  });

  describe('menaxher', () => {
    test('additionally constrains the role in SQL', async () => {
      db.when(/FROM punonjesit/, { rows: [MANAGER_ROW] });

      const res = await api.request('POST', '/api/login', {
        body: { emri_perdoruesit: 'Ilir', password: 'm1', lloji: 'menaxher' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.lloji, 'menaxher');
      assert.match(db.calls[0].text, /lloji_perdoruesit = \$3/);
      assert.deepEqual(db.calls[0].params, ['Ilir', 'm1', 'menaxher']);
    });

    test('an admin row does not satisfy a manager login', async () => {
      // The role predicate is in SQL, so a non-manager simply returns no rows.
      db.when(/FROM punonjesit/, { rows: [] });

      const res = await api.request('POST', '/api/login', {
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'menaxher' },
      });

      assert.equal(res.status, 401);
    });
  });

  describe('kamarier', () => {
    test('authenticates by employee id rather than name', async () => {
      db.when(/FROM punonjesit/, { rows: [WAITER_ROW] });

      const res = await api.request('POST', '/api/login', {
        body: { punonjes_id: 1, password: 'w1', lloji: 'kamarier' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.lloji, 'kamarier');
      assert.match(db.calls[0].text, /WHERE punonjes_id = \$1 AND password = \$2/);
      assert.deepEqual(db.calls[0].params, [1, 'w1']);
    });

    test('requires both id and password', async () => {
      for (const body of [
        { password: 'w1', lloji: 'kamarier' },
        { punonjes_id: 1, lloji: 'kamarier' },
        { lloji: 'kamarier' },
      ]) {
        db.reset();
        const res = await api.request('POST', '/api/login', { body });
        assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
        assert.equal(res.body.message, 'Plotëso fushat!');
        assert.equal(db.calls.length, 0, 'should not query on invalid input');
      }
    });

    test('rejects an unknown id with 401', async () => {
      db.when(/FROM punonjesit/, { rows: [] });
      const res = await api.request('POST', '/api/login', {
        body: { punonjes_id: 4242, password: 'x', lloji: 'kamarier' },
      });
      assert.equal(res.status, 401);
    });
  });

  describe('failure handling', () => {
    test('returns 500 when the database errors', async () => {
      db.when(/FROM punonjesit/, new Error('connection terminated'));

      const res = await api.request('POST', '/api/login', {
        body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
      });

      assert.equal(res.status, 500);
      assert.equal(res.body.success, false);
    });

    test(
      'answers a request with an unrecognised lloji',
      { todo: 'no branch matches an unknown lloji, so the handler returns without responding and the request hangs until the client gives up' },
      async () => {
        db.when(/FROM punonjesit/, { rows: [] });
        const res = await api.request('POST', '/api/login', {
          body: { emri_perdoruesit: 'x', password: 'y', lloji: 'kuzhinier' },
          timeoutMs: 1000,
        });
        assert.equal(res.status, 400);
      }
    );

    test(
      'never returns the password hash to the client',
      { todo: 'login responds with SELECT *, so the stored password travels back to the browser' },
      async () => {
        db.when(/FROM punonjesit/, { rows: [ADMIN_ROW] });
        const res = await api.request('POST', '/api/login', {
          body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
        });
        assert.equal(res.body.user.password, undefined);
      }
    );

    test(
      'issues a session token',
      { todo: 'login returns a bare user object; there is no token, so every other /api route is unauthenticated' },
      async () => {
        db.when(/FROM punonjesit/, { rows: [ADMIN_ROW] });
        const res = await api.request('POST', '/api/login', {
          body: { emri_perdoruesit: 'admin', password: 'sekret', lloji: 'admin' },
        });
        assert.ok(res.body.token, 'expected a session token');
      }
    );
  });
});
