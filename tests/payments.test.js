'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

const OPEN = { porosi_id: 184, tavoline_id: 3, punonjes_id: 1, statusi_porosise: 'E Hapur' };

/**
 * Script the orders the payment route will look up: `{ [porosi_id]: { totali, ...row } }`.
 * One handler answers for every id, since the fake fires the first matching handler.
 */
function scriptOrders(orders) {
  db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, (text, params) => {
    const o = orders[params[0]];
    return o ? { rows: [{ ...OPEN, porosi_id: params[0], ...o, totali: undefined }] } : { rows: [] };
  });
  db.when(/SUM\(ap\.sasia \* am\.cmimi\)/, (text, params) => ({
    rows: [{ totali: String(orders[params[0]] ? orders[params[0]].totali : 0) }],
  }));
}

function openOrder(id, totali, extra = {}) {
  scriptOrders({ [id]: { totali, ...extra } });
}

describe('POST /api/pagesat', () => {
  const api = useServer();

  test('records a payment for the order total and closes the order, in one transaction', async () => {
    openOrder(184, 3260);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 42 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, shuma: 3260, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, {
      success: true,
      pagese_id: 42,
      pagesat: [{ porosi_id: 184, pagese_id: 42, shuma: 3260 }],
      totali: 3260,
    });

    const sql = db.sql;
    assert.equal(sql[0], 'BEGIN');
    assert.match(sql[1], /FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, 'the order row is locked');
    assert.match(sql[2], /SUM\(ap\.sasia \* am\.cmimi\)/, 'the total comes from the line items');
    assert.match(sql[3], /INSERT INTO pagesat/);
    assert.match(sql[4], /UPDATE porosite SET statusi_porosise/);
    assert.equal(sql[5], 'COMMIT');
    assert.equal(sql.length, 6);
    assert.equal(db.clients.at(-1).released, true);
  });

  test('the amount and timestamp come from the server, not the client', async () => {
    openOrder(184, 3260);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 42 }] });

    await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, shuma: 3260, metoda_pageses: 'Kartë', ora_pageses: '1999-01-01T00:00:00.000Z' },
    });

    const insert = db.matching(/INSERT INTO pagesat/)[0];
    assert.match(insert.text, /NOW\(\)/);
    assert.deepEqual(insert.params, [184, 3260, 'Kartë']);
    const close = db.matching(/UPDATE porosite/)[0];
    assert.deepEqual(close.params, ['E Mbyllur', 184]);
    assert.match(close.text, /ora_mbylljes = NOW\(\)/, 'the close time is recorded');
  });

  test('shuma is optional — the server total is used', async () => {
    openOrder(184, 1200);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.totali, 1200);
    assert.equal(db.matching(/INSERT INTO pagesat/)[0].params[1], 1200);
  });

  test('rejects an amount that does not match the order total', async () => {
    openOrder(184, 3260);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, shuma: 1, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.totali, 3260, 'the client is told the real total');
    assert.equal(db.matching(/INSERT INTO pagesat/).length, 0);
    assert.equal(db.matching(/UPDATE porosite/).length, 0);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('tolerates floating-point noise in the amount', async () => {
    openOrder(184, 10.1);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, shuma: 10.100000001, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 201);
  });

  test('settles several orders on a table with one payment each', async () => {
    scriptOrders({ 184: { totali: 1000 }, 185: { totali: 500 } });
    let next = 90;
    db.when(/INSERT INTO pagesat/, () => ({ rows: [{ pagese_id: next++ }] }));

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosite: [184, 185], shuma: 1500, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.totali, 1500);
    assert.deepEqual(res.body.pagesat, [
      { porosi_id: 184, pagese_id: 90, shuma: 1000 },
      { porosi_id: 185, pagese_id: 91, shuma: 500 },
    ]);
    const inserts = db.matching(/INSERT INTO pagesat/);
    assert.deepEqual(inserts.map((c) => c.params), [[184, 1000, 'Cash'], [185, 500, 'Cash']],
      'each order is paid for its own total, so pagesat reconciles with porosite');
    assert.equal(db.matching(/UPDATE porosite/).length, 2);
    assert.equal(db.sql.filter((s) => s === 'BEGIN').length, 1, 'one transaction for the whole table');
  });

  test('ignores a duplicated id in porosite[]', async () => {
    openOrder(184, 1000);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosite: [184, 184], metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 201);
    assert.equal(db.matching(/INSERT INTO pagesat/).length, 1);
  });

  test('refuses to pay an order that is already closed', async () => {
    openOrder(184, 3260, { statusi_porosise: 'E Mbyllur' });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 409);
    assert.equal(db.matching(/INSERT INTO pagesat/).length, 0);
    assert.ok(db.sql.includes('ROLLBACK'));
  });

  test('returns 404 for an unknown order', async () => {
    db.when(/FOR UPDATE/, { rows: [] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 999999, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 404);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('pays nothing if any order in the batch is unpayable', async () => {
    scriptOrders({ 184: { totali: 1000 }, 185: { totali: 500, statusi_porosise: 'E Mbyllur' } });
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosite: [184, 185], metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 409);
    assert.equal(db.matching(/INSERT INTO pagesat/).length, 0);
    assert.ok(db.sql.includes('ROLLBACK'));
  });

  test("a waiter cannot settle another waiter's order", async () => {
    openOrder(184, 1000, { punonjes_id: 5 });

    const res = await api.request('POST', '/api/pagesat', {
      as: 'kamarier',
      body: { porosi_id: 184, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 403);
    assert.equal(db.matching(/INSERT INTO pagesat/).length, 0);
  });

  test('a waiter can settle their own table', async () => {
    openOrder(184, 1000);
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

    const res = await api.request('POST', '/api/pagesat', {
      as: 'kamarier',
      body: { porosi_id: 184, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 201);
  });

  test('accepts each payment method the UI offers', async () => {
    for (const metoda of ['Cash', 'Kartë', 'Transferim']) {
      db.reset();
      openOrder(1, 100);
      db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

      const res = await api.request('POST', '/api/pagesat', {
        body: { porosi_id: 1, shuma: 100, metoda_pageses: metoda },
      });

      assert.equal(res.status, 201, `${metoda} should be accepted`);
      assert.equal(db.matching(/INSERT INTO pagesat/)[0].params[2], metoda);
    }
  });

  test('rolls back and returns 500 when the insert fails', async () => {
    openOrder(184, 100);
    db.when(/INSERT INTO pagesat/, new Error('down'));

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 184, shuma: 100, metoda_pageses: 'Cash' },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.ok(!db.sql.includes('COMMIT'));
    assert.equal(db.matching(/UPDATE porosite/).length, 0, 'the order stays open');
    assert.equal(db.clients.at(-1).released, true);
  });

  describe('validation', () => {
    const invalid = [
      ['an empty body', {}],
      ['no order', { shuma: 100, metoda_pageses: 'Cash' }],
      ['an empty batch', { porosite: [], metoda_pageses: 'Cash' }],
      ['a non-numeric order id', { porosi_id: 'abc', metoda_pageses: 'Cash' }],
      ['a bad id inside the batch', { porosite: [184, 'x'], metoda_pageses: 'Cash' }],
      ['no payment method', { porosi_id: 184, shuma: 100 }],
      ['an unknown payment method', { porosi_id: 184, shuma: 100, metoda_pageses: 'Bitcoin' }],
      ['a negative amount', { porosi_id: 184, shuma: -5, metoda_pageses: 'Cash' }],
      ['a non-numeric amount', { porosi_id: 184, shuma: 'shumë', metoda_pageses: 'Cash' }],
    ];

    for (const [name, body] of invalid) {
      test(`rejects ${name}`, async () => {
        const res = await api.request('POST', '/api/pagesat', { body });
        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.equal(db.calls.length, 0, 'nothing is opened for invalid input');
      });
    }
  });
});

describe('GET /api/pagesat', () => {
  const api = useServer();

  test('returns the 100 most recent payments', async () => {
    db.when(/FROM pagesat/, { rows: [{ pagese_id: 42, shuma: 3260 }] });

    const res = await api.request('GET', '/api/pagesat');

    assert.equal(res.status, 200);
    assert.match(db.calls[0].text, /ORDER BY ora_pageses DESC/);
    assert.match(db.calls[0].text, /LIMIT 100/);
  });

  test('answers failures with an empty array', async () => {
    db.when(/FROM pagesat/, new Error('down'));
    const res = await api.request('GET', '/api/pagesat');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('GET /api/pagesat/:id', () => {
  const api = useServer();

  test('returns a single payment', async () => {
    db.when(/FROM pagesat WHERE pagese_id/, { rows: [{ pagese_id: 42, shuma: 3260 }] });

    const res = await api.request('GET', '/api/pagesat/42');

    assert.equal(res.status, 200);
    assert.equal(res.body.pagese_id, 42);
    assert.deepEqual(db.calls[0].params, [42]);
  });

  test('returns 404 for an unknown id', async () => {
    db.when(/FROM pagesat WHERE pagese_id/, { rows: [] });

    const res = await api.request('GET', '/api/pagesat/999999');

    assert.equal(res.status, 404);
  });

  test('rejects a non-numeric id', async () => {
    const res = await api.request('GET', '/api/pagesat/abc');
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });
});
