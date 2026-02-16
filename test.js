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

// ========================================
// AUTHENTICATION
// ========================================

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
    res.status(500).json({ success: false, message: 'Gabim në server' });
  }
});

// ========================================
// STATISTICS (Using VIEWs)
// ========================================

// Daily revenue from pamja_e_xhiros_ditore
app.get('/api/statistika/xhiro-ditore', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        numri_porosive,
        xhiro_totale,
        totali_produkteve
      FROM pamja_e_xhiros_ditore
      WHERE data = CURRENT_DATE
    `);
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({ 
        xhiro_totale: 0, 
        numri_porosive: 0, 
        totali_produkteve: 0 
      });
    }
  } catch (err) {
    console.error('Error fetching daily revenue:', err);
    res.json({ xhiro_totale: 0, numri_porosive: 0, totali_produkteve: 0 });
  }
});

// General statistics
app.get('/api/statistika/pergjithshme', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_statistika_pergjithshme');
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error fetching general stats:', err);
    res.status(500).json({});
  }
});

// Sales trends (last 7 days)
app.get('/api/statistika/trendet', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_xhiro_trendet');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trends:', err);
    res.status(500).json([]);
  }
});

// Best selling products - Today
app.get('/api/statistika/produktet-me-te-shitura', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_produktet_sot');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json([]);
  }
});

// Best selling products - All Time
app.get('/api/statistika/produktet-te-gjitha', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_produktet_te_gjitha');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all-time products:', err);
    res.status(500).json([]);
  }
});

// Staff performance
app.get('/api/statistika/performance-kamarieret', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_performance_kamarieret');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching staff performance:', err);
    res.status(500).json([]);
  }
});

// ========================================
// INVENTORY (Using VIEW)
// ========================================

app.get('/api/inventar', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        inventar_id,
        emri_pijes AS emri_perberesit,
        njesia,
        stoku_aktual,
        stoku_minimal,
        cmimi_per_njesi,
        statusi_stokut,
        sasia_per_porosi,
        vlera_totale_stoku
      FROM raport_inventar_pijesh
      ORDER BY 
        CASE 
          WHEN statusi_stokut LIKE '%PA STOK%' THEN 0
          WHEN statusi_stokut LIKE '%KRITIK%' THEN 1
          WHEN statusi_stokut LIKE '%ULËT%' THEN 2
          ELSE 3
        END,
        emri_pijes
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json([]);
  }
});

app.post('/api/inventar/pije', async (req, res) => {
  const { emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO inventar_pijesh (emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi)
       VALUES ($1, $2, $3, $4, $5) RETURNING inventar_id`,
      [emri_pijes, njesia, stoku_aktual, stoku_minimal, cmimi_per_njesi]
    );
    
    res.status(201).json({ 
      success: true, 
      inventar_id: result.rows[0].inventar_id,
      message: 'Pija u shtua!' 
    });
  } catch (err) {
    console.error('Error adding drink:', err);
    res.status(500).json({ success: false, error: 'Gabim në server' });
  }
});

app.patch('/api/inventar/pije/:id', async (req, res) => {
  const { id } = req.params;
  const { sasia } = req.body;
  
  try {
    await pool.query('SELECT add_drink_inventory($1, $2)', [id, sasia]);
    res.json({ success: true, message: 'Stoku u përditësua!' });
  } catch (err) {
    console.error('Error updating inventory:', err);
    res.status(500).json({ error: 'Gabim' });
  }
});

// ========================================
// TABLES (Using VIEW)
// ========================================

app.get('/api/tavolinat', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tavolinat ORDER BY numri_tavolines');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tables:', err);
    res.status(500).json([]);
  }
});

app.get('/api/tavolinat/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_tavolinat_status');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching table status:', err);
    res.status(500).json([]);
  }
});

app.patch('/api/tavolinat/:id/gjendja', async (req, res) => {
  const { id } = req.params;
  const { gjendja } = req.body;
  
  try {
    await pool.query(
      'UPDATE tavolinat SET gjendja = $1 WHERE tavoline_id = $2',
      [gjendja, id]
    );
    res.json({ success: true, message: 'Gjendja u përditësua!' });
  } catch (err) {
    console.error('Error updating table status:', err);
    res.status(500).json({ success: false, error: 'Gabim' });
  }
});

// ========================================
// EMPLOYEES
// ========================================

app.get('/api/punonjesit', async (req, res) => {
  const { lloji } = req.query;
  try {
    let query = 'SELECT * FROM punonjesit';
    let params = [];
    
    if (lloji === 'kamarier') {
      query += ' WHERE lloji_perdoruesit = $1';
      params = ['kamarier'];
    }
    
    query += ' ORDER BY emri';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json([]);
  }
});

// ========================================
// CATEGORIES
// ========================================

app.get('/api/kategorite', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kategorite ORDER BY emri');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json([]);
  }
});

// ========================================
// MENU
// ========================================

app.get('/api/menu', async (req, res) => {
  const { kategori_id } = req.query;
  try {
    let query = 'SELECT * FROM artikujt_menu';
    let params = [];
    
    if (kategori_id && kategori_id !== "") {
      query += ' WHERE kategori_id = $1';
      params = [parseInt(kategori_id)];
    }
    
    query += ' ORDER BY emri ASC';
    const result = await pool.query(query, params);
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error fetching menu:', err);
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
    
    res.status(201).json({ 
      success: true, 
      artikull_id: result.rows[0].artikull_id,
      message: 'Produkti u shtua!' 
    });
  } catch (err) {
    console.error('Error adding product:', err);
    res.status(500).json({ success: false, error: 'Gabim' });
  }
});

// ========================================
// ORDERS (Using VIEWs)
// ========================================

app.get('/api/porosite', async (req, res) => {
  const { punonjes_id, statusi } = req.query;
  
  try {
    let query = 'SELECT * FROM view_porosite_lista WHERE 1=1';
    let params = [];
    let paramCount = 1;
    
    if (punonjes_id) {
      query += ` AND punonjes_id = $${paramCount}`;
      params.push(parseInt(punonjes_id));
      paramCount++;
    }
    
    if (statusi) {
      query += ` AND statusi_porosise = $${paramCount}`;
      params.push(statusi);
    }
    
    query += ' ORDER BY ora_porosise DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json([]);
  }
});

app.get('/api/porosite/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const porosiQuery = await pool.query(
      'SELECT * FROM view_porosite_lista WHERE porosi_id = $1',
      [id]
    );
    
    const artikujtQuery = await pool.query(
      'SELECT * FROM view_porosi_detaje WHERE porosi_id = $1',
      [id]
    );
    
    res.json({
      porosi: porosiQuery.rows[0],
      artikujt: artikujtQuery.rows
    });
  } catch (err) {
    console.error('Error fetching order details:', err);
    res.status(500).json({ error: 'Gabim' });
  }
});

app.post('/api/porosite', async (req, res) => {
  const { tavoline_id, punonjes_id, artikujt } = req.body;
  
  try {
    const porosiResult = await pool.query(
      'INSERT INTO porosite (tavoline_id, punonjes_id, ora_porosise, statusi_porosise) VALUES ($1, $2, NOW(), $3) RETURNING porosi_id',
      [tavoline_id, punonjes_id, 'E Hapur']
    );
    
    const porosi_id = porosiResult.rows[0].porosi_id;
    
    for (const art of artikujt) {
      await pool.query(
        'INSERT INTO artikujt_porosise (porosi_id, artikull_id, sasia, cmimi) VALUES ($1, $2, $3, $4)',
        [porosi_id, art.artikull_id, art.sasia, art.cmimi]
      );
    }
    
    res.status(201).json({ success: true, porosi_id });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Gabim' });
  }
});

app.patch('/api/porosite/:id/statusi', async (req, res) => {
  const { id } = req.params;
  const { statusi } = req.body;
  
  try {
    await pool.query(
      'UPDATE porosite SET statusi_porosise = $1 WHERE porosi_id = $2',
      [statusi, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Gabim' });
  }
});

app.delete('/api/porosite/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM porosite WHERE porosi_id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: 'Gabim' });
  }
});

// ========================================
// RESERVATIONS (Using VIEW)
// ========================================

app.get('/api/rezervimet', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM view_rezervime_lista');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json([]);
  }
});

app.post('/api/rezervimet', async (req, res) => {
  const { emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO rezervimet (emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id, numri_telefonit, shenim, statusi)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'E konfirmuar') RETURNING rezervim_id`,
      [emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, tavoline_id || null, numri_telefonit, shenim]
    );
    
    res.status(201).json({ success: true, rezervim_id: result.rows[0].rezervim_id });
  } catch (err) {
    console.error('Error creating reservation:', err);
    res.status(500).json({ success: false, error: 'Gabim' });
  }
});

app.patch('/api/rezervimet/:id/statusi', async (req, res) => {
  const { id } = req.params;
  const { statusi } = req.body;
  
  try {
    await pool.query(
      'UPDATE rezervimet SET statusi = $1 WHERE rezervim_id = $2',
      [statusi, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating reservation:', err);
    res.status(500).json({ error: 'Gabim' });
  }
});

// ========================================
// START SERVER
// ========================================

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Using optimized database VIEWs`);
  console.log(`✅ All endpoints ready!`);
});