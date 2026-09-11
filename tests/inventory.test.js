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

  test('returns 500 when the insert fails', async () => {
    db.when(/INSERT INTO pije_inventar/, new Error('duplicate key'));
    const res = await api.request('POST', '/api/inventar/pije', { body: {} });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });
});

describe('PATCH /api/inventar/pije/:id', () => {
  const api = useServer();

  test('adds to the existing stock rather than replacing it', async () => {
    db.when(/UPDATE pije_inventar/, { rows: [] });

    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: 48 } });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.match(db.calls[0].text, /stoku_aktual = stoku_aktual \+ \$1/);
    assert.deepEqual(db.calls[0].params, [48, '1']);
  });

  test('a negative quantity subtracts stock', async () => {
    db.when(/UPDATE pije_inventar/, { rows: [] });

    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: -6 } });

    assert.equal(res.status, 200);
    assert.deepEqual(db.calls[0].params, [-6, '1']);
  });

  test('returns 500 on failure', async () => {
    db.when(/UPDATE pije_inventar/, new Error('down'));
    const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: 1 } });
    assert.equal(res.status, 500);
  });

  test(
    'refuses to drive stock below zero',
    { todo: 'stoku_aktual = stoku_aktual + $1 with a large negative sasia yields negative stock' },
    async () => {
      db.when(/UPDATE pije_inventar/, { rows: [] });
      const res = await api.request('PATCH', '/api/inventar/pije/1', { body: { sasia: -100000 } });
      assert.equal(res.status, 400);
    }
  );

  test(
    'decrements stock when a drink is sold',
    { todo: 'placing an order never touches pije_inventar, so stock only changes when someone edits it by hand' },
    async () => {
      db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 1 }] });
      await api.request('POST', '/api/porosite', {
        body: { tavoline_id: 1, punonjes_id: 1, artikujt: [{ artikull_id: 1, sasia: 2 }] },
      });
      assert.ok(db.matching(/pije_inventar/).length > 0, 'expected stock to be decremented');
    }
  );
});
