'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

const ITEMS = [
  { artikull_id: 1, emri: 'Birrë Korça 0.5L', cmimi: 250, kategori_id: 1 },
  { artikull_id: 2, emri: 'Tavë Kosi', cmimi: 750, kategori_id: 2 },
];

describe('GET /api/menu', () => {
  const api = useServer();

  test('returns every item ordered by name when no category is given', async () => {
    db.when(/FROM artikujt_menu/, { rows: ITEMS });

    const res = await api.request('GET', '/api/menu');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, ITEMS);
    assert.match(db.calls[0].text, /ORDER BY emri/);
    assert.deepEqual(db.calls[0].params, []);
  });

  test('filters by category and coerces the id to a number', async () => {
    db.when(/FROM artikujt_menu/, { rows: [ITEMS[1]] });

    await api.request('GET', '/api/menu?kategori_id=2');

    assert.match(db.calls[0].text, /WHERE kategori_id = \$1/);
    assert.deepEqual(db.calls[0].params, [2], 'query strings arrive as text and must be parsed');
  });

  test('a non-numeric category yields NaN rather than being rejected', async () => {
    // Documents current behaviour: parseInt('abc') is NaN, which pg will reject.
    db.when(/FROM artikujt_menu/, new Error('invalid input syntax for type integer'));

    const res = await api.request('GET', '/api/menu?kategori_id=abc');

    assert.ok(Number.isNaN(db.calls[0].params[0]));
    assert.equal(res.status, 500);
  });

  test('returns an empty array when the query fails', async () => {
    db.when(/FROM artikujt_menu/, new Error('boom'));

    const res = await api.request('GET', '/api/menu');

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, [], 'read routes answer failures with an empty list');
  });
});

describe('POST /api/menu', () => {
  const api = useServer();

  test('inserts an item and returns its new id', async () => {
    db.when(/INSERT INTO artikujt_menu/, { rows: [{ artikull_id: 77 }] });

    const res = await api.request('POST', '/api/menu', {
      body: { emri: 'Trilece', cmimi: 380, kategori_id: 3 },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, artikull_id: 77 });
    assert.deepEqual(db.calls[0].params, ['Trilece', 380, 3]);
    assert.doesNotMatch(db.calls[0].text, /inventar_pije_id/, 'no stock link unless one is given');
  });

  test('links the item to a stock line when inventar_pije_id is given', async () => {
    db.when(/INSERT INTO artikujt_menu/, { rows: [{ artikull_id: 78 }] });

    const res = await api.request('POST', '/api/menu', {
      body: { emri: 'Birrë Korça 0.5L', cmimi: 250, kategori_id: 1, inventar_pije_id: 4 },
    });

    assert.equal(res.status, 201);
    assert.match(db.calls[0].text, /inventar_pije_id/);
    assert.deepEqual(db.calls[0].params, ['Birrë Korça 0.5L', 250, 1, 4]);
  });

  test('trims the name and accepts a numeric string price', async () => {
    db.when(/INSERT INTO artikujt_menu/, { rows: [{ artikull_id: 79 }] });

    await api.request('POST', '/api/menu', {
      body: { emri: '  Byrek  ', cmimi: '120.50', kategori_id: '2' },
    });

    assert.deepEqual(db.calls[0].params, ['Byrek', 120.5, 2]);
  });

  test('returns 500 when the insert fails', async () => {
    db.when(/INSERT INTO artikujt_menu/, new Error('connection reset'));

    const res = await api.request('POST', '/api/menu', {
      body: { emri: 'Trilece', cmimi: 380, kategori_id: 3 },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.doesNotMatch(res.body.error, /connection reset/, 'driver messages stay on the server');
  });

  test('maps a foreign-key violation to 400', async () => {
    db.when(/INSERT INTO artikujt_menu/, Object.assign(new Error('fk'), { code: '23503' }));

    const res = await api.request('POST', '/api/menu', {
      body: { emri: 'Trilece', cmimi: 380, kategori_id: 999 },
    });

    assert.equal(res.status, 400);
  });

  describe('validation', () => {
    const invalid = [
      ['an empty body', {}],
      ['no name', { cmimi: 100, kategori_id: 1 }],
      ['a blank name', { emri: '   ', cmimi: 100, kategori_id: 1 }],
      ['no price', { emri: 'Falas', kategori_id: 1 }],
      ['a negative price', { emri: 'Falas', cmimi: -100, kategori_id: 1 }],
      ['a non-numeric price', { emri: 'X', cmimi: 'shumë', kategori_id: 1 }],
      ['no category', { emri: 'X', cmimi: 100 }],
      ['a non-integer category', { emri: 'X', cmimi: 100, kategori_id: 1.5 }],
      ['a non-integer inventar_pije_id', { emri: 'X', cmimi: 100, kategori_id: 1, inventar_pije_id: 'abc' }],
    ];

    for (const [name, body] of invalid) {
      test(`rejects ${name}`, async () => {
        db.when(/INSERT INTO artikujt_menu/, { rows: [{ artikull_id: 1 }] });
        const res = await api.request('POST', '/api/menu', { body });
        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.equal(db.calls.length, 0, 'invalid input never reaches the database');
      });
    }

    test('a free item (price 0) is allowed', async () => {
      db.when(/INSERT INTO artikujt_menu/, { rows: [{ artikull_id: 1 }] });
      const res = await api.request('POST', '/api/menu', { body: { emri: 'Ujë', cmimi: 0, kategori_id: 1 } });
      assert.equal(res.status, 201);
    });
  });
});
