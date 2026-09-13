'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db, fakeOcr } = require('./helpers/suite');
const { authHeader } = require('./helpers/auth');

const MENU_ROW = { artikull_id: 2, emri: 'Birrë', cmimi: 250 };

/** A minimal one-pixel PNG — content doesn't matter, only that it looks like an image. */
const FAKE_PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function photoForm(fields = {}) {
  const form = new FormData();
  form.set('foto', new Blob([FAKE_PHOTO], { type: 'image/png' }), 'fatura.png');
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  return form;
}

/**
 * This endpoint takes multipart form data, so it bypasses the JSON-only
 * `api.request` helper. Defaults to scanning as a waiter — the realistic
 * user for this feature — since only staff need to name whose order it is.
 */
async function scan(api, tavoline_id, { as = 'kamarier', form = photoForm() } = {}) {
  const res = await fetch(`${api.url}/api/tavolinat/${tavoline_id}/skano-faturen`, {
    method: 'POST',
    headers: authHeader(as),
    body: form,
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe('POST /api/tavolinat/:id/skano-faturen', () => {
  const api = useServer();

  test('merges recognized items into the table\'s already-open order', async () => {
    fakeOcr.setText('2x Birrë');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [MENU_ROW] });
    db.when(/FROM porosite WHERE tavoline_id = \$1 AND statusi_porosise/, { rows: [{ porosi_id: 200 }] });
    db.when(/UPDATE artikujt_porosise SET sasia = sasia/, { rows: [{ artikull_porosie_id: 9, sasia: 5 }] });

    const res = await scan(api, 3);

    assert.equal(res.status, 201);
    assert.equal(res.body.porosi_id, 200);
    assert.equal(res.body.u_krijua, false);
    assert.equal(res.body.artikujt.length, 1);
    assert.equal(res.body.artikujt[0].artikull_id, 2);
    assert.equal(res.body.tekst_pa_perputhje.length, 0);
    assert.ok(db.sql.includes('BEGIN'));
    assert.ok(db.sql.includes('COMMIT'));
    assert.ok(db.matching(/INSERT INTO skanimet_faturave/).length, 'the scan is logged');
  });

  test('creates a new order when the table has none open', async () => {
    fakeOcr.setText('Birrë');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [MENU_ROW] });
    db.when(/FROM porosite WHERE tavoline_id = \$1 AND statusi_porosise/, { rows: [] });
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 555 }] });

    const res = await scan(api, 3);

    assert.equal(res.status, 201);
    assert.equal(res.body.porosi_id, 555);
    assert.equal(res.body.u_krijua, true);
    const insert = db.matching(/INSERT INTO artikujt_porosise/)[0];
    assert.deepEqual(insert.params, [555, 2, 1]);
  });

  test('creates nothing and reports the raw text when nothing on the menu matches', async () => {
    fakeOcr.setText('qwqwqwqwqwqw');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [MENU_ROW] });

    const res = await scan(api, 3);

    assert.equal(res.status, 200);
    assert.equal(res.body.porosi_id, null);
    assert.equal(res.body.artikujt.length, 0);
    assert.equal(res.body.tekst_pa_perputhje.length, 1);
    assert.equal(db.matching(/INSERT INTO porosite/).length, 0, 'never creates an empty order');
    assert.ok(db.matching(/INSERT INTO skanimet_faturave/).length, 'still logs the scan');
  });

  test('only matches menu items marked available', async () => {
    fakeOcr.setText('Birrë');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [] });

    const res = await scan(api, 3);

    assert.equal(res.body.artikujt.length, 0);
    assert.equal(res.body.tekst_pa_perputhje.length, 1);
  });

  test('rejects a request with no photo', async () => {
    const res = await scan(api, 3, { form: new FormData() });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test('rejects a non-numeric table id', async () => {
    const res = await scan(api, 'abc');
    assert.equal(res.status, 400);
  });

  test('staff must name whose scan it is, unlike a waiter', async () => {
    const res = await scan(api, 3, { as: 'admin' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /punonjes_id/);
  });

  test('staff can attribute the scan to a given waiter', async () => {
    fakeOcr.setText('Birrë');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [MENU_ROW] });
    db.when(/FROM porosite WHERE tavoline_id = \$1 AND statusi_porosise/, { rows: [] });
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 555 }] });

    await scan(api, 3, { as: 'admin', form: photoForm({ punonjes_id: 1 }) });

    const insert = db.matching(/INSERT INTO porosite/)[0];
    assert.equal(insert.params[1], 1);
  });

  test('a waiter scans as themselves', async () => {
    fakeOcr.setText('Birrë');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [MENU_ROW] });
    db.when(/FROM porosite WHERE tavoline_id = \$1 AND statusi_porosise/, { rows: [] });
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 555 }] });

    await scan(api, 3, { as: 'kamarier' });

    const insert = db.matching(/INSERT INTO porosite/)[0];
    assert.equal(insert.params[1], 1, 'punonjes_id comes from the token');
  });

  // Runs last: the stock-link probe result is cached for the lifetime of the
  // app instance this whole file shares, so once this test turns stock
  // tracking on there is no going back to "off" for a later test.
  test('reports a stock shortage as a 409, matching the manual order-line endpoint', async () => {
    fakeOcr.setText('Birrë');
    db.when(/FROM artikujt_menu WHERE eshte_i_disponueshem/, { rows: [MENU_ROW] });
    db.when(/FROM porosite WHERE tavoline_id = \$1 AND statusi_porosise/, { rows: [] });
    db.when(/INSERT INTO porosite/, { rows: [{ porosi_id: 555 }] });
    db.when(
      /SELECT 1 FROM information_schema.columns WHERE table_name = 'artikujt_menu'/,
      { rows: [{ '?column?': 1 }] }
    );
    db.when(/WITH lidhja AS/, { rows: [{ emri_pijes: 'Birrë', para: 2, pas: null }] });

    const res = await scan(api, 3);

    assert.equal(res.status, 409);
    assert.match(res.body.error, /Birrë/);
    assert.ok(!db.sql.includes('COMMIT'));
  });
});
