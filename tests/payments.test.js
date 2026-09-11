'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

describe('POST /api/pagesat', () => {
  const api = useServer();

  test('records a payment and returns its id', async () => {
    db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 42 }] });

    const res = await api.request('POST', '/api/pagesat', {
      body: {
        porosi_id: 184,
        shuma: 3260,
        metoda_pageses: 'Cash',
        ora_pageses: '2026-09-11T18:30:00.000Z',
      },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, pagese_id: 42 });
    assert.deepEqual(db.calls[0].params, [184, 3260, 'Cash', '2026-09-11T18:30:00.000Z']);
  });

  test('accepts each payment method the UI offers', async () => {
    for (const metoda of ['Cash', 'Kartë', 'Transferim']) {
      db.reset();
      db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });

      const res = await api.request('POST', '/api/pagesat', {
        body: { porosi_id: 1, shuma: 100, metoda_pageses: metoda, ora_pageses: new Date().toISOString() },
      });

      assert.equal(res.status, 201, `${metoda} should be accepted`);
      assert.equal(db.calls[0].params[2], metoda);
    }
  });

  test('returns 500 when the insert fails', async () => {
    db.when(/INSERT INTO pagesat/, new Error('down'));

    const res = await api.request('POST', '/api/pagesat', {
      body: { porosi_id: 1, shuma: 100, metoda_pageses: 'Cash', ora_pageses: 'now' },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });

  test(
    'rejects a payment with no amount',
    { todo: 'no validation: a payment with shuma undefined reaches Postgres and, if the column is nullable, is recorded' },
    async () => {
      const res = await api.request('POST', '/api/pagesat', { body: { porosi_id: 1 } });
      assert.equal(res.status, 400);
    }
  );

  test(
    'rejects an amount that does not match the order total',
    { todo: 'the client computes the total and the server trusts it, so any amount can be posted against an order' },
    async () => {
      db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });
      const res = await api.request('POST', '/api/pagesat', {
        body: { porosi_id: 184, shuma: 1, metoda_pageses: 'Cash', ora_pageses: 'now' },
      });
      assert.equal(res.status, 400);
    }
  );

  test(
    'closes the order and the payment together',
    { todo: 'DashboardPage posts the payment, then PATCHes each order separately; a failure between the two leaves a paid but open table' },
    async () => {
      db.when(/INSERT INTO pagesat/, { rows: [{ pagese_id: 1 }] });
      await api.request('POST', '/api/pagesat', {
        body: { porosi_id: 184, shuma: 100, metoda_pageses: 'Cash', ora_pageses: 'now' },
      });
      assert.ok(db.sql.includes('BEGIN'), 'payment and order close should share a transaction');
    }
  );
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
    assert.deepEqual(db.calls[0].params, ['42']);
  });

  test('returns an empty body for an unknown id', async () => {
    db.when(/FROM pagesat WHERE pagese_id/, { rows: [] });

    const res = await api.request('GET', '/api/pagesat/999999');

    assert.equal(res.status, 200);
    assert.equal(res.text, '', 'res.json(undefined) sends an empty body');
  });
});
