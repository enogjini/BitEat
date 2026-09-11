'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

/**
 * Every statistics route is a thin SELECT over a database view. The views
 * themselves live only in Supabase and are not in this repository, so these
 * tests pin down the contract the API depends on: which view each route reads,
 * that rows pass through untouched, and that a missing view degrades to an
 * empty list rather than a crash.
 */

const ROUTES = [
  ['/api/statistika/produktet-me-te-shitura', /FROM produktet_me_te_shitura/],
  ['/api/statistika/produktet-te-gjitha', /FROM view_produktet_te_gjitha/],
  ['/api/statistika/dita-me-fitim', /FROM dita_me_fitim/],
  ['/api/statistika/fluksi-porosive-ora', /FROM fluksi_porosive_ora/],
  ['/api/statistika/kamarieri-me-i-mire', /FROM kamarieri_me_i_mire/],
  ['/api/statistika/money-peak', /FROM money_peak/],
  ['/api/statistika/xhiro-trendet', /FROM view_xhiro_trendet/],
  ['/api/statistika/performance-kamarieret', /FROM view_performance_kamarieret/],
  ['/api/statistika/porosite-lista', /FROM view_porosite_lista/],
  ['/api/statistika/porosite-sipas-tavolinave', /FROM view_porosite_sipas_tavolinave/],
];

describe('statistics views', () => {
  const api = useServer();

  for (const [path, viewPattern] of ROUTES) {
    describe(path, () => {
      test('reads the expected view and returns its rows verbatim', async () => {
        const rows = [{ a: 1 }, { a: 2 }];
        db.when(viewPattern, { rows });

        const res = await api.request('GET', path);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, rows);
        assert.equal(db.calls.length, 1);
        assert.match(db.calls[0].text, viewPattern);
      });

      test('degrades to an empty array when the view is missing', async () => {
        db.when(viewPattern, new Error('relation does not exist'));

        const res = await api.request('GET', path);

        assert.equal(res.status, 500);
        assert.deepEqual(res.body, []);
      });
    });
  }

  test('porosite-lista is capped at 50 rows', async () => {
    db.when(/view_porosite_lista/, { rows: [] });
    await api.request('GET', '/api/statistika/porosite-lista');
    assert.match(db.calls[0].text, /LIMIT 50/);
  });
});

describe('GET /api/statistika/xhiro-ditore', () => {
  const api = useServer();

  test("returns today's row from the daily takings view", async () => {
    const today = { data: '2026-09-11', numri_porosive: 37, xhiro_totale: 48250, totali_produkteve: 131 };
    db.when(/view_xhiro_ditore/, { rows: [today] });

    const res = await api.request('GET', '/api/statistika/xhiro-ditore');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, today);
    assert.match(db.calls[0].text, /WHERE data = CURRENT_DATE/);
  });

  test('returns a zeroed summary before the first order of the day', async () => {
    db.when(/view_xhiro_ditore/, { rows: [] });

    const res = await api.request('GET', '/api/statistika/xhiro-ditore');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { numri_porosive: 0, xhiro_totale: 0, totali_produkteve: 0 });
  });

  test('answers 200 with zeroes even when the view errors', async () => {
    db.when(/view_xhiro_ditore/, new Error('relation does not exist'));

    const res = await api.request('GET', '/api/statistika/xhiro-ditore');

    assert.equal(res.status, 200, 'this route swallows failures entirely');
    assert.deepEqual(res.body, { numri_porosive: 0, xhiro_totale: 0, totali_produkteve: 0 });
  });

  test(
    'distinguishes a database outage from a day with no sales',
    { todo: 'a failed view and a quiet morning both return the same zeroed body, so an outage looks like zero revenue' },
    async () => {
      db.when(/view_xhiro_ditore/, new Error('down'));
      const res = await api.request('GET', '/api/statistika/xhiro-ditore');
      assert.equal(res.status, 503);
    }
  );
});
