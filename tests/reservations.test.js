'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { useServer, db } = require('./helpers/suite');

const RESERVATION = {
  rezervim_id: 51,
  emri_klientit: 'Familja Bushati',
  numri_personave: 6,
  data_rezervimit: '2026-09-12',
  ora_rezervimit: '20:30',
  numri_tavolines: '7',
  statusi: 'E konfirmuar',
};

/** A date safely in the future, so the "not in the past" rule never trips. */
function nextMonth() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

describe('GET /api/rezervimet', () => {
  const api = useServer();

  test('returns only reservations from today onwards', async () => {
    db.when(/view_rezervime_lista/, { rows: [RESERVATION] });

    const res = await api.request('GET', '/api/rezervimet');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [RESERVATION]);
    assert.match(db.calls[0].text, /data_rezervimit >= CURRENT_DATE/, 'past bookings must not clutter the list');
  });

  test('answers failures with an empty array', async () => {
    db.when(/view_rezervime_lista/, new Error('missing view'));
    const res = await api.request('GET', '/api/rezervimet');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, []);
  });
});

describe('POST /api/rezervimet', () => {
  const api = useServer();

  const booking = {
    emri_klientit: 'Gentian Leka',
    numri_personave: 2,
    data_rezervimit: nextMonth(),
    ora_rezervimit: '19:00',
    tavoline_id: 2,
    numri_telefonit: '0691234567',
    shenim: 'Te dritarja',
  };

  /** A table with the given capacity and no clashing bookings. */
  function freeTable(kapaciteti = 4) {
    db.when(/SELECT kapaciteti FROM tavolinat/, { rows: [{ kapaciteti }] });
    db.when(/FROM rezervimet[\s\S]*ora_rezervimit::time/, { rows: [] });
  }

  test('creates a reservation confirmed by default', async () => {
    freeTable();
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 52 }] });

    const res = await api.request('POST', '/api/rezervimet', { body: booking });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, rezervim_id: 52 });
    const insert = db.matching(/INSERT INTO rezervimet/)[0];
    assert.deepEqual(insert.params, [
      'Gentian Leka', 2, booking.data_rezervimit, '19:00', 2, '0691234567', 'Te dritarja', 'E konfirmuar',
    ]);
  });

  test('checks capacity and clashes before inserting', async () => {
    freeTable();
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 52 }] });

    await api.request('POST', '/api/rezervimet', { body: booking });

    assert.match(db.calls[0].text, /SELECT kapaciteti FROM tavolinat/);
    assert.deepEqual(db.calls[0].params, [2]);
    assert.match(db.calls[1].text, /statusi = 'E konfirmuar'/, 'a cancelled booking does not block the slot');
    assert.deepEqual(db.calls[1].params, [2, booking.data_rezervimit, '19:00', 7200]);
    assert.match(db.calls[2].text, /INSERT INTO rezervimet/);
  });

  test('a table is optional, and then nothing needs checking', async () => {
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 53 }] });

    const res = await api.request('POST', '/api/rezervimet', {
      body: { ...booking, tavoline_id: undefined },
    });

    assert.equal(res.status, 201);
    assert.equal(db.calls.length, 1, 'straight to the insert');
    assert.equal(db.calls[0].params[4], null);
    assert.equal(db.calls[0].params.length, 8, 'all eight columns are still bound');
  });

  test("an empty string from the form's table picker means no table", async () => {
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 53 }] });

    const res = await api.request('POST', '/api/rezervimet', {
      body: { ...booking, tavoline_id: '', numri_telefonit: '', shenim: '' },
    });

    assert.equal(res.status, 201);
    assert.equal(db.calls[0].params[4], null);
    assert.equal(db.calls[0].params[5], null, 'blank phone is stored as NULL');
    assert.equal(db.calls[0].params[6], null, 'blank note is stored as NULL');
  });

  test('coerces numeric strings from the form', async () => {
    freeTable();
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 53 }] });

    await api.request('POST', '/api/rezervimet', {
      body: { ...booking, numri_personave: '3', tavoline_id: '2' },
    });

    const insert = db.matching(/INSERT INTO rezervimet/)[0];
    assert.equal(insert.params[1], 3);
    assert.equal(insert.params[4], 2);
  });

  test('returns 500 when the insert fails', async () => {
    freeTable();
    db.when(/INSERT INTO rezervimet/, new Error('down'));
    const res = await api.request('POST', '/api/rezervimet', { body: booking });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });

  test('rejects a booking in the past', async () => {
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });
    const res = await api.request('POST', '/api/rezervimet', {
      body: { ...booking, data_rezervimit: '2020-01-01' },
    });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  test('accepts a booking for today', async () => {
    freeTable();
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });
    const res = await api.request('POST', '/api/rezervimet', {
      body: { ...booking, data_rezervimit: new Date().toISOString().slice(0, 10) },
    });
    assert.equal(res.status, 201);
  });

  test('refuses to double-book a table at the same time', async () => {
    db.when(/SELECT kapaciteti FROM tavolinat/, { rows: [{ kapaciteti: 4 }] });
    db.when(/FROM rezervimet[\s\S]*ora_rezervimit::time/, { rows: [{ rezervim_id: 40, ora_rezervimit: '19:30' }] });
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });

    const res = await api.request('POST', '/api/rezervimet', { body: booking });

    assert.equal(res.status, 409);
    assert.equal(res.body.rezervim_id, 40, 'points at the booking that is in the way');
    assert.equal(db.matching(/INSERT INTO rezervimet/).length, 0);
  });

  test('rejects a party larger than the table capacity', async () => {
    freeTable(4);
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });

    const res = await api.request('POST', '/api/rezervimet', {
      body: { ...booking, numri_personave: 40, tavoline_id: 2 },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.kapaciteti, 4);
    assert.equal(db.matching(/INSERT INTO rezervimet/).length, 0);
  });

  test('a party exactly at capacity is fine', async () => {
    freeTable(4);
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });
    const res = await api.request('POST', '/api/rezervimet', { body: { ...booking, numri_personave: 4 } });
    assert.equal(res.status, 201);
  });

  test('returns 404 for a table that does not exist', async () => {
    db.when(/SELECT kapaciteti FROM tavolinat/, { rows: [] });
    const res = await api.request('POST', '/api/rezervimet', { body: { ...booking, tavoline_id: 9999 } });
    assert.equal(res.status, 404);
  });

  describe('validation', () => {
    const invalid = [
      ['an empty body', {}],
      ['no name', { ...booking, emri_klientit: '' }],
      ['no party size', { ...booking, numri_personave: undefined }],
      ['a zero party size', { ...booking, numri_personave: 0 }],
      ['no date', { ...booking, data_rezervimit: undefined }],
      ['a malformed date', { ...booking, data_rezervimit: '12/09/2026' }],
      ['an impossible date', { ...booking, data_rezervimit: '2026-13-45' }],
      ['no time', { ...booking, ora_rezervimit: undefined }],
      ['a malformed time', { ...booking, ora_rezervimit: '7pm' }],
      ['an impossible time', { ...booking, ora_rezervimit: '25:00' }],
      ['a non-numeric table', { ...booking, tavoline_id: 'bar' }],
    ];

    for (const [name, body] of invalid) {
      test(`rejects ${name}`, async () => {
        const res = await api.request('POST', '/api/rezervimet', { body });
        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.equal(db.calls.length, 0);
      });
    }
  });
});

describe('PATCH /api/rezervimet/:id/statusi', () => {
  const api = useServer();

  test('updates the status', async () => {
    db.when(/UPDATE rezervimet/, { rows: [{ rezervim_id: 51 }] });

    const res = await api.request('PATCH', '/api/rezervimet/51/statusi', {
      body: { statusi: 'E anuluar' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['E anuluar', 51]);
  });

  test('a waiter can cancel a booking', async () => {
    db.when(/UPDATE rezervimet/, { rows: [{ rezervim_id: 51 }] });
    const res = await api.request('PATCH', '/api/rezervimet/51/statusi', {
      as: 'kamarier',
      body: { statusi: 'E anuluar' },
    });
    assert.equal(res.status, 200);
  });

  test('returns 500 on failure', async () => {
    db.when(/UPDATE rezervimet/, new Error('down'));
    const res = await api.request('PATCH', '/api/rezervimet/51/statusi', { body: { statusi: 'E anuluar' } });
    assert.equal(res.status, 500);
  });

  test("accepts each status in the table's CHECK constraint", async () => {
    for (const statusi of ['E konfirmuar', 'E anuluar', 'E perfunduar', 'Ne pritje']) {
      db.reset();
      db.when(/UPDATE rezervimet/, { rows: [{ rezervim_id: 51 }] });
      const res = await api.request('PATCH', '/api/rezervimet/51/statusi', { body: { statusi } });
      assert.equal(res.status, 200, statusi);
    }
  });

  test('rejects a status outside that set', async () => {
    db.when(/UPDATE rezervimet/, { rows: [{ rezervim_id: 51 }] });
    for (const statusi of ['ndoshta', 'e konfirmuar', '']) {
      db.reset();
      const res = await api.request('PATCH', '/api/rezervimet/51/statusi', { body: { statusi } });
      assert.equal(res.status, 400, statusi);
      assert.equal(db.calls.length, 0);
    }
  });

  test('returns 404 for an unknown reservation', async () => {
    db.when(/UPDATE rezervimet/, { rows: [] });
    const res = await api.request('PATCH', '/api/rezervimet/9999/statusi', { body: { statusi: 'E anuluar' } });
    assert.equal(res.status, 404);
  });
});

describe('DELETE /api/rezervimet/:id', () => {
  const api = useServer();

  test('deletes the reservation', async () => {
    db.when(/DELETE FROM rezervimet/, { rows: [{ rezervim_id: 51 }] });

    const res = await api.request('DELETE', '/api/rezervimet/51');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, [51]);
  });

  test('returns 404 for an unknown reservation', async () => {
    db.when(/DELETE FROM rezervimet/, { rows: [] });
    const res = await api.request('DELETE', '/api/rezervimet/9999');
    assert.equal(res.status, 404);
  });

  test('returns 500 on failure', async () => {
    db.when(/DELETE FROM rezervimet/, new Error('down'));
    const res = await api.request('DELETE', '/api/rezervimet/51');
    assert.equal(res.status, 500);
  });
});
