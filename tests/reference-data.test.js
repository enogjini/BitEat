'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

describe('GET /api/tavolinat', () => {
  const api = useServer();

  test('returns the named columns ordered by location then number', async () => {
    const rows = [{ tavoline_id: 1, numri_tavolines: '1', kapaciteti: 4, vendndodhja: 'Brenda', gjendja: 'E lirë' }];
    db.when(/FROM tavolinat/, { rows });

    const res = await api.request('GET', '/api/tavolinat');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, rows);
    assert.match(db.calls[0].text, /ORDER BY vendndodhja, numri_tavolines/);
    assert.doesNotMatch(db.calls[0].text, /SELECT \*/, 'should select explicit columns');
  });

  test('answers failures with an empty array', async () => {
    db.when(/FROM tavolinat/, new Error('down'));
    const res = await api.request('GET', '/api/tavolinat');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('GET /api/tavolinat/status', () => {
  const api = useServer();

  const FLOOR = [
    { tavoline_id: 3, numri_tavolines: 7, vendndodhja: 'oborri', kapaciteti: 4, statusi: 'E zënë', kamarier: 'Diane, Eli', numri_porosive: 2, totali_hapur: '1680', rezervim_id: null },
    { tavoline_id: 9, numri_tavolines: 1, vendndodhja: 'VIP', kapaciteti: 2, statusi: 'E rezervuar', kamarier: null, numri_porosive: 0, totali_hapur: '0', rezervim_id: 51, rezervim_klienti: 'Familja Bushati', rezervim_ora: '20:30:00' },
  ];

  test('returns one row per table with a derived status', async () => {
    db.when(/FROM tavolinat t/, { rows: FLOOR });

    const res = await api.request('GET', '/api/tavolinat/status');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, FLOOR);
    const sql = db.calls[0].text;
    assert.match(sql, /LEFT JOIN hapura h/, 'tables with no orders must still appear');
    assert.match(sql, /p\.statusi_porosise = 'E Hapur'/, 'only open orders count');
    assert.match(sql, /GROUP BY p\.tavoline_id/, 'one row per table, however many waiters serve it');
    assert.match(sql, /string_agg\(DISTINCT pu\.emri/, 'every waiter on the table is named');
    assert.match(sql, /SUM\(ap\.sasia \* am\.cmimi\)/, 'the open bill is totalled');
    assert.doesNotMatch(sql, /t\.gjendja/, 'the stored state column is not consulted');
  });

  test('derives the status: occupied beats reserved beats free', async () => {
    db.when(/FROM tavolinat t/, { rows: [] });
    await api.request('GET', '/api/tavolinat/status');
    const sql = db.calls[0].text;
    assert.match(sql, /WHEN h\.numri_porosive > 0 THEN 'E zënë'/);
    assert.match(sql, /THEN 'E rezervuar'/);
    assert.match(sql, /ELSE 'E lirë'/);
  });

  test("looks at today's confirmed bookings in the restaurant's timezone", async () => {
    db.when(/FROM tavolinat t/, { rows: [] });
    await api.request('GET', '/api/tavolinat/status');
    const { text, params } = db.calls[0];
    assert.match(text, /NOW\(\) AT TIME ZONE \$1/);
    assert.match(text, /r\.statusi = 'E konfirmuar'/);
    assert.deepEqual(params, ['Europe/Tirane', 7200]);
  });

  test('orders by location then table number, without casting the label', async () => {
    db.when(/FROM tavolinat t/, { rows: [] });
    await api.request('GET', '/api/tavolinat/status');
    assert.match(db.calls[0].text, /ORDER BY t\.vendndodhja, t\.numri_tavolines/);
    assert.doesNotMatch(db.calls[0].text, /CAST\(t\.numri_tavolines AS INTEGER\)/);
  });

  test('is open to waiters', async () => {
    db.when(/FROM tavolinat t/, { rows: [] });
    const res = await api.request('GET', '/api/tavolinat/status', { as: 'kamarier' });
    assert.equal(res.status, 200);
  });

  test('answers failures with an empty array', async () => {
    db.when(/FROM tavolinat t/, new Error('down'));
    const res = await api.request('GET', '/api/tavolinat/status');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('GET /api/tavolinat/:id/porosite', () => {
  const api = useServer();

  const TABLE = { tavoline_id: 3, numri_tavolines: 7, vendndodhja: 'oborri', kapaciteti: 4 };
  const OPEN = [
    { porosi_id: 184, punonjes_id: 1, kamarier: 'Arben Hoxha', ora_porosise: '2026-09-12T18:00:00.000Z' },
    { porosi_id: 185, punonjes_id: 5, kamarier: 'Diane Kola', ora_porosise: '2026-09-12T18:20:00.000Z' },
  ];
  const LINES = [
    { porosi_id: 184, artikull_porosie_id: 1, artikull_id: 13, emri: 'Heineken 0.33 l', sasia: 3, cmimi: '370', totali: '1110' },
    { porosi_id: 184, artikull_porosie_id: 2, artikull_id: 54, emri: 'Tomahawk Steak', sasia: 1, cmimi: '570', totali: '570' },
    { porosi_id: 185, artikull_porosie_id: 3, artikull_id: 5, emri: 'Red Bull', sasia: 1, cmimi: '390', totali: '390' },
  ];

  test('returns the table, its open orders with their lines, and totals', async () => {
    db.when(/FROM tavolinat WHERE tavoline_id/, { rows: [TABLE] });
    db.when(/FROM porosite p/, { rows: OPEN });
    db.when(/FROM artikujt_porosise ap/, { rows: LINES });

    const res = await api.request('GET', '/api/tavolinat/3/porosite', { as: 'kamarier' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tavolina, TABLE);
    assert.equal(res.body.porosite.length, 2);
    assert.deepEqual(res.body.porosite[0].artikujt, LINES.slice(0, 2));
    assert.equal(res.body.porosite[0].totali, 1680);
    assert.equal(res.body.porosite[1].totali, 390);
    assert.equal(res.body.totali, 2070);
    assert.match(db.calls[1].text, /p\.statusi_porosise = 'E Hapur'/);
    assert.deepEqual(db.calls[2].params, [[184, 185]], 'lines are fetched for all orders in one query');
  });

  test('an empty table has no orders and skips the line query', async () => {
    db.when(/FROM tavolinat WHERE tavoline_id/, { rows: [TABLE] });
    db.when(/FROM porosite p/, { rows: [] });

    const res = await api.request('GET', '/api/tavolinat/3/porosite');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.porosite, []);
    assert.equal(res.body.totali, 0);
    assert.equal(db.calls.length, 2);
  });

  test('returns 404 for an unknown table', async () => {
    db.when(/FROM tavolinat WHERE tavoline_id/, { rows: [] });
    const res = await api.request('GET', '/api/tavolinat/9999/porosite');
    assert.equal(res.status, 404);
    assert.equal(db.calls.length, 1);
  });

  test('rejects a non-numeric id', async () => {
    const res = await api.request('GET', '/api/tavolinat/bar/porosite');
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test('returns 500 when a query fails', async () => {
    db.when(/FROM tavolinat WHERE tavoline_id/, new Error('down'));
    const res = await api.request('GET', '/api/tavolinat/3/porosite');
    assert.equal(res.status, 500);
  });
});

describe('PATCH /api/tavolinat/:id/gjendja', () => {
  const api = useServer();

  test('updates the table state', async () => {
    db.when(/UPDATE tavolinat/, { rows: [{ tavoline_id: 3 }] });

    const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', {
      body: { gjendja: 'E zënë' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['E zënë', 3]);
  });

  test('accepts each table state', async () => {
    for (const gjendja of ['E lirë', 'E zënë', 'E rezervuar']) {
      db.reset();
      db.when(/UPDATE tavolinat/, { rows: [{ tavoline_id: 3 }] });
      const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', { body: { gjendja } });
      assert.equal(res.status, 200, gjendja);
    }
  });

  test('reports failures as 500', async () => {
    db.when(/UPDATE tavolinat/, new Error('nope'));
    const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', { body: { gjendja: 'E lirë' } });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });

  test('reports 404 for a table that does not exist', async () => {
    db.when(/UPDATE tavolinat/, { rows: [] });
    const res = await api.request('PATCH', '/api/tavolinat/9999/gjendja', { body: { gjendja: 'E lirë' } });
    assert.equal(res.status, 404);
  });

  test('rejects an arbitrary state string', async () => {
    db.when(/UPDATE tavolinat/, { rows: [{ tavoline_id: 3 }] });
    const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', { body: { gjendja: 'bananas' } });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test('rejects a non-numeric id', async () => {
    const res = await api.request('PATCH', '/api/tavolinat/abc/gjendja', { body: { gjendja: 'E lirë' } });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });
});

describe('GET /api/kategorite', () => {
  const api = useServer();

  test('returns categories ordered by name', async () => {
    db.when(/FROM kategorite/, { rows: [{ kategori_id: 1, emri: 'Pije' }] });
    const res = await api.request('GET', '/api/kategorite');
    assert.equal(res.status, 200);
    assert.match(db.calls[0].text, /ORDER BY emri/);
  });

  test('answers failures with an empty array', async () => {
    db.when(/FROM kategorite/, new Error('down'));
    const res = await api.request('GET', '/api/kategorite');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('GET /api/punonjesit', () => {
  const api = useServer();

  test('excludes the admin account and never selects the password column', async () => {
    db.when(/FROM punonjesit/, { rows: [{ punonjes_id: 1, emri: 'Arben' }] });

    const res = await api.request('GET', '/api/punonjesit');

    assert.equal(res.status, 200);
    assert.deepEqual(db.calls[0].params, ['admin']);
    assert.doesNotMatch(db.calls[0].text, /password/, 'staff list must not expose passwords');
  });

  test('filters to waiters when lloji=kamarier', async () => {
    db.when(/FROM punonjesit/, { rows: [] });

    await api.request('GET', '/api/punonjesit?lloji=kamarier');

    assert.match(db.calls[0].text, /lloji_perdoruesit = \$2/);
    assert.deepEqual(db.calls[0].params, ['admin', 'kamarier']);
  });

  test('ignores an unrecognised lloji filter', async () => {
    db.when(/FROM punonjesit/, { rows: [] });

    await api.request('GET', '/api/punonjesit?lloji=menaxher');

    assert.deepEqual(db.calls[0].params, ['admin'], 'only kamarier is a supported filter');
  });
});
