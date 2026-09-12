'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

const ORDER = {
  porosi_id: 184,
  tavoline_id: 3,
  punonjes_id: 1,
  statusi_porosise: 'E Hapur',
  numri_tavolines: '7',
  kamarier: 'Arben Hoxha',
};

describe('GET /api/porosite', () => {
  const api = useServer();

  test('joins table and waiter, newest first, capped at 50', async () => {
    db.when(/FROM porosite p/, { rows: [ORDER] });

    const res = await api.request('GET', '/api/porosite');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [ORDER]);
    const sql = db.calls[0].text;
    assert.match(sql, /LEFT JOIN tavolinat t/);
    assert.match(sql, /LEFT JOIN punonjesit pu/);
    assert.match(sql, /ORDER BY p\.porosi_id DESC/);
    assert.match(sql, /LIMIT 50/);
    assert.deepEqual(db.calls[0].params, []);
  });

  test('filters by waiter', async () => {
    db.when(/FROM porosite p/, { rows: [] });

    await api.request('GET', '/api/porosite?punonjes_id=1');

    assert.match(db.calls[0].text, /p\.punonjes_id = \$1/);
    assert.deepEqual(db.calls[0].params, [1]);
  });

  test('filters by status', async () => {
    db.when(/FROM porosite p/, { rows: [] });

    await api.request('GET', '/api/porosite?statusi=E%20Hapur');

    assert.match(db.calls[0].text, /p\.statusi_porosise = \$1/);
    assert.deepEqual(db.calls[0].params, ['E Hapur']);
  });

  test('numbers placeholders correctly when both filters are supplied', async () => {
    db.when(/FROM porosite p/, { rows: [] });

    await api.request('GET', '/api/porosite?punonjes_id=1&statusi=E%20Hapur');

    assert.match(db.calls[0].text, /p\.punonjes_id = \$1/);
    assert.match(db.calls[0].text, /p\.statusi_porosise = \$2/);
    assert.deepEqual(db.calls[0].params, [1, 'E Hapur']);
  });

  test('rejects a non-numeric waiter filter', async () => {
    const res = await api.request('GET', '/api/porosite?punonjes_id=abc');
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test('a waiter only ever sees their own orders', async () => {
    db.when(/FROM porosite p/, { rows: [] });

    // The token belongs to punonjes_id 1; the query string asks for someone else.
    await api.request('GET', '/api/porosite?punonjes_id=5', { as: 'kamarier' });

    assert.match(db.calls[0].text, /p\.punonjes_id = \$1/);
    assert.deepEqual(db.calls[0].params, [1]);
  });

  test('answers failures with an empty array', async () => {
    db.when(/FROM porosite p/, new Error('down'));
    const res = await api.request('GET', '/api/porosite');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('GET /api/porosite/:id', () => {
  const api = useServer();

  test('returns the order together with its priced line items', async () => {
    db.when(/FROM porosite p/, { rows: [ORDER] });
    db.when(/FROM artikujt_porosise ap/, {
      rows: [{ artikull_porosie_id: 1, emri: 'Tavë Kosi', sasia: 2, cmimi: 750, totali: 1500 }],
    });

    const res = await api.request('GET', '/api/porosite/184');

    assert.equal(res.status, 200);
    assert.equal(res.body.porosi.porosi_id, 184);
    assert.equal(res.body.artikujt[0].totali, 1500);
    assert.match(db.calls[1].text, /ap\.sasia \* am\.cmimi/, 'line total is computed in SQL');
    assert.deepEqual(db.calls[0].params, [184]);
  });

  test('returns 500 when either query fails', async () => {
    db.when(/FROM porosite p/, new Error('down'));
    const res = await api.request('GET', '/api/porosite/184');
    assert.equal(res.status, 500);
    assert.ok(res.body.error);
  });

  test('returns 404 for an unknown order', async () => {
    db.when(/FROM porosite p/, { rows: [] });
    const res = await api.request('GET', '/api/porosite/999999');
    assert.equal(res.status, 404);
    assert.equal(db.calls.length, 1, 'the line items are never fetched');
  });

  test('rejects a non-numeric id without querying', async () => {
    const res = await api.request('GET', '/api/porosite/abc');
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test("a waiter cannot open another waiter's order", async () => {
    db.when(/FROM porosite p/, { rows: [{ ...ORDER, punonjes_id: 5 }] });
    const res = await api.request('GET', '/api/porosite/184', { as: 'kamarier' });
    assert.equal(res.status, 403);
  });

  test('a waiter can open their own order', async () => {
    db.when(/FROM porosite p/, { rows: [ORDER] });
    const res = await api.request('GET', '/api/porosite/184', { as: 'kamarier' });
    assert.equal(res.status, 200);
  });
});

describe('POST /api/porosite', () => {
  const api = useServer();

  const validBody = {
    tavoline_id: 3,
    punonjes_id: 1,
    artikujt: [
      { artikull_id: 2, sasia: 2 },
      { artikull_id: 1, sasia: 4 },
    ],
  };

  /** The SQL between BEGIN and COMMIT/ROLLBACK, minus the stock-link probe. */
  function transactionBody() {
    return db.sql.filter((s) => !/information_schema/.test(s));
  }

  test('creates the order and its lines inside one transaction', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });

    const res = await api.request('POST', '/api/porosite', { body: validBody });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, porosi_id: 200 });

    const sql = transactionBody();
    assert.equal(sql[0], 'BEGIN');
    assert.match(sql[1], /INSERT INTO porosite/);
    assert.match(sql[2], /INSERT INTO artikujt_porosise/);
    assert.match(sql[3], /INSERT INTO artikujt_porosise/);
    assert.equal(sql[4], 'COMMIT');
    assert.equal(sql.length, 5, 'one insert per line item, nothing more');
  });

  test('stamps the order open with the server clock', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });

    await api.request('POST', '/api/porosite', { body: validBody });

    const insert = db.matching(/INSERT INTO porosite/)[0];
    assert.match(insert.text, /NOW\(\)/, 'order time must come from the database, not the client');
    assert.deepEqual(insert.params, [3, 1, 'E Hapur']);
  });

  test('coerces line item ids and quantities to integers', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });

    await api.request('POST', '/api/porosite', {
      body: { ...validBody, artikujt: [{ artikull_id: '2', sasia: '3' }] },
    });

    const line = db.matching(/INSERT INTO artikujt_porosise/)[0];
    assert.deepEqual(line.params, [200, 2, 3]);
  });

  test('a waiter always orders as themselves', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });

    await api.request('POST', '/api/porosite', {
      as: 'kamarier',
      body: { ...validBody, punonjes_id: 5 },
    });

    const insert = db.matching(/INSERT INTO porosite/)[0];
    assert.equal(insert.params[1], 1, 'punonjes_id comes from the token, not the body');
  });

  test('a waiter need not send punonjes_id at all', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });

    const res = await api.request('POST', '/api/porosite', {
      as: 'kamarier',
      body: { tavoline_id: 3, artikujt: validBody.artikujt },
    });

    assert.equal(res.status, 201);
  });

  test('rolls back and reports 500 when a line item fails', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });
    db.when(/INSERT INTO artikujt_porosise/, new Error('disk full'));

    const res = await api.request('POST', '/api/porosite', { body: validBody });

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.doesNotMatch(res.body.error, /disk full/, 'the raw database error stays on the server');
    assert.ok(db.sql.includes('ROLLBACK'), 'the transaction must be rolled back');
    assert.ok(!db.sql.includes('COMMIT'), 'nothing may be committed');
  });

  test('reports an unknown table, waiter or item as 400', async () => {
    db.when(/INSERT INTO porosite/, Object.assign(new Error('fk'), { code: '23503' }));

    const res = await api.request('POST', '/api/porosite', { body: validBody });

    assert.equal(res.status, 400);
    assert.ok(db.sql.includes('ROLLBACK'));
  });

  test('always returns the pooled client, success or failure', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });
    await api.request('POST', '/api/porosite', { body: validBody });
    assert.equal(db.clients.at(-1).released, true);

    db.reset();
    db.when(/INSERT INTO porosite/, new Error('boom'));
    await api.request('POST', '/api/porosite', { body: validBody });
    assert.equal(db.clients.at(-1).released, true, 'a leaked client exhausts the pool of 5');
  });

  describe('validation', () => {
    const invalid = [
      ['no table', { punonjes_id: 1, artikujt: [{ artikull_id: 1, sasia: 1 }] }],
      ['no waiter', { tavoline_id: 3, artikujt: [{ artikull_id: 1, sasia: 1 }] }],
      ['no items', { tavoline_id: 3, punonjes_id: 1 }],
      ['empty basket', { tavoline_id: 3, punonjes_id: 1, artikujt: [] }],
      ['items that are not a list', { tavoline_id: 3, punonjes_id: 1, artikujt: { artikull_id: 1, sasia: 1 } }],
    ];

    for (const [name, body] of invalid) {
      test(`rejects an order with ${name}`, async () => {
        const res = await api.request('POST', '/api/porosite', { body });

        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.match(res.body.error, /Plotëso fushat/);
        assert.equal(db.calls.length, 0, 'must not open a transaction for invalid input');
      });
    }

    const badLines = [
      ['a zero quantity', [{ artikull_id: 1, sasia: 0 }]],
      ['a negative quantity', [{ artikull_id: 1, sasia: -5 }]],
      ['a fractional quantity', [{ artikull_id: 1, sasia: 1.5 }]],
      ['a missing item id', [{ sasia: 1 }]],
      ['a non-numeric item id', [{ artikull_id: 'birrë', sasia: 1 }]],
      ['a line that is not an object', [null]],
      ['one bad line among good ones', [{ artikull_id: 1, sasia: 1 }, { artikull_id: 2, sasia: 0 }]],
    ];

    for (const [name, artikujt] of badLines) {
      test(`rejects ${name}`, async () => {
        db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
        const res = await api.request('POST', '/api/porosite', { body: { ...validBody, artikujt } });
        assert.equal(res.status, 400);
        assert.equal(db.calls.length, 0, 'the whole basket is checked before anything is written');
      });
    }
  });
});

describe('PATCH /api/porosite/:id/statusi', () => {
  const api = useServer();

  test('updates the order status', async () => {
    db.when(/UPDATE porosite/, { rows: [{ porosi_id: 184 }] });

    const res = await api.request('PATCH', '/api/porosite/184/statusi', {
      body: { statusi_porosise: 'E Mbyllur' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['E Mbyllur', 184]);
  });

  test('accepts each status the system uses', async () => {
    for (const statusi of ['E Hapur', 'E Mbyllur', 'Anuluar']) {
      db.reset();
      db.when(/UPDATE porosite/, { rows: [{ porosi_id: 184 }] });
      const res = await api.request('PATCH', '/api/porosite/184/statusi', { body: { statusi_porosise: statusi } });
      assert.equal(res.status, 200, statusi);
    }
  });

  test('stamps the close time, and clears it on reopen', async () => {
    db.when(/UPDATE porosite/, { rows: [{ porosi_id: 184 }] });
    await api.request('PATCH', '/api/porosite/184/statusi', { body: { statusi_porosise: 'E Mbyllur' } });
    assert.match(db.calls[0].text, /ora_mbylljes = CASE WHEN \$1 = 'E Hapur' THEN NULL ELSE NOW\(\) END/);
  });

  test('returns 500 on failure', async () => {
    db.when(/UPDATE porosite/, new Error('down'));
    const res = await api.request('PATCH', '/api/porosite/184/statusi', {
      body: { statusi_porosise: 'E Mbyllur' },
    });
    assert.equal(res.status, 500);
  });

  test('rejects an unknown status value', async () => {
    db.when(/UPDATE porosite/, { rows: [{ porosi_id: 184 }] });
    const res = await api.request('PATCH', '/api/porosite/184/statusi', {
      body: { statusi_porosise: 'e hapur' },
    });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test('returns 404 for an unknown order', async () => {
    db.when(/UPDATE porosite/, { rows: [] });
    const res = await api.request('PATCH', '/api/porosite/999999/statusi', {
      body: { statusi_porosise: 'E Mbyllur' },
    });
    assert.equal(res.status, 404);
  });
});

describe('DELETE /api/porosite/:id', () => {
  const api = useServer();

  function transactionBody() {
    return db.sql.filter((s) => !/information_schema/.test(s));
  }

  test('removes line items before the order, in a transaction', async () => {
    db.when(/DELETE FROM porosite/, { rows: [{ porosi_id: 184 }] });

    const res = await api.request('DELETE', '/api/porosite/184');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });

    const sql = transactionBody();
    assert.equal(sql[0], 'BEGIN');
    assert.match(sql[1], /SELECT 1 FROM pagesat/, 'checks for a payment first');
    assert.match(sql[2], /DELETE FROM artikujt_porosise/);
    assert.match(sql[3], /DELETE FROM porosite/);
    assert.equal(sql[4], 'COMMIT');
    assert.equal(db.clients.at(-1).released, true);
  });

  test('rolls back when a delete fails', async () => {
    db.when(/DELETE FROM artikujt_porosise/, new Error('locked'));

    const res = await api.request('DELETE', '/api/porosite/184');

    assert.equal(res.status, 500);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('refuses to delete an order that has been paid', async () => {
    db.when(/SELECT 1 FROM pagesat/, { rows: [{ '?column?': 1 }] });

    const res = await api.request('DELETE', '/api/porosite/184');

    assert.equal(res.status, 409);
    assert.equal(db.matching(/DELETE/).length, 0, 'nothing is deleted');
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('returns 404 for an unknown order', async () => {
    db.when(/DELETE FROM porosite/, { rows: [] });

    const res = await api.request('DELETE', '/api/porosite/999999');

    assert.equal(res.status, 404);
    assert.ok(db.sql.includes('ROLLBACK'));
  });
});
