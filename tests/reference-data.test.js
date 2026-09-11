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

  test('aggregates open orders per table', async () => {
    db.when(/FROM tavolinat t/, {
      rows: [{ tavoline_id: 3, numri_tavolines: '7', statusi: 'E zënë', kamarier: 'Arben', numri_porosive: '2' }],
    });

    const res = await api.request('GET', '/api/tavolinat/status');

    assert.equal(res.status, 200);
    assert.equal(res.body[0].numri_porosive, '2');
    const sql = db.calls[0].text;
    assert.match(sql, /LEFT JOIN porosite p/, 'tables with no orders must still appear');
    assert.match(sql, /p\.statusi_porosise = 'E Hapur'/, 'only open orders count');
    assert.match(sql, /COUNT\(DISTINCT p\.porosi_id\)/);
  });

  test(
    'orders tables numerically without assuming numri_tavolines is an integer',
    { todo: "ORDER BY CAST(numri_tavolines AS INTEGER) throws for a non-numeric label such as 'T1' or 'Bar'" },
    async () => {
      assert.doesNotMatch(db.calls[0]?.text ?? '', /CAST\(t\.numri_tavolines AS INTEGER\)/);
    }
  );
});

describe('PATCH /api/tavolinat/:id/gjendja', () => {
  const api = useServer();

  test('updates the table state', async () => {
    db.when(/UPDATE tavolinat/, { rows: [] });

    const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', {
      body: { gjendja: 'E zënë' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['E zënë', '3']);
  });

  test('reports failures as 500', async () => {
    db.when(/UPDATE tavolinat/, new Error('nope'));
    const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', { body: { gjendja: 'X' } });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });

  test(
    'reports 404 for a table that does not exist',
    { todo: 'the UPDATE affects zero rows but still answers 200, so the client cannot tell a no-op from a success' },
    async () => {
      db.when(/UPDATE tavolinat/, { rows: [], rowCount: 0 });
      const res = await api.request('PATCH', '/api/tavolinat/9999/gjendja', { body: { gjendja: 'E lirë' } });
      assert.equal(res.status, 404);
    }
  );

  test(
    'rejects an arbitrary state string',
    { todo: 'gjendja is written verbatim, so any string becomes a table state' },
    async () => {
      db.when(/UPDATE tavolinat/, { rows: [] });
      const res = await api.request('PATCH', '/api/tavolinat/3/gjendja', { body: { gjendja: 'bananas' } });
      assert.equal(res.status, 400);
    }
  );
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
