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
    assert.deepEqual(db.calls[0].params, ['184']);
  });

  test('returns 500 when either query fails', async () => {
    db.when(/FROM porosite p/, new Error('down'));
    const res = await api.request('GET', '/api/porosite/184');
    assert.equal(res.status, 500);
    assert.ok(res.body.error);
  });

  test(
    'returns 404 for an unknown order',
    { todo: 'a missing order answers 200 with porosi: undefined, which the client renders as a blank modal' },
    async () => {
      db.when(/FROM porosite p/, { rows: [] });
      db.when(/FROM artikujt_porosise ap/, { rows: [] });
      const res = await api.request('GET', '/api/porosite/999999');
      assert.equal(res.status, 404);
    }
  );
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

  test('creates the order and its lines inside one transaction', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });

    const res = await api.request('POST', '/api/porosite', { body: validBody });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, porosi_id: 200 });

    const sql = db.sql;
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

  test('rolls back and reports 500 when a line item fails', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 200 }] });
    db.when(/INSERT INTO artikujt_porosise/, new Error('foreign key violation'));

    const res = await api.request('POST', '/api/porosite', { body: validBody });

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /foreign key violation/);
    assert.ok(db.sql.includes('ROLLBACK'), 'the transaction must be rolled back');
    assert.ok(!db.sql.includes('COMMIT'), 'nothing may be committed');
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

    test(
      'rejects a zero or negative quantity',
      { todo: 'sasia is only parseInt-ed, so 0 and negative quantities are written as-is and skew totals' },
      async () => {
        db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
        const res = await api.request('POST', '/api/porosite', {
          body: { ...validBody, artikujt: [{ artikull_id: 1, sasia: -5 }] },
        });
        assert.equal(res.status, 400);
      }
    );

    test(
      'does not leak the raw database error to the client',
      { todo: 'the 500 body concatenates err.message, exposing schema details to the browser' },
      async () => {
        db.when(/INSERT INTO porosite/, new Error('relation "porosite" does not exist'));
        const res = await api.request('POST', '/api/porosite', { body: validBody });
        assert.doesNotMatch(res.body.error, /relation "porosite"/);
      }
    );
  });
});

describe('PATCH /api/porosite/:id/statusi', () => {
  const api = useServer();

  test('updates the order status', async () => {
    db.when(/UPDATE porosite/, { rows: [] });

    const res = await api.request('PATCH', '/api/porosite/184/statusi', {
      body: { statusi_porosise: 'E Mbyllur' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['E Mbyllur', '184']);
  });

  test('returns 500 on failure', async () => {
    db.when(/UPDATE porosite/, new Error('down'));
    const res = await api.request('PATCH', '/api/porosite/184/statusi', {
      body: { statusi_porosise: 'E Mbyllur' },
    });
    assert.equal(res.status, 500);
  });

  test(
    'rejects an unknown status value',
    { todo: "statusi_porosise is unvalidated, so a typo silently removes an order from every 'E Hapur' view" },
    async () => {
      db.when(/UPDATE porosite/, { rows: [] });
      const res = await api.request('PATCH', '/api/porosite/184/statusi', {
        body: { statusi_porosise: 'e hapur' },
      });
      assert.equal(res.status, 400);
    }
  );
});

describe('DELETE /api/porosite/:id', () => {
  const api = useServer();

  test('removes line items before the order, in a transaction', async () => {
    const res = await api.request('DELETE', '/api/porosite/184');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });

    const sql = db.sql;
    assert.equal(sql[0], 'BEGIN');
    assert.match(sql[1], /DELETE FROM artikujt_porosise/);
    assert.match(sql[2], /DELETE FROM porosite/);
    assert.equal(sql[3], 'COMMIT');
    assert.equal(db.clients.at(-1).released, true);
  });

  test('rolls back when a delete fails', async () => {
    db.when(/DELETE FROM artikujt_porosise/, new Error('locked'));

    const res = await api.request('DELETE', '/api/porosite/184');

    assert.equal(res.status, 500);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test(
    'refuses to delete an order that has been paid',
    { todo: 'deleting an order leaves its row in pagesat orphaned, so takings no longer reconcile' },
    async () => {
      const res = await api.request('DELETE', '/api/porosite/184');
      assert.equal(res.status, 409);
    }
  );
});
