'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

describe('GET /api/inventar', () => {
  const api = useServer();

  test('returns stock with a computed status and value', async () => {
    db.when(/FROM pije_inventar/, {
      rows: [
        { inventar_id: 1, emri_pijes: 'Birrë Korça 0.5L', stoku_aktual: 0, stoku_minimal: 48, statusi_stokut: '🔴 PA STOK', vlera_totale_stoku: 0 },
      ],
    });

    const res = await api.request('GET', '/api/inventar');

    assert.equal(res.status, 200);
    assert.equal(res.body[0].statusi_stokut, '🔴 PA STOK');
  });

  test('computes the four stock bands in SQL', async () => {
    db.when(/FROM pije_inventar/, { rows: [] });

    await api.request('GET', '/api/inventar');

    const sql = db.calls[0].text;
    assert.match(sql, /stoku_aktual = 0 THEN '🔴 PA STOK'/);
    assert.match(sql, /stoku_minimal \* 0\.25 THEN '🟠 KRITIK'/);
    assert.match(sql, /stoku_aktual <= stoku_minimal THEN '🟡 I ULËT'/);
    assert.match(sql, /ELSE '🟢 NORMAL'/);
  });

  test('computes stock value and a reorder quantity', async () => {
    db.when(/FROM pije_inventar/, { rows: [] });

    await api.request('GET', '/api/inventar');

    const sql = db.calls[0].text;
    assert.match(sql, /stoku_aktual \* cmimi_per_njesi\) AS vlera_totale_stoku/);
    assert.match(sql, /GREATEST\(stoku_minimal \* 2 - stoku_aktual, 0\)/);
  });

  test('sorts the most urgent stock first', async () => {
    db.when(/FROM pije_inventar/, { rows: [] });

    await api.request('GET', '/api/inventar');

    assert.match(db.calls[0].text, /ORDER BY[\s\S]*WHEN stoku_aktual = 0 THEN 0/);
  });

  test('answers failures with an empty array', async () => {
    db.when(/FROM pije_inventar/, new Error('down'));
    const res = await api.request('GET', '/api/inventar');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('POST /api/inventar/pije', () => {
  const api = useServer();

  test('adds a drink and returns its id', async () => {
    db.when(/INSERT INTO pije_inventar/, { rows: [{ inventar_id: 9 }] });

    const res = await api.request('POST', '/api/inventar/pije', {
      body: { emri_pijes: 'Fanta 0.33L', njesia: 'kanaçe', stoku_aktual: 24, stoku_minimal: 48, cmimi_per_njesi: 70 },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, inventar_id: 9 });
    assert.deepEqual(db.calls[0].params, ['Fanta 0.33L', 'kanaçe', 24, 48, 70]);
  });

  test('the unit price is optional', async () => {
    db.when(/INSERT INTO pije_inventar/, { rows: [{ inventar_id: 10 }] });

    const res = await api.request('POST', '/api/inventar/pije', {
      body: { emri_pijes: 'Ujë', njesia: 'shishe', stoku_aktual: 0, stoku_minimal: 12 },
    });

    assert.equal(res.status, 201);
    assert.equal(db.calls[0].params[4], null);
  });

  test('returns 500 when the insert fails', async () => {
    db.when(/INSERT INTO pije_inventar/, new Error('down'));
    const res = await api.request('POST', '/api/inventar/pije', {
      body: { emri_pijes: 'Fanta 0.33L', njesia: 'kanaçe', stoku_aktual: 24, stoku_minimal: 48 },
    });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });

  test('maps a duplicate name to 409', async () => {
    db.when(/INSERT INTO pije_inventar/, Object.assign(new Error('dup'), { code: '23505' }));
    const res = await api.request('POST', '/api/inventar/pije', {
      body: { emri_pijes: 'Fanta 0.33L', njesia: 'kanaçe', stoku_aktual: 24, stoku_minimal: 48 },
    });
    assert.equal(res.status, 409);
  });

  const invalid = [
    ['an empty body', {}],
    ['no name', { njesia: 'kanaçe', stoku_aktual: 1, stoku_minimal: 1 }],
    ['no unit', { emri_pijes: 'X', stoku_aktual: 1, stoku_minimal: 1 }],
    ['negative stock', { emri_pijes: 'X', njesia: 'u', stoku_aktual: -1, stoku_minimal: 1 }],
    ['negative minimum', { emri_pijes: 'X', njesia: 'u', stoku_aktual: 1, stoku_minimal: -1 }],
    ['a negative unit price', { emri_pijes: 'X', njesia: 'u', stoku_aktual: 1, stoku_minimal: 1, cmimi_per_njesi: -5 }],
  ];

  for (const [name, body] of invalid) {
    test(`rejects ${name}`, async () => {
      const res = await api.request('POST', '/api/inventar/pije', { body });
      assert.equal(res.status, 400);
      assert.equal(db.calls.length, 0);
    });
  }
});

describe('PATCH /api/inventar/pije/:id', () => {
  const api = useServer();

  test('adds to the existing stock rather than replacing it', async () => {
    db.when(/UPDATE pije_inventar/, { rows: [{ stoku_aktual: 60 }] });

    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: 48 } });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, stoku_aktual: 60 });
    assert.match(db.calls[0].text, /stoku_aktual = stoku_aktual \+ \$1/);
    assert.deepEqual(db.calls[0].params, [48, 1]);
  });

  test('a negative quantity subtracts stock', async () => {
    db.when(/UPDATE pije_inventar/, { rows: [{ stoku_aktual: 6 }] });

    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: -6 } });

    assert.equal(res.status, 200);
    assert.deepEqual(db.calls[0].params, [-6, 1]);
  });

  test('guards against going negative in the UPDATE itself', async () => {
    db.when(/UPDATE pije_inventar/, { rows: [{ stoku_aktual: 0 }] });
    await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: -6 } });
    assert.match(db.calls[0].text, /stoku_aktual \+ \$1 >= 0/, 'the floor is enforced atomically, not read-then-write');
  });

  test('refuses to drive stock below zero', async () => {
    // The guarded UPDATE matches nothing; the follow-up SELECT shows the row exists.
    db.when(/UPDATE pije_inventar/, { rows: [] });
    db.when(/SELECT stoku_aktual FROM pije_inventar/, { rows: [{ stoku_aktual: 12 }] });

    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: -100000 } });

    assert.equal(res.status, 400);
    assert.equal(res.body.stoku_aktual, 12, 'the client learns how much is actually there');
  });

  test('reports 404 for a drink that does not exist', async () => {
    db.when(/UPDATE pije_inventar/, { rows: [] });
    db.when(/SELECT stoku_aktual FROM pije_inventar/, { rows: [] });

    const res = await api.request('PATCH', '/api/inventar/pije/9999', { body: { sasia: 1 } });

    assert.equal(res.status, 404);
  });

  test('rejects a missing, zero or non-numeric quantity', async () => {
    for (const body of [{}, { sasia: 0 }, { sasia: '5' }, { sasia: 'shumë' }]) {
      db.reset();
      const res = await api.request('PATCH', '/api/inventar/pije/1', { body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(db.calls.length, 0);
    }
  });

  test('returns 500 on failure', async () => {
    db.when(/UPDATE pije_inventar/, new Error('down'));
    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: 1 } });
    assert.equal(res.status, 500);
  });
});

describe('stock tracking on orders', () => {
  const api = useServer();

  const LINKED = { rows: [{ ok: 1 }] };
  const order = { tavoline_id: 1, punonjes_id: 1, artikujt: [{ artikull_id: 1, sasia: 2 }] };

  test('decrements stock when a drink is sold', async () => {
    db.when(/information_schema\.columns/, LINKED);
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
    db.when(/UPDATE pije_inventar/, { rows: [{ emri_pijes: 'Birrë Korça 0.5L', para: 12, pas: 10 }] });

    const res = await api.request('POST', '/api/porosite', { body: order });

    assert.equal(res.status, 201);
    const stock = db.matching(/UPDATE pije_inventar/);
    assert.equal(stock.length, 1, 'one stock update per line');
    assert.match(stock[0].text, /pi\.inventar_id = am\.inventar_pije_id/, 'joined through the menu link');
    assert.match(stock[0].text, /FOR UPDATE OF pi/, 'the stock row is locked for the transaction');
    assert.match(stock[0].text, /pi\.stoku_aktual >= \$1/, 'never decrements past zero');
    assert.deepEqual(stock[0].params, [2, 1]);
    assert.ok(db.sql.indexOf('BEGIN') < db.sql.indexOf(stock[0].text), 'inside the order transaction');
    assert.ok(db.sql.includes('COMMIT'));
  });

  test('refuses the order and rolls back when stock would go negative', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
    // The guarded UPDATE matched nothing: the drink is linked but only 1 is left.
    db.when(/UPDATE pije_inventar/, { rows: [{ emri_pijes: 'Birrë Korça 0.5L', para: 1, pas: null }] });

    const res = await api.request('POST', '/api/porosite', { body: order });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /Birrë Korça 0\.5L/, 'names the drink that ran out');
    assert.equal(res.body.ne_stok, 1, 'and says how much is left');
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.ok(!db.sql.includes('COMMIT'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('food (no inventory link) leaves stock alone', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
    db.when(/UPDATE pije_inventar/, { rows: [] });

    const res = await api.request('POST', '/api/porosite', { body: order });

    assert.equal(res.status, 201);
  });

  test('probes the link column once, then remembers it', async () => {
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
    await api.request('POST', '/api/porosite', { body: order });
    assert.equal(db.matching(/information_schema\.columns/).length, 0, 'already known to be linked');
  });

  test('restores stock when an unpaid order is deleted', async () => {
    db.when(/DELETE FROM porosite/, { rows: [{ porosi_id: 7 }] });

    const res = await api.request('DELETE', '/api/porosite/7');

    assert.equal(res.status, 200);
    const restore = db.matching(/UPDATE pije_inventar/)[0];
    assert.ok(restore, 'stock goes back on the shelf');
    assert.match(restore.text, /stoku_aktual \+ ap\.sasia/);
    assert.deepEqual(restore.params, [7]);
  });
});

describe('stock tracking on a database without the link column', () => {
  const api = useServer();

  test('skips the stock update while artikujt_menu.inventar_pije_id is absent', async () => {
    db.when(/information_schema\.columns/, { rows: [] });
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });

    const res = await api.request('POST', '/api/porosite', {
      body: { tavoline_id: 1, punonjes_id: 1, artikujt: [{ artikull_id: 1, sasia: 2 }] },
    });

    assert.equal(res.status, 201, 'orders keep working without the column');
    assert.equal(db.matching(/UPDATE pije_inventar/).length, 0);
    assert.equal(db.matching(/information_schema\.columns/).length, 1);
  });

  test('probes again on the next order so the column is picked up without a redeploy', async () => {
    db.when(/information_schema\.columns/, { rows: [] });
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 2 }] });

    await api.request('POST', '/api/porosite', {
      body: { tavoline_id: 1, punonjes_id: 1, artikujt: [{ artikull_id: 1, sasia: 2 }] },
    });

    assert.equal(db.matching(/information_schema\.columns/).length, 1);
  });
});
