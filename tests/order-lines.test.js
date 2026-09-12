'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

const OPEN = { porosi_id: 184, tavoline_id: 3, punonjes_id: 1, statusi_porosise: 'E Hapur' };
const CLOSED = { ...OPEN, statusi_porosise: 'E Mbyllur' };
const LINKED = { rows: [{ ok: 1 }] };

/** The SQL issued, minus the link probe. */
const sqlWithoutProbe = () => db.sql.filter((s) => !/information_schema/.test(s));

describe('POST /api/porosite/:id/artikujt', () => {
  const api = useServer();

  test('adds a new line to an open order inside one transaction', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/UPDATE artikujt_porosise SET sasia = sasia \+ \$1/, { rows: [] });
    db.when(/INSERT INTO artikujt_porosise/, { rows: [{ artikull_porosie_id: 9, sasia: 2 }] });

    const res = await api.request('POST', '/api/porosite/184/artikujt', {
      as: 'kamarier',
      body: { artikujt: [{ artikull_id: 5, sasia: 2 }] },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, {
      success: true,
      porosi_id: 184,
      artikujt: [{ artikull_porosie_id: 9, artikull_id: 5, sasia: 2 }],
    });
    const sql = sqlWithoutProbe();
    assert.equal(sql[0], 'BEGIN');
    assert.match(sql[1], /FOR UPDATE/, 'the order is locked');
    assert.match(sql[2], /UPDATE artikujt_porosise SET sasia = sasia \+ \$1/, 'tries to merge first');
    assert.match(sql[3], /INSERT INTO artikujt_porosise/);
    assert.equal(sql.at(-1), 'COMMIT');
    assert.deepEqual(db.matching(/INSERT INTO artikujt_porosise/)[0].params, [184, 5, 2]);
    assert.equal(db.clients.at(-1).released, true);
  });

  test('raises the quantity when the item is already on the order', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/UPDATE artikujt_porosise SET sasia = sasia \+ \$1/, { rows: [{ artikull_porosie_id: 4, sasia: 5 }] });

    const res = await api.request('POST', '/api/porosite/184/artikujt', {
      body: { artikujt: [{ artikull_id: 5, sasia: 2 }] },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.artikujt, [{ artikull_porosie_id: 4, artikull_id: 5, sasia: 5 }]);
    assert.equal(db.matching(/INSERT INTO artikujt_porosise/).length, 0, 'no duplicate line');
    assert.deepEqual(db.matching(/UPDATE artikujt_porosise/)[0].params, [2, 184, 5]);
  });

  test('takes the drinks out of stock', async () => {
    db.when(/information_schema\.columns/, LINKED);
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/INSERT INTO artikujt_porosise/, { rows: [{ artikull_porosie_id: 9, sasia: 2 }] });
    db.when(/UPDATE pije_inventar/, { rows: [{ emri_pijes: 'Red Bull', para: 10, pas: 8 }] });

    const res = await api.request('POST', '/api/porosite/184/artikujt', {
      body: { artikujt: [{ artikull_id: 5, sasia: 2 }] },
    });

    assert.equal(res.status, 201);
    const stock = db.matching(/UPDATE pije_inventar/)[0];
    assert.match(stock.text, /pi\.stoku_aktual >= \$1/);
    assert.deepEqual(stock.params, [2, 5]);
  });

  test('refuses and rolls back when a drink runs short', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/INSERT INTO artikujt_porosise/, { rows: [{ artikull_porosie_id: 9, sasia: 40 }] });
    db.when(/UPDATE pije_inventar/, { rows: [{ emri_pijes: 'Red Bull', para: 3, pas: null }] });

    const res = await api.request('POST', '/api/porosite/184/artikujt', {
      body: { artikujt: [{ artikull_id: 5, sasia: 40 }] },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.ne_stok, 3);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.ok(!db.sql.includes('COMMIT'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('adds several lines, each in turn', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    let next = 20;
    db.when(/INSERT INTO artikujt_porosise/, (text, params) => ({ rows: [{ artikull_porosie_id: next++, sasia: params[2] }] }));

    const res = await api.request('POST', '/api/porosite/184/artikujt', {
      body: { artikujt: [{ artikull_id: 5, sasia: 1 }, { artikull_id: 54, sasia: 2 }] },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.artikujt.length, 2);
    assert.equal(db.matching(/INSERT INTO artikujt_porosise/).length, 2);
  });

  test('returns 404 for an unknown order', async () => {
    db.when(/FOR UPDATE/, { rows: [] });
    const res = await api.request('POST', '/api/porosite/999/artikujt', { body: { artikujt: [{ artikull_id: 5, sasia: 1 }] } });
    assert.equal(res.status, 404);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('refuses to change a closed order', async () => {
    db.when(/FOR UPDATE/, { rows: [CLOSED] });
    const res = await api.request('POST', '/api/porosite/184/artikujt', { body: { artikujt: [{ artikull_id: 5, sasia: 1 }] } });
    assert.equal(res.status, 409);
    assert.equal(db.matching(/artikujt_porosise/).length, 0);
    assert.ok(db.sql.includes('ROLLBACK'));
  });

  test('maps an unknown menu item to 400', async () => {
    db.when(/FOR UPDATE/, { rows: [OPEN] });
    db.when(/INSERT INTO artikujt_porosise/, Object.assign(new Error('fk'), { code: '23503' }));
    const res = await api.request('POST', '/api/porosite/184/artikujt', { body: { artikujt: [{ artikull_id: 9999, sasia: 1 }] } });
    assert.equal(res.status, 400);
    assert.ok(db.sql.includes('ROLLBACK'));
  });

  describe('validation', () => {
    const invalid = [
      ['an empty body', {}],
      ['an empty list', { artikujt: [] }],
      ['a non-list', { artikujt: { artikull_id: 1, sasia: 1 } }],
      ['a zero quantity', { artikujt: [{ artikull_id: 1, sasia: 0 }] }],
      ['a fractional quantity', { artikujt: [{ artikull_id: 1, sasia: 1.5 }] }],
      ['a missing item id', { artikujt: [{ sasia: 1 }] }],
    ];
    for (const [name, body] of invalid) {
      test(`rejects ${name}`, async () => {
        const res = await api.request('POST', '/api/porosite/184/artikujt', { body });
        assert.equal(res.status, 400);
        assert.equal(db.calls.length, 0, 'nothing is opened for invalid input');
      });
    }

    test('rejects a non-numeric order id', async () => {
      const res = await api.request('POST', '/api/porosite/abc/artikujt', { body: { artikujt: [{ artikull_id: 1, sasia: 1 }] } });
      assert.equal(res.status, 400);
      assert.equal(db.calls.length, 0);
    });
  });
});

describe('PATCH /api/porosite/:id/artikujt/:lineId', () => {
  const api = useServer();

  const LINE = { artikull_porosie_id: 9, artikull_id: 5, sasia: 2 };

  test('sets the quantity and takes the difference out of stock', async () => {
    db.when(/information_schema\.columns/, LINKED);
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/FROM artikujt_porosise WHERE artikull_porosie_id = \$1 AND porosi_id = \$2 FOR UPDATE/, { rows: [LINE] });
    db.when(/UPDATE pije_inventar/, { rows: [{ emri_pijes: 'Red Bull', para: 10, pas: 7 }] });

    const res = await api.request('PATCH', '/api/porosite/184/artikujt/9', { as: 'kamarier', body: { sasia: 5 } });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, artikull_porosie_id: 9, sasia: 5 });
    assert.deepEqual(db.matching(/UPDATE artikujt_porosise SET sasia = \$1/)[0].params, [5, 9]);
    const stock = db.matching(/UPDATE pije_inventar/)[0];
    assert.match(stock.text, /stoku_aktual - \$1/, 'a decrement');
    assert.deepEqual(stock.params, [3, 5], 'only the extra three');
    assert.equal(db.sql.at(-1), 'COMMIT');
  });

  test('lowering the quantity puts the difference back', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/FROM artikujt_porosise WHERE artikull_porosie_id/, { rows: [{ ...LINE, sasia: 5 }] });

    const res = await api.request('PATCH', '/api/porosite/184/artikujt/9', { body: { sasia: 2 } });

    assert.equal(res.status, 200);
    const stock = db.matching(/UPDATE pije_inventar/)[0];
    assert.match(stock.text, /stoku_aktual \+ \$1/, 'a restore');
    assert.deepEqual(stock.params, [3, 5]);
  });

  test('an unchanged quantity touches nothing', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/FROM artikujt_porosise WHERE artikull_porosie_id/, { rows: [LINE] });

    const res = await api.request('PATCH', '/api/porosite/184/artikujt/9', { body: { sasia: 2 } });

    assert.equal(res.status, 200);
    assert.equal(db.matching(/^UPDATE/).length, 0, 'no UPDATE statements (FOR UPDATE locks aside)');
  });

  test('refuses and rolls back when the extra drinks are not in stock', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/FROM artikujt_porosise WHERE artikull_porosie_id/, { rows: [LINE] });
    db.when(/UPDATE pije_inventar/, { rows: [{ emri_pijes: 'Red Bull', para: 1, pas: null }] });

    const res = await api.request('PATCH', '/api/porosite/184/artikujt/9', { body: { sasia: 50 } });

    assert.equal(res.status, 409);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('returns 404 when the line is not on that order', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/FROM artikujt_porosise WHERE artikull_porosie_id/, { rows: [] });

    const res = await api.request('PATCH', '/api/porosite/184/artikujt/777', { body: { sasia: 1 } });

    assert.equal(res.status, 404);
    assert.deepEqual(db.matching(/FROM artikujt_porosise/)[0].params, [777, 184], 'scoped to the order');
    assert.ok(db.sql.includes('ROLLBACK'));
  });

  test('refuses to change a closed order', async () => {
    db.when(/FOR UPDATE/, { rows: [CLOSED] });
    const res = await api.request('PATCH', '/api/porosite/184/artikujt/9', { body: { sasia: 1 } });
    assert.equal(res.status, 409);
  });

  test('rejects zero — removing a line is DELETE', async () => {
    for (const body of [{}, { sasia: 0 }, { sasia: -1 }, { sasia: 'dy' }]) {
      db.reset();
      const res = await api.request('PATCH', '/api/porosite/184/artikujt/9', { body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(db.calls.length, 0);
    }
  });
});

describe('DELETE /api/porosite/:id/artikujt/:lineId', () => {
  const api = useServer();

  test('removes the line and puts its drinks back', async () => {
    db.when(/information_schema\.columns/, LINKED);
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/DELETE FROM artikujt_porosise/, { rows: [{ artikull_id: 5, sasia: 2 }] });
    db.when(/SELECT 1 FROM artikujt_porosise/, { rows: [{ '?column?': 1 }] });

    const res = await api.request('DELETE', '/api/porosite/184/artikujt/9', { as: 'kamarier' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, artikull_porosie_id: 9, porosi_fshire: false });
    assert.deepEqual(db.matching(/DELETE FROM artikujt_porosise/)[0].params, [9, 184]);
    const stock = db.matching(/UPDATE pije_inventar/)[0];
    assert.match(stock.text, /stoku_aktual \+ \$1/);
    assert.deepEqual(stock.params, [2, 5]);
    assert.equal(db.matching(/DELETE FROM porosite/).length, 0, 'the order survives');
    assert.equal(db.sql.at(-1), 'COMMIT');
  });

  test('removing the last line removes the order too', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/DELETE FROM artikujt_porosise/, { rows: [{ artikull_id: 5, sasia: 2 }] });
    db.when(/SELECT 1 FROM artikujt_porosise/, { rows: [] });

    const res = await api.request('DELETE', '/api/porosite/184/artikujt/9');

    assert.equal(res.status, 200);
    assert.equal(res.body.porosi_fshire, true);
    assert.deepEqual(db.matching(/DELETE FROM porosite/)[0].params, [184]);
    assert.equal(db.sql.at(-1), 'COMMIT');
  });

  test('returns 404 when the line is not on that order', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/DELETE FROM artikujt_porosise/, { rows: [] });

    const res = await api.request('DELETE', '/api/porosite/184/artikujt/777');

    assert.equal(res.status, 404);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('refuses to change a closed order', async () => {
    db.when(/FOR UPDATE/, { rows: [CLOSED] });
    const res = await api.request('DELETE', '/api/porosite/184/artikujt/9');
    assert.equal(res.status, 409);
    assert.equal(db.matching(/DELETE/).length, 0);
  });

  test('rolls back and returns 500 when the delete fails', async () => {
    db.when(/FROM porosite WHERE porosi_id = \$1 FOR UPDATE/, { rows: [OPEN] });
    db.when(/DELETE FROM artikujt_porosise/, new Error('locked'));

    const res = await api.request('DELETE', '/api/porosite/184/artikujt/9');

    assert.equal(res.status, 500);
    assert.ok(db.sql.includes('ROLLBACK'));
    assert.equal(db.clients.at(-1).released, true);
  });

  test('rejects non-numeric ids', async () => {
    const res = await api.request('DELETE', '/api/porosite/184/artikujt/abc');
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });
});
