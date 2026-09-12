const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const auth = require('../lib/auth');
const v = require('../lib/validate');

const app = express();

// ----------------------------------------------------------------------------
// CORS
// In production the front end is served same-origin by Vercel, so no origin
// needs allowing; set CORS_ORIGIN (comma-separated, or '*') when the API is
// called from elsewhere. Outside production it defaults to the CRA dev server.
// ----------------------------------------------------------------------------
const corsOrigins = (process.env.CORS_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins.includes('*') ? '*' : corsOrigins }));
app.use(express.json());

// ----------------------------------------------------------------------------
// Database connection
// In production (Vercel) DATABASE_URL points at the Supabase connection pooler.
// Locally it falls back to the dev Postgres instance.
// ----------------------------------------------------------------------------
const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:123@localhost:5432/restaurant';
const useSSL =
  /supabase|render|amazonaws|neon|heroku/.test(connectionString) ||
  process.env.PGSSL === 'true';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: process.env.PGPOOL_MAX ? parseInt(process.env.PGPOOL_MAX) : 5,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

// ----------------------------------------------------------------------------
// Domain vocabularies — the only values the write routes accept.
// ----------------------------------------------------------------------------
const ROLET = ['admin', 'menaxher', 'kamarier'];
const STATUSET_POROSISE = ['E Hapur', 'E Mbyllur', 'Anuluar'];
const GJENDJET_TAVOLINES = ['E lirë', 'E zënë', 'E rezervuar'];
const METODAT_PAGESES = ['Cash', 'Kartë', 'Transferim'];
const STATUSET_REZERVIMIT = ['E konfirmuar', 'E anuluar', 'E perfunduar', 'Ne pritje'];
// Two bookings on the same table closer together than this are a conflict.
const KOHEZGJATJA_REZERVIMIT_SEK = 2 * 60 * 60;

// ----------------------------------------------------------------------------
// Response helpers
// ----------------------------------------------------------------------------
function bad(res, error, status = 400) {
  return res.status(status).json({ success: false, error });
}

/**
 * Report a failed write without leaking the driver message. Constraint
 * violations are the client's fault and say so; anything else is a 500.
 */
function dbError(res, err, message) {
  console.error(err);
  switch (err && err.code) {
    case '23503': return bad(res, 'Një nga id-të e dhëna nuk ekziston');
    case '23505': return bad(res, 'Regjistrimi ekziston tashmë', 409);
    case '23514': return bad(res, 'Vlera e dhënë nuk lejohet');
    default: return bad(res, message, 500);
  }
}

// ----------------------------------------------------------------------------
// Authentication
// Every /api route requires a bearer token except the two the login page
// itself needs. Role checks are layered on per route with `staffOnly`.
// ----------------------------------------------------------------------------
const PUBLIC_ROUTES = new Set(['POST /api/login', 'GET /api/punonjesit']);

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  let payload = null;
  try {
    payload = token ? auth.verifyToken(token, auth.getSecret()) : null;
  } catch (err) {
    console.error(err);
    return bad(res, 'Gabim në konfigurimin e serverit', 500);
  }
  if (!payload || !ROLET.includes(payload.lloji)) {
    return bad(res, 'Kërkohet hyrja', 401);
  }
  req.user = { punonjes_id: payload.sub, emri: payload.emri, lloji: payload.lloji };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.lloji)) return bad(res, 'Nuk keni të drejta për këtë veprim', 403);
    next();
  };
}
const staffOnly = requireRole('admin', 'menaxher');

app.use('/api', (req, res, next) => {
  const route = `${req.method} ${(req.baseUrl + req.path).replace(/\/+$/, '')}`;
  if (PUBLIC_ROUTES.has(route)) return next();
  return requireAuth(req, res, next);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ========== AUTHENTICATION ==========
app.post('/api/login', async (req, res) => {
  const { emri_perdoruesit, password, lloji, punonjes_id } = req.body || {};

  if (!ROLET.includes(lloji)) {
    return res.status(400).json({ success: false, message: 'Lloji i përdoruesit i panjohur' });
  }

  try {
    let rows;
    if (lloji === 'kamarier') {
      const id = v.toPosInt(punonjes_id);
      if (Number.isNaN(id) || !password) {
        return res.status(400).json({ success: false, message: 'Plotëso fushat!' });
      }
      ({ rows } = await pool.query(
        'SELECT punonjes_id, emri, mbiemri, password, lloji_perdoruesit FROM punonjesit WHERE punonjes_id = $1 AND lloji_perdoruesit = $2',
        [id, 'kamarier']
      ));
    } else {
      if (!emri_perdoruesit || !password) {
        return res.status(400).json({ success: false, message: 'Plotëso fushat!' });
      }
      // The admin account predates the role column, so it is also recognised by name.
      const roleClause = lloji === 'admin' ? '(lloji_perdoruesit = $2 OR emri = $2)' : 'lloji_perdoruesit = $2';
      ({ rows } = await pool.query(
        `SELECT punonjes_id, emri, mbiemri, password, lloji_perdoruesit FROM punonjesit WHERE emri = $1 AND ${roleClause}`,
        [emri_perdoruesit, lloji]
      ));
    }

    let user = null;
    for (const row of rows) {
      if (await auth.verifyPassword(password, row.password)) {
        user = row;
        break;
      }
    }
    if (!user) {
      return res.status(401).json({ success: false, message: 'Kredencialet gabim!' });
    }

    // Legacy rows hold the password in clear; hash it now that we have seen it.
    if (!auth.isHashed(user.password)) {
      try {
        await pool.query('UPDATE punonjesit SET password = $1 WHERE punonjes_id = $2', [
          await auth.hashPassword(password),
          user.punonjes_id,
        ]);
      } catch (err) {
        console.warn('Could not upgrade password hash for', user.punonjes_id, err.message);
      }
    }

    const token = auth.signToken({ sub: user.punonjes_id, emri: user.emri, lloji }, auth.getSecret());
    res.json({
      success: true,
      token,
      expires_in: auth.TOKEN_TTL_SECONDS,
      user: {
        punonjes_id: user.punonjes_id,
        emri: user.emri,
        mbiemri: user.mbiemri,
        lloji_perdoruesit: user.lloji_perdoruesit,
        lloji,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Gabim' });
  }
});

app.get('/api/auth/me', (req, res) => {
  res.json({ success: true, user: req.user });
});

// ========== MENU ==========
app.get('/api/menu', async (req, res) => {
  const { kategori_id } = req.query;
  try {
    let query = 'SELECT * FROM artikujt_menu';
    let params = [];
    if (kategori_id) {
      query += ' WHERE kategori_id = $1';
      params = [parseInt(kategori_id)];
    }
    query += ' ORDER BY emri';
    const result = await pool.query(query, params);
    res.json(result.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post('/api/menu', staffOnly, async (req, res) => {
  const body = req.body || {};
  const emri = typeof body.emri === 'string' ? body.emri.trim() : '';
  const cmimi = v.toMoney(body.cmimi);
  const kategori_id = v.toPosInt(body.kategori_id);
  // Optional: the pije_inventar row this item draws stock from (drinks only).
  const inventar_pije_id = body.inventar_pije_id == null || body.inventar_pije_id === '' ? null : v.toPosInt(body.inventar_pije_id);

  if (!emri || Number.isNaN(cmimi) || Number.isNaN(kategori_id)) {
    return bad(res, 'Plotëso fushat: emri, cmimi (≥ 0) dhe kategori_id');
  }
  if (Number.isNaN(inventar_pije_id)) return bad(res, 'inventar_pije_id duhet të jetë numër i plotë');

  try {
    const result = inventar_pije_id === null
      ? await pool.query(
        'INSERT INTO artikujt_menu (emri, cmimi, kategori_id) VALUES ($1, $2, $3) RETURNING artikull_id',
        [emri, cmimi, kategori_id]
      )
      : await pool.query(
        'INSERT INTO artikujt_menu (emri, cmimi, kategori_id, inventar_pije_id) VALUES ($1, $2, $3, $4) RETURNING artikull_id',
        [emri, cmimi, kategori_id, inventar_pije_id]
      );
    res.status(201).json({ success: true, artikull_id: result.rows[0].artikull_id });
  } catch (err) {
    dbError(res, err, 'Gabim në shtimin e artikullit');
  }
});

// ========== TABLES ==========
app.get('/api/tavolinat', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT tavoline_id, numri_tavolines, kapaciteti, vendndodhja, gjendja FROM tavolinat ORDER BY vendndodhja, numri_tavolines'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/tavolinat/status', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.tavoline_id, t.numri_tavolines, t.vendndodhja, t.kapaciteti,
             t.gjendja AS statusi, pu.emri AS kamarier,
             COUNT(DISTINCT p.porosi_id) AS numri_porosive,
             MIN(p.ora_porosise) AS ora_porosise
      FROM tavolinat t
      LEFT JOIN porosite p ON t.tavoline_id = p.tavoline_id AND p.statusi_porosise = 'E Hapur'
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      GROUP BY t.tavoline_id, t.numri_tavolines, t.vendndodhja, t.kapaciteti, t.gjendja, pu.emri
      ORDER BY CAST(t.numri_tavolines AS INTEGER)
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.patch('/api/tavolinat/:id/gjendja', async (req, res) => {
  const id = v.toPosInt(req.params.id);
  const { gjendja } = req.body || {};
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  if (!GJENDJET_TAVOLINES.includes(gjendja)) {
    return bad(res, `gjendja duhet të jetë një nga: ${GJENDJET_TAVOLINES.join(', ')}`);
  }
  try {
    const result = await pool.query(
      'UPDATE tavolinat SET gjendja = $1 WHERE tavoline_id = $2 RETURNING tavoline_id',
      [gjendja, id]
    );
    if (result.rowCount === 0) return bad(res, 'Tavolina nuk u gjet', 404);
    res.json({ success: true });
  } catch (err) {
    dbError(res, err, 'Gabim në ndryshimin e gjendjes');
  }
});

// ========== CATEGORIES & EMPLOYEES ==========
app.get('/api/kategorite', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kategorite ORDER BY emri');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Public: the login page lists waiters before anyone is signed in.
app.get('/api/punonjesit', async (req, res) => {
  try {
    const { lloji } = req.query;
    let query = 'SELECT punonjes_id, emri, mbiemri, lloji_perdoruesit FROM punonjesit WHERE emri != $1';
    let params = ['admin'];
    if (lloji === 'kamarier') {
      query += ' AND lloji_perdoruesit = $2';
      params.push('kamarier');
    }
    query += ' ORDER BY emri';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ========== ORDERS ==========

/**
 * Stock is decremented through `artikujt_menu.inventar_pije_id` (NULL for
 * food). A database without that column — an older dump, say — is probed once
 * per order inside the transaction and simply skips stock tracking, so orders
 * keep working; the answer is cached as soon as the column is seen.
 */
app.locals.inventoryLinked = false;
async function inventoryIsLinked(client) {
  if (app.locals.inventoryLinked) return true;
  const probe = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'artikujt_menu' AND column_name = 'inventar_pije_id'"
  );
  app.locals.inventoryLinked = probe.rows.length > 0;
  if (!app.locals.inventoryLinked) {
    console.warn('artikujt_menu.inventar_pije_id is missing — stock is not being tracked');
  }
  return app.locals.inventoryLinked;
}

class StockError extends Error {
  constructor(emri_pijes, ne_stok) {
    super(`Stoku nuk mjafton për "${emri_pijes}" (në stok: ${ne_stok})`);
    this.emri_pijes = emri_pijes;
    this.ne_stok = ne_stok;
  }
}

app.get('/api/porosite', async (req, res) => {
  try {
    const { statusi } = req.query;
    // Waiters only ever see their own orders, whatever the query string says.
    const punonjes_id = req.user.lloji === 'kamarier'
      ? req.user.punonjes_id
      : req.query.punonjes_id ? v.toPosInt(req.query.punonjes_id) : undefined;
    if (Number.isNaN(punonjes_id)) return bad(res, 'punonjes_id i pavlefshëm');

    let query = `
      SELECT p.*, t.numri_tavolines, pu.emri || ' ' || pu.mbiemri as kamarier
      FROM porosite p
      LEFT JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      WHERE 1=1
    `;
    const params = [];

    if (punonjes_id !== undefined) {
      query += ` AND p.punonjes_id = $${params.length + 1}`;
      params.push(punonjes_id);
    }

    if (statusi) {
      query += ` AND p.statusi_porosise = $${params.length + 1}`;
      params.push(statusi);
    }

    query += ' ORDER BY p.porosi_id DESC LIMIT 50';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/porosite/:id', async (req, res) => {
  const id = v.toPosInt(req.params.id);
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  try {
    const porosi = await pool.query(`
      SELECT p.*, t.numri_tavolines, t.vendndodhja, pu.emri || ' ' || pu.mbiemri as kamarier
      FROM porosite p
      LEFT JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      WHERE p.porosi_id = $1
    `, [id]);

    if (porosi.rows.length === 0) return bad(res, 'Porosia nuk u gjet', 404);
    if (req.user.lloji === 'kamarier' && porosi.rows[0].punonjes_id !== req.user.punonjes_id) {
      return bad(res, 'Kjo porosi nuk është e juaja', 403);
    }

    const artikujt = await pool.query(`
      SELECT ap.*, am.emri, am.cmimi, (ap.sasia * am.cmimi) as totali
      FROM artikujt_porosise ap
      JOIN artikujt_menu am ON ap.artikull_id = am.artikull_id
      WHERE ap.porosi_id = $1
    `, [id]);

    res.json({ porosi: porosi.rows[0], artikujt: artikujt.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim fatal1' });
  }
});

app.post('/api/porosite', async (req, res) => {
  const body = req.body || {};
  const tavoline_id = v.toPosInt(body.tavoline_id);
  // A waiter orders as themselves; only staff may place an order on someone's behalf.
  const punonjes_id = req.user.lloji === 'kamarier' ? req.user.punonjes_id : v.toPosInt(body.punonjes_id);
  const artikujt = body.artikujt;

  if (Number.isNaN(tavoline_id) || Number.isNaN(punonjes_id) || !Array.isArray(artikujt) || artikujt.length === 0) {
    return bad(res, 'Plotëso fushat: tavoline_id, punonjes_id, dhe artikujt');
  }

  const lines = artikujt.map((a) => ({
    artikull_id: v.toPosInt(a && a.artikull_id),
    sasia: v.toPosInt(a && a.sasia),
  }));
  if (lines.some((l) => Number.isNaN(l.artikull_id) || Number.isNaN(l.sasia))) {
    return bad(res, 'Çdo artikull duhet të ketë artikull_id dhe sasia (numër i plotë > 0)');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const trackStock = await inventoryIsLinked(client);

    const porosiRes = await client.query(
      'INSERT INTO porosite (tavoline_id, punonjes_id, statusi_porosise, ora_porosise) VALUES ($1, $2, $3, NOW()) RETURNING porosi_id',
      [tavoline_id, punonjes_id, 'E Hapur']
    );

    const porosi_id = porosiRes.rows[0].porosi_id;

    for (const line of lines) {
      await client.query(
        'INSERT INTO artikujt_porosise (porosi_id, artikull_id, sasia) VALUES ($1, $2, $3)',
        [porosi_id, line.artikull_id, line.sasia]
      );

      if (trackStock) {
        // One round trip per line: lock the linked stock row, decrement it only
        // if enough is there, and report what happened. Food (no link) yields
        // no row; a drink that ran short yields its row with `pas` NULL.
        const stock = await client.query(
          `WITH lidhja AS (
             SELECT pi.inventar_id, pi.emri_pijes, pi.stoku_aktual
             FROM artikujt_menu am
             JOIN pije_inventar pi ON pi.inventar_id = am.inventar_pije_id
             WHERE am.artikull_id = $2
             FOR UPDATE OF pi
           ),
           u AS (
             UPDATE pije_inventar pi
             SET stoku_aktual = pi.stoku_aktual - $1
             FROM lidhja
             WHERE pi.inventar_id = lidhja.inventar_id AND pi.stoku_aktual >= $1
             RETURNING pi.inventar_id, pi.stoku_aktual
           )
           SELECT lidhja.emri_pijes, lidhja.stoku_aktual AS para, u.stoku_aktual AS pas
           FROM lidhja LEFT JOIN u ON u.inventar_id = lidhja.inventar_id`,
          [line.sasia, line.artikull_id]
        );
        const row = stock.rows[0];
        if (row && row.pas == null) {
          throw new StockError(row.emri_pijes, Number(row.para));
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, porosi_id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof StockError) {
      return res.status(409).json({ success: false, error: err.message, emri_pijes: err.emri_pijes, ne_stok: err.ne_stok });
    }
    dbError(res, err, 'Gabim në regjistrimin e porosisë');
  } finally {
    client.release();
  }
});

app.delete('/api/porosite/:id', staffOnly, async (req, res) => {
  const id = v.toPosInt(req.params.id);
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // A paid order is part of the takings; it can be cancelled, not erased.
    const paid = await client.query('SELECT 1 FROM pagesat WHERE porosi_id = $1 LIMIT 1', [id]);
    if (paid.rows.length > 0) {
      await client.query('ROLLBACK');
      return bad(res, 'Porosia është paguar dhe nuk mund të fshihet', 409);
    }

    // Deleting means "never happened", so any drinks go back on the shelf.
    if (await inventoryIsLinked(client)) {
      await client.query(
        `UPDATE pije_inventar pi
         SET stoku_aktual = pi.stoku_aktual + ap.sasia
         FROM artikujt_porosise ap
         JOIN artikujt_menu am ON am.artikull_id = ap.artikull_id
         WHERE ap.porosi_id = $1 AND am.inventar_pije_id = pi.inventar_id`,
        [id]
      );
    }

    await client.query('DELETE FROM artikujt_porosise WHERE porosi_id = $1', [id]);
    const deleted = await client.query('DELETE FROM porosite WHERE porosi_id = $1 RETURNING porosi_id', [id]);
    if (deleted.rowCount === 0) {
      await client.query('ROLLBACK');
      return bad(res, 'Porosia nuk u gjet', 404);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    dbError(res, err, 'Gabim në fshirjen e porosisë');
  } finally {
    client.release();
  }
});

app.patch('/api/porosite/:id/statusi', staffOnly, async (req, res) => {
  const id = v.toPosInt(req.params.id);
  const { statusi_porosise } = req.body || {};
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  if (!STATUSET_POROSISE.includes(statusi_porosise)) {
    return bad(res, `statusi_porosise duhet të jetë një nga: ${STATUSET_POROSISE.join(', ')}`);
  }
  try {
    // Reopening clears the close time; closing or cancelling stamps it.
    const result = await pool.query(
      "UPDATE porosite SET statusi_porosise = $1, ora_mbylljes = CASE WHEN $1 = 'E Hapur' THEN NULL ELSE NOW() END WHERE porosi_id = $2 RETURNING porosi_id",
      [statusi_porosise, id]
    );
    if (result.rowCount === 0) return bad(res, 'Porosia nuk u gjet', 404);
    res.json({ success: true });
  } catch (err) {
    dbError(res, err, 'Gabim në ndryshimin e statusit');
  }
});

// ========== PAYMENTS ==========

/**
 * Settle a table. Accepts one order (`porosi_id`) or several (`porosite`),
 * totals them from their line items, and in a single transaction records one
 * payment per order and closes it. If the client sends `shuma` it must match
 * the server's total — a stale screen gets a 400 with the real figure rather
 * than a wrong payment.
 */
app.post('/api/pagesat', async (req, res) => {
  const body = req.body || {};
  const rawIds = Array.isArray(body.porosite) ? body.porosite : [body.porosi_id];
  const ids = [...new Set(rawIds.map(v.toPosInt))];
  const metoda_pageses = body.metoda_pageses;
  const shuma = body.shuma === undefined || body.shuma === null || body.shuma === '' ? undefined : v.toMoney(body.shuma);

  if (ids.length === 0 || ids.some(Number.isNaN)) return bad(res, 'Plotëso fushat: porosi_id (ose porosite[])');
  if (!METODAT_PAGESES.includes(metoda_pageses)) {
    return bad(res, `metoda_pageses duhet të jetë një nga: ${METODAT_PAGESES.join(', ')}`);
  }
  if (Number.isNaN(shuma)) return bad(res, 'shuma duhet të jetë numër ≥ 0');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orders = [];
    for (const id of ids) {
      const found = await client.query(
        'SELECT porosi_id, tavoline_id, punonjes_id, statusi_porosise FROM porosite WHERE porosi_id = $1 FOR UPDATE',
        [id]
      );
      const order = found.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        return bad(res, `Porosia #${id} nuk u gjet`, 404);
      }
      if (req.user.lloji === 'kamarier' && order.punonjes_id !== req.user.punonjes_id) {
        await client.query('ROLLBACK');
        return bad(res, `Porosia #${id} nuk është e juaja`, 403);
      }
      if (order.statusi_porosise !== 'E Hapur') {
        await client.query('ROLLBACK');
        return bad(res, `Porosia #${id} është mbyllur tashmë`, 409);
      }
      const total = await client.query(
        `SELECT COALESCE(SUM(ap.sasia * am.cmimi), 0) AS totali
         FROM artikujt_porosise ap
         JOIN artikujt_menu am ON ap.artikull_id = am.artikull_id
         WHERE ap.porosi_id = $1`,
        [id]
      );
      orders.push({ ...order, totali: Number(total.rows[0]?.totali ?? 0) });
    }

    const totali = orders.reduce((s, o) => s + o.totali, 0);
    if (shuma !== undefined && Math.abs(shuma - totali) > 0.005) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Shuma nuk përputhet me totalin e porosisë', totali });
    }

    const pagesat = [];
    for (const order of orders) {
      const inserted = await client.query(
        'INSERT INTO pagesat (porosi_id, shuma, metoda_pageses, ora_pageses) VALUES ($1, $2, $3, NOW()) RETURNING pagese_id',
        [order.porosi_id, order.totali, metoda_pageses]
      );
      await client.query(
        'UPDATE porosite SET statusi_porosise = $1, ora_mbylljes = NOW() WHERE porosi_id = $2',
        ['E Mbyllur', order.porosi_id]
      );
      pagesat.push({ porosi_id: order.porosi_id, pagese_id: inserted.rows[0].pagese_id, shuma: order.totali });
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, pagese_id: pagesat[0].pagese_id, pagesat, totali });
  } catch (err) {
    await client.query('ROLLBACK');
    dbError(res, err, 'Gabim në regjistrimin e pageses');
  } finally {
    client.release();
  }
});

app.get('/api/pagesat', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pagesat ORDER BY ora_pageses DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/pagesat/:id', staffOnly, async (req, res) => {
  const id = v.toPosInt(req.params.id);
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  try {
    const result = await pool.query('SELECT * FROM pagesat WHERE pagese_id = $1', [id]);
    if (result.rows.length === 0) return bad(res, 'Pagesa nuk u gjet', 404);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim' });
  }
});

// ========== STATISTICS FROM VIEWS ==========
app.get('/api/statistika/xhiro-ditore', staffOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM view_xhiro_ditore WHERE data = CURRENT_DATE'
    );
    res.json(result.rows[0] || { numri_porosive: 0, xhiro_totale: 0, totali_produkteve: 0 });
  } catch (err) {
    console.error(err);
    res.json({ numri_porosive: 0, xhiro_totale: 0, totali_produkteve: 0 });
  }
});

app.get('/api/statistika/produktet-me-te-shitura', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM produktet_me_te_shitura');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/produktet-te-gjitha', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_produktet_te_gjitha');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/dita-me-fitim', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dita_me_fitim');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/fluksi-porosive-ora', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fluksi_porosive_ora');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/kamarieri-me-i-mire', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kamarieri_me_i_mire');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/money-peak', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM money_peak');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/xhiro-trendet', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_xhiro_trendet');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/performance-kamarieret', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_performance_kamarieret');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/porosite-lista', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_porosite_lista LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/porosite-sipas-tavolinave', staffOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_porosite_sipas_tavolinave');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ========== INVENTORY (from pije_inventar table) ==========
app.get('/api/inventar', staffOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        inventar_id,
        emri_pijes,
        njesia,
        stoku_aktual,
        stoku_minimal,
        cmimi_per_njesi,
        (stoku_aktual * cmimi_per_njesi) AS vlera_totale_stoku,
        CASE
          WHEN stoku_aktual = 0 THEN '🔴 PA STOK'
          WHEN stoku_aktual <= stoku_minimal * 0.25 THEN '🟠 KRITIK'
          WHEN stoku_aktual <= stoku_minimal THEN '🟡 I ULËT'
          ELSE '🟢 NORMAL'
        END AS statusi_stokut,
        CASE
          WHEN stoku_aktual < stoku_minimal
          THEN GREATEST(stoku_minimal * 2 - stoku_aktual, 0)
          ELSE 0
        END AS sasia_per_porosi
      FROM pije_inventar
      ORDER BY
        CASE
          WHEN stoku_aktual = 0 THEN 0
          WHEN stoku_aktual <= stoku_minimal * 0.25 THEN 1
          WHEN stoku_aktual <= stoku_minimal THEN 2
          ELSE 3
        END, emri_pijes
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post('/api/inventar/pije', staffOnly, async (req, res) => {
  const body = req.body || {};
  const emri_pijes = typeof body.emri_pijes === 'string' ? body.emri_pijes.trim() : '';
  const njesia = typeof body.njesia === 'string' ? body.njesia.trim() : '';
  const stoku_aktual = v.toMoney(body.stoku_aktual);
  const stoku_minimal = v.toMoney(body.stoku_minimal);
  const cmimi_per_njesi = body.cmimi_per_njesi == null || body.cmimi_per_njesi === '' ? null : v.toMoney(body.cmimi_per_njesi);

  if (!emri_pijes || !njesia || Number.isNaN(stoku_aktual) || Number.isNaN(stoku_minimal) || Number.isNaN(cmimi_per_njesi)) {
    return bad(res, 'Plotëso fushat: emri_pijes, njesia, stoku_aktual (≥ 0), stoku_minimal (≥ 0), cmimi_per_njesi (≥ 0)');
  }

  try {
    const result = await pool.query(
      'INSERT INTO pije_inventar (emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi) VALUES ($1, $2, $3, $4, $5) RETURNING inventar_id',
      [emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi]
    );
    res.status(201).json({ success: true, inventar_id: result.rows[0].inventar_id });
  } catch (err) {
    dbError(res, err, 'Gabim në shtimin e pijes');
  }
});

app.patch('/api/inventar/pije/:id', staffOnly, async (req, res) => {
  const id = v.toPosInt(req.params.id);
  const { sasia } = req.body || {};
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  if (!v.isFiniteNumber(sasia) || sasia === 0) return bad(res, 'sasia duhet të jetë numër i ndryshëm nga zero');

  try {
    // The guard is in the WHERE so a concurrent sale cannot slip the stock negative.
    const result = await pool.query(
      'UPDATE pije_inventar SET stoku_aktual = stoku_aktual + $1 WHERE inventar_id = $2 AND stoku_aktual + $1 >= 0 RETURNING stoku_aktual',
      [sasia, id]
    );
    if (result.rowCount === 0) {
      const exists = await pool.query('SELECT stoku_aktual FROM pije_inventar WHERE inventar_id = $1', [id]);
      if (exists.rows.length === 0) return bad(res, 'Pija nuk u gjet', 404);
      return res.status(400).json({
        success: false,
        error: 'Stoku nuk mund të bjerë nën zero',
        stoku_aktual: exists.rows[0].stoku_aktual,
      });
    }
    res.json({ success: true, stoku_aktual: result.rows[0].stoku_aktual });
  } catch (err) {
    dbError(res, err, 'Gabim në ndryshimin e stokut');
  }
});

// ========== RESERVATIONS ==========
app.get('/api/rezervimet', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_rezervime_lista WHERE data_rezervimit >= CURRENT_DATE');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post('/api/rezervimet', async (req, res) => {
  const body = req.body || {};
  const emri_klientit = typeof body.emri_klientit === 'string' ? body.emri_klientit.trim() : '';
  const numri_personave = v.toPosInt(body.numri_personave);
  const { data_rezervimit, ora_rezervimit } = body;
  const tavoline_id = body.tavoline_id == null || body.tavoline_id === '' ? null : v.toPosInt(body.tavoline_id);
  const numri_telefonit = typeof body.numri_telefonit === 'string' && body.numri_telefonit.trim() ? body.numri_telefonit.trim() : null;
  const shenim = typeof body.shenim === 'string' && body.shenim.trim() ? body.shenim.trim() : null;

  if (!emri_klientit || Number.isNaN(numri_personave) || !v.isIsoDate(data_rezervimit) || !v.isTime(ora_rezervimit)) {
    return bad(res, 'Plotëso fushat: emri_klientit, numri_personave (> 0), data_rezervimit (YYYY-MM-DD), ora_rezervimit (HH:MM)');
  }
  if (Number.isNaN(tavoline_id)) return bad(res, 'tavoline_id i pavlefshëm');
  if (data_rezervimit < v.todayIso()) return bad(res, 'Data e rezervimit ka kaluar');

  try {
    if (tavoline_id !== null) {
      const table = await pool.query('SELECT kapaciteti FROM tavolinat WHERE tavoline_id = $1', [tavoline_id]);
      if (table.rows.length === 0) return bad(res, 'Tavolina nuk u gjet', 404);
      const kapaciteti = Number(table.rows[0].kapaciteti);
      if (Number.isFinite(kapaciteti) && numri_personave > kapaciteti) {
        return res.status(400).json({
          success: false,
          error: `Tavolina nxë ${kapaciteti} persona`,
          kapaciteti,
        });
      }

      const clash = await pool.query(
        `SELECT rezervim_id, ora_rezervimit FROM rezervimet
         WHERE tavoline_id = $1 AND data_rezervimit = $2::date AND statusi = 'E konfirmuar'
           AND ABS(EXTRACT(EPOCH FROM (ora_rezervimit::time - $3::time))) < $4
         LIMIT 1`,
        [tavoline_id, data_rezervimit, ora_rezervimit, KOHEZGJATJA_REZERVIMIT_SEK]
      );
      if (clash.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Tavolina është e rezervuar për këtë orar',
          rezervim_id: clash.rows[0].rezervim_id,
        });
      }
    }

    const result = await pool.query(
      'INSERT INTO rezervimet (emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim, statusi) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING rezervim_id',
      [emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim, 'E konfirmuar']
    );
    res.status(201).json({ success: true, rezervim_id: result.rows[0].rezervim_id });
  } catch (err) {
    dbError(res, err, 'Gabim në krijimin e rezervimit');
  }
});

app.patch('/api/rezervimet/:id/statusi', async (req, res) => {
  const id = v.toPosInt(req.params.id);
  const { statusi } = req.body || {};
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  if (!STATUSET_REZERVIMIT.includes(statusi)) {
    return bad(res, `statusi duhet të jetë një nga: ${STATUSET_REZERVIMIT.join(', ')}`);
  }
  try {
    const result = await pool.query(
      'UPDATE rezervimet SET statusi = $1 WHERE rezervim_id = $2 RETURNING rezervim_id',
      [statusi, id]
    );
    if (result.rowCount === 0) return bad(res, 'Rezervimi nuk u gjet', 404);
    res.json({ success: true });
  } catch (err) {
    dbError(res, err, 'Gabim në ndryshimin e statusit');
  }
});

app.delete('/api/rezervimet/:id', staffOnly, async (req, res) => {
  const id = v.toPosInt(req.params.id);
  if (Number.isNaN(id)) return bad(res, 'id i pavlefshëm');
  try {
    const result = await pool.query('DELETE FROM rezervimet WHERE rezervim_id = $1 RETURNING rezervim_id', [id]);
    if (result.rowCount === 0) return bad(res, 'Rezervimi nuk u gjet', 404);
    res.json({ success: true });
  } catch (err) {
    dbError(res, err, 'Gabim në fshirjen e rezervimit');
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return bad(res, 'JSON i pavlefshëm');
  }
  if (err.type === 'entity.too.large') {
    return bad(res, 'Kërkesa është shumë e madhe', 413);
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Export the app for Vercel serverless. Run a listener only when executed directly.
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}
