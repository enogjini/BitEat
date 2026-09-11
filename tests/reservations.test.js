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
    data_rezervimit: '2026-09-12',
    ora_rezervimit: '19:00',
    tavoline_id: 2,
    numri_telefonit: '0691234567',
    shenim: 'Te dritarja',
  };

  test('creates a reservation confirmed by default', async () => {
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 52 }] });

    const res = await api.request('POST', '/api/rezervimet', { body: booking });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { success: true, rezervim_id: 52 });
    assert.deepEqual(db.calls[0].params, [
      'Gentian Leka', 2, '2026-09-12', '19:00', 2, '0691234567', 'Te dritarja', 'E konfirmuar',
    ]);
  });

  test('a table is optional', async () => {
    db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 53 }] });

    const res = await api.request('POST', '/api/rezervimet', {
      body: { ...booking, tavoline_id: undefined },
    });

    assert.equal(res.status, 201);
    // JSON.stringify drops undefined keys, so tavoline_id never reaches the
    // server; the driver binds the missing value as SQL NULL.
    assert.equal(db.calls[0].params[4], undefined);
    assert.equal(db.calls[0].params.length, 8, 'all eight columns are still bound');
  });

  test('returns 500 when the insert fails', async () => {
    db.when(/INSERT INTO rezervimet/, new Error('down'));
    const res = await api.request('POST', '/api/rezervimet', { body: booking });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
  });

  test(
    'rejects a booking with no name or date',
    { todo: 'the server validates nothing — only the React form checks required fields, so any client can post an empty booking' },
    async () => {
      const res = await api.request('POST', '/api/rezervimet', { body: {} });
      assert.equal(res.status, 400);
    }
  );

  test(
    'rejects a booking in the past',
    { todo: 'data_rezervimit is not checked against CURRENT_DATE, so a past booking is accepted and then never shown' },
    async () => {
      db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });
      const res = await api.request('POST', '/api/rezervimet', {
        body: { ...booking, data_rezervimit: '2020-01-01' },
      });
      assert.equal(res.status, 400);
    }
  );

  test(
    'refuses to double-book a table at the same time',
    { todo: 'no overlap check: the same table can be booked twice for the same slot' },
    async () => {
      db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });
      const res = await api.request('POST', '/api/rezervimet', { body: booking });
      assert.equal(res.status, 409);
    }
  );

  test(
    'rejects a party larger than the table capacity',
    { todo: 'numri_personave is never compared with tavolinat.kapaciteti' },
    async () => {
      db.when(/INSERT INTO rezervimet/, { rows: [{ rezervim_id: 1 }] });
      const res = await api.request('POST', '/api/rezervimet', {
        body: { ...booking, numri_personave: 40, tavoline_id: 2 },
      });
      assert.equal(res.status, 400);
    }
  );
});

describe('PATCH /api/rezervimet/:id/statusi', () => {
  const api = useServer();

  test('updates the status', async () => {
    db.when(/UPDATE rezervimet/, { rows: [] });

    const res = await api.request('PATCH', '/api/rezervimet/51/statusi', {
      body: { statusi: 'E anuluar' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['E anuluar', '51']);
  });

  test('returns 500 on failure', async () => {
    db.when(/UPDATE rezervimet/, new Error('down'));
    const res = await api.request('PATCH', '/api/rezervimet/51/statusi', { body: { statusi: 'E anuluar' } });
    assert.equal(res.status, 500);
  });

  test(
    'rejects a status the UI cannot render',
    { todo: "RezervimePage only styles 'E konfirmuar' and 'E anuluar'; any other string falls through to the yellow badge" },
    async () => {
      db.when(/UPDATE rezervimet/, { rows: [] });
      const res = await api.request('PATCH', '/api/rezervimet/51/statusi', { body: { statusi: 'ndoshta' } });
      assert.equal(res.status, 400);
    }
  );
});

describe('DELETE /api/rezervimet/:id', () => {
  const api = useServer();

  test('deletes the reservation', async () => {
    db.when(/DELETE FROM rezervimet/, { rows: [] });

    const res = await api.request('DELETE', '/api/rezervimet/51');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(db.calls[0].params, ['51']);
  });

  test('returns 500 on failure', async () => {
    db.when(/DELETE FROM rezervimet/, new Error('down'));
    const res = await api.request('DELETE', '/api/rezervimet/51');
    assert.equal(res.status, 500);
  });
});
