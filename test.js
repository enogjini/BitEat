const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'restaurant',
  password: '123',
  port: 5432,
});

// ========== AUTHENTICATION ==========
app.post('/api/login', async (req, res) => {
  const { emri_perdoruesit, password, lloji, punonjes_id } = req.body;
  
  try {
    if (lloji === 'admin') {
      const result = await pool.query(
        'SELECT * FROM punonjesit WHERE emri = $1 AND password = $2',
        [emri_perdoruesit, password]
      );
      if (result.rows.length > 0) {
        res.json({ success: true, user: { ...result.rows[0], lloji: 'admin' } });
      } else {
        res.status(401).json({ success: false, message: 'Kredencialet gabim!' });
      }
    } 
    else if (lloji === 'menaxher') {
      const result = await pool.query(
        'SELECT * FROM punonjesit WHERE emri = $1 AND password = $2 AND lloji_perdoruesit = $3',
        [emri_perdoruesit, password, 'menaxher']
      );
      if (result.rows.length > 0) {
        res.json({ success: true, user: { ...result.rows[0], lloji: 'menaxher' } });
      } else {
        res.status(401).json({ success: false, message: 'Kredencialet gabim!' });
      }
    }
    else if (lloji === 'kamarier') {
      if (!punonjes_id || !password) {
        return res.status(400).json({ success: false, message: 'Plotëso fushat!' });
      }
      const result = await pool.query(
        'SELECT * FROM punonjesit WHERE punonjes_id = $1 AND password = $2',
        [punonjes_id, password]
      );
      if (result.rows.length > 0) {
        res.json({ success: true, user: { ...result.rows[0], lloji: 'kamarier' } });
      } else {
        res.status(401).json({ success: false, message: 'Kredencialet gabim!' });
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Gabim' });
  }
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

app.post('/api/menu', async (req, res) => {
  const { emri, cmimi, kategori_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO artikujt_menu (emri, cmimi, kategori_id) VALUES ($1, $2, $3) RETURNING artikull_id',
      [emri, cmimi, kategori_id]
    );
    res.status(201).json({ success: true, artikull_id: result.rows[0].artikull_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
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
  const { id } = req.params;
  const { gjendja } = req.body;
  try {
    await pool.query('UPDATE tavolinat SET gjendja = $1 WHERE tavoline_id = $2', [gjendja, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
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
app.get('/api/porosite', async (req, res) => {
  try {
    const { punonjes_id, statusi } = req.query;
    let query = `
      SELECT p.*, t.numri_tavolines, pu.emri || ' ' || pu.mbiemri as kamarier
      FROM porosite p
      LEFT JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      WHERE 1=1
    `;
    const params = [];
    
    if (punonjes_id) {
      query += ` AND p.punonjes_id = $${params.length + 1}`;
      params.push(parseInt(punonjes_id));
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
  const { id } = req.params;
  try {
    const porosi = await pool.query(`
      SELECT p.*, t.numri_tavolines, t.vendndodhja, pu.emri || ' ' || pu.mbiemri as kamarier
      FROM porosite p
      LEFT JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      WHERE p.porosi_id = $1
    `, [id]);
    
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
  const { tavoline_id, punonjes_id, artikujt } = req.body;
  
  // Validim i inputit
  if (!tavoline_id || !punonjes_id || !artikujt || artikujt.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Plotëso fushat: tavoline_id, punonjes_id, dhe artikujt' 
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const porosiRes = await client.query(
      'INSERT INTO porosite (tavoline_id, punonjes_id, statusi_porosise, ora_porosise) VALUES ($1, $2, $3, NOW()) RETURNING porosi_id',
      [tavoline_id, punonjes_id, 'E Hapur']
    );
    
    const porosi_id = porosiRes.rows[0].porosi_id;
    
    for (const art of artikujt) {
      await client.query(
        'INSERT INTO artikujt_porosise (porosi_id, artikull_id, sasia) VALUES ($1, $2, $3)',
        [porosi_id, parseInt(art.artikull_id), parseInt(art.sasia)]
      );
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, porosi_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Gabim në POST /api/porosite:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Gabim në regjistrimin e porosisë: ' + err.message 
    });
  } finally {
    client.release();
  }
});

app.delete('/api/porosite/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM artikujt_porosise WHERE porosi_id = $1', [id]);
    await client.query('DELETE FROM porosite WHERE porosi_id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gabim' });
  } finally {
    client.release();
  }
});

app.patch('/api/porosite/:id/statusi', async (req, res) => {
  const { id } = req.params;
  const { statusi_porosise } = req.body;
  try {
    await pool.query('UPDATE porosite SET statusi_porosise = $1 WHERE porosi_id = $2', [statusi_porosise, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim fatal3' });
  }
});

// ========== PAYMENTS ==========
app.post('/api/pagesat', async (req, res) => {
  const { porosi_id, shuma, metoda_pageses, ora_pageses } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO pagesat (porosi_id, shuma, metoda_pageses, ora_pageses) VALUES ($1, $2, $3, $4) RETURNING pagese_id',
      [porosi_id, shuma, metoda_pageses, ora_pageses]
    );
    res.status(201).json({ success: true, pagese_id: result.rows[0].pagese_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Gabim në regjistrimin e pageses' });
  }
});

app.get('/api/pagesat', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pagesat ORDER BY ora_pageses DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/pagesat/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM pagesat WHERE pagese_id = $1', [id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim' });
  }
});

// ========== STATISTICS FROM VIEWS ==========
app.get('/api/statistika/xhiro-ditore', async (req, res) => {
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

app.get('/api/statistika/produktet-me-te-shitura', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM produktet_me_te_shitura');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/produktet-te-gjitha', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_produktet_te_gjitha');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/dita-me-fitim', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dita_me_fitim');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/fluksi-porosive-ora', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fluksi_porosive_ora');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/kamarieri-me-i-mire', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kamarieri_me_i_mire');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/money-peak', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM money_peak');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/xhiro-trendet', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_xhiro_trendet');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/performance-kamarieret', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_performance_kamarieret');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/porosite-lista', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_porosite_lista LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/statistika/porosite-sipas-tavolinave', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_porosite_sipas_tavolinave');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ========== INVENTORY (from pije_inventar table) ==========
app.get('/api/inventar', async (req, res) => {
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

app.post('/api/inventar/pije', async (req, res) => {
  const { emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO pije_inventar (emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi) VALUES ($1, $2, $3, $4, $5) RETURNING inventar_id',
      [emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi]
    );
    res.status(201).json({ success: true, inventar_id: result.rows[0].inventar_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.patch('/api/inventar/pije/:id', async (req, res) => {
  const { id } = req.params;
  const { sasia } = req.body;
  try {
    await pool.query(
      'UPDATE pije_inventar SET stoku_aktual = stoku_aktual + $1 WHERE inventar_id = $2',
      [sasia, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim' });
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
  const { emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO rezervimet (emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim, statusi) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING rezervim_id',
      [emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim, 'E konfirmuar']
    );
    res.status(201).json({ success: true, rezervim_id: result.rows[0].rezervim_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.patch('/api/rezervimet/:id/statusi', async (req, res) => {
  const { id } = req.params;
  const { statusi } = req.body;
  try {
    await pool.query('UPDATE rezervimet SET statusi = $1 WHERE rezervim_id = $2', [statusi, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim' });
  }
});

app.delete('/api/rezervimet/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM rezervimet WHERE rezervim_id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gabim' });
  }
});

app.listen(5000, () => {
  console.log('🚀 Server: http://localhost:5000');
  console.log('📊 Statistics from DATABASE VIEWS');
  console.log('📦 Inventory from pije_inventar table');
});