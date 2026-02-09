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

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { emri_perdoruesit, password, lloji, punonjes_id } = req.body;
  
  try {
    // Login për Administrator
    if (lloji === 'admin') {
      const result = await pool.query(
        'SELECT * FROM punonjesit WHERE emri = $1 AND password = $2',
        [emri_perdoruesit, password]
      );
      
      if (result.rows.length > 0) {
        res.json({ 
          success: true, 
          user: { ...result.rows[0], lloji: 'admin' } 
        });
      } else {
        res.status(401).json({ success: false, message: 'Kredencialet gabim!' });
      }
    } 
    // Login për Menaxher
    else if (lloji === 'menaxher') {
      console.log('Attempting manager login:', { emri_perdoruesit, password });
      
      const result = await pool.query(
        'SELECT * FROM punonjesit WHERE emri = $1 AND password = $2 AND lloji_perdoruesit = $3',
        [emri_perdoruesit, password, 'menaxher']
      );
      
      console.log('Manager query result:', result.rows);
      
      if (result.rows.length > 0) {
        res.json({ 
          success: true, 
          user: { ...result.rows[0], lloji: 'menaxher' } 
        });
      } else {
        // Le të kontrollojmë nëse ekziston përdoruesi
        const checkUser = await pool.query(
          'SELECT emri, lloji_perdoruesit FROM punonjesit WHERE emri = $1',
          [emri_perdoruesit]
        );
        console.log('User check:', checkUser.rows);
        
        res.status(401).json({ 
          success: false, 
          message: 'Kredencialet gabim!' 
        });
      }
    }
    // Login për Kamarier
    else if (lloji === 'kamarier') {
      // Kontrollo që të dy fushat të jenë të plota
      if (!punonjes_id || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Ju lutem zgjidhni emrin dhe fusni fjalëkalimin!' 
        });
      }

      const result = await pool.query(
        'SELECT * FROM punonjesit WHERE punonjes_id = $1 AND password = $2 AND lloji_perdoruesit = $3',
        [punonjes_id, password, 'kamarier']
      );
      
      if (result.rows.length > 0) {
        res.json({ 
          success: true, 
          user: { ...result.rows[0], lloji: 'kamarier' } 
        });
      } else {
        res.status(401).json({ 
          success: false, 
          message: 'Fjalëkalimi është gabim!' 
        });
      }
    }
    else {
      res.status(400).json({ 
        success: false, 
        message: 'Lloji i përdoruesit është i pavlefshëm!' 
      });
    }
  } catch (err) {
    console.error('Gabim në login:', err);
    res.status(500).json({ success: false, message: 'Gabim në server' });
  }
});

// ========== BASIC ENDPOINTS ==========

app.get('/api/menu', async (req, res) => {
  const { kategori_id } = req.query;
  try {
    let queryText = 'SELECT * FROM artikujt_menu';
    let values = [];
    
    if (kategori_id && kategori_id !== "") {
      queryText += ' WHERE kategori_id = $1';
      values.push(parseInt(kategori_id));
    }
    
    queryText += ' ORDER BY emri ASC';
    const result = await pool.query(queryText, values);
    res.json(result.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get('/api/kategorite', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kategorite ORDER BY emri ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/tavolinat', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tavolinat ORDER BY numri_tavolines ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/punonjesit', async (req, res) => {
  try {
    // Merr vetëm kamarieret për dropdown në login
    const { lloji } = req.query;
    
    let queryText = 'SELECT punonjes_id, emri, mbiemri, lloji_perdoruesit FROM punonjesit';
    let conditions = [];
    
    if (lloji === 'kamarier') {
      conditions.push("lloji_perdoruesit = 'kamarier'");
    }
    
    // Përjashto admin nga lista (për POS)
    conditions.push("emri != 'admin'");
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    queryText += ' ORDER BY emri ASC';
    
    const result = await pool.query(queryText);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ========== ORDERS ENDPOINTS ==========




// Get open orders for a specific waiter
app.get('/api/porosite/kamarier/:punonjes_id', async (req, res) => {
  const { punonjes_id } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        p.porosi_id,
        p.statusi_porosise,
        p.ora_porosise,
        t.numri_tavolines
      FROM porosite p
      JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      WHERE p.punonjes_id = $1
        AND p.statusi_porosise = 'E Hapur'
      ORDER BY p.ora_porosise DESC
    `, [punonjes_id]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});



// Get all orders (recent) or filtered by status and waiter
app.get('/api/porosite', async (req, res) => {
  try {
    const { punonjes_id, statusi } = req.query;
    let queryText = `
      SELECT 
        p.*,
        t.numri_tavolines,
        pu.emri || ' ' || pu.mbiemri as kamarier
      FROM porosite p
      LEFT JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      WHERE 1=1
    `;
    let values = [];
    let paramCount = 1;

    // Filter by waiter if provided
    if (punonjes_id) {
      queryText += ` AND p.punonjes_id = $${paramCount}`;
      values.push(parseInt(punonjes_id));
      paramCount++;
    }

    // Filter by status if provided
    if (statusi) {
      queryText += ` AND p.statusi_porosise = $${paramCount}`;
      values.push(statusi);
      paramCount++;
    }

    queryText += ' ORDER BY p.porosi_id DESC';
    
    // Only apply limit if fetching all orders (admin view)
    if (!punonjes_id) {
      queryText += ' LIMIT 10';
    }

    const result = await pool.query(queryText, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Get order details with items
app.get('/api/porosite/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const porosi = await pool.query(`
      SELECT 
        p.*,
        t.numri_tavolines,
        t.vendndodhja,
        pu.emri || ' ' || pu.mbiemri as kamarier
      FROM porosite p
      LEFT JOIN tavolinat t ON p.tavoline_id = t.tavoline_id
      LEFT JOIN punonjesit pu ON p.punonjes_id = pu.punonjes_id
      WHERE p.porosi_id = $1
    `, [id]);
    
    const artikujt = await pool.query(`
      SELECT 
        ap.*,
        am.emri,
        am.cmimi,
        (ap.sasia * am.cmimi) as totali
      FROM artikujt_porosise ap
      JOIN artikujt_menu am ON ap.artikull_id = am.artikull_id
      WHERE ap.porosi_id = $1
    `, [id]);
    
    res.json({
      porosi: porosi.rows[0],
      artikujt: artikujt.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Gabim në server' });
  }
});

// Get orders grouped by table
app.get('/api/porosite/sipas-tavolinave', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.tavoline_id,
        t.numri_tavolines,
        t.vendndodhja,
        COUNT(p.porosi_id) as numri_porosive,
        SUM(COALESCE((
          SELECT SUM(ap.sasia * am.cmimi)
          FROM artikujt_porosise ap
          JOIN artikujt_menu am ON ap.artikull_id = am.artikull_id
          WHERE ap.porosi_id = p.porosi_id
        ), 0)) as xhiro_totale
      FROM tavolinat t
      LEFT JOIN porosite p ON t.tavoline_id = p.tavoline_id
      GROUP BY t.tavoline_id, t.numri_tavolines, t.vendndodhja
      ORDER BY numri_porosive DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// Create new order
app.post('/api/porosite', async (req, res) => {
  const { tavoline_id, punonjes_id, artikujt } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const porosiaResult = await client.query(
      `INSERT INTO porosite (tavoline_id, punonjes_id, statusi_porosise, ora_porosise) 
      VALUES ($1, $2, $3, NOW()) RETURNING porosi_id`,
      [tavoline_id, punonjes_id, 'E Hapur']
    );

    const newPorosiId = porosiaResult.rows[0].porosi_id;

    for (const artikull of artikujt) {
      await client.query(
        `INSERT INTO artikujt_porosise (porosi_id, artikull_id, sasia) 
        VALUES ($1, $2, $3)`,
        [newPorosiId, artikull.artikull_id, artikull.sasia]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ 
      porosi_id: newPorosiId, 
      message: `Porosia u krijua me ${artikujt.length} artikuj!` 
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gabim në server' });
  } finally {
    client.release();
  }
});

// Delete order
app.delete('/api/porosite/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Fshi artikujt e porosisë
    await client.query('DELETE FROM artikujt_porosise WHERE porosi_id = $1', [id]);
    
    // Fshi pagesën (nëse ekziston)
    await client.query('DELETE FROM pagesat WHERE porosi_id = $1', [id]);
    
    // Fshi porosinë
    await client.query('DELETE FROM porosite WHERE porosi_id = $1', [id]);
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Porosia u fshi me sukses!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gabim në fshirje' });
  } finally {
    client.release();
  }
});

// Update order status
app.patch('/api/porosite/:id/statusi', async (req, res) => {
  const { id } = req.params;
  const { statusi } = req.body;
  
  try {
    await pool.query(
      'UPDATE porosite SET statusi_porosise = $1 WHERE porosi_id = $2',
      [statusi, id]
    );
    res.json({ success: true, message: 'Statusi u përditësua!' });
  } catch (err) {
    res.status(500).json({ error: 'Gabim në përditësim' });
  }
});

// Update status for all orders of a table
app.patch('/api/porosite/tavoline/:tavoline_id/statusi', async (req, res) => {
  const { tavoline_id } = req.params;
  const { statusi } = req.body;
  
  try {
    await pool.query(
      'UPDATE porosite SET statusi_porosise = $1 WHERE tavoline_id = $2',
      [statusi, tavoline_id]
    );
    res.json({ success: true, message: 'Statusi i tavolinës u përditësua!' });
  } catch (err) {
    res.status(500).json({ error: 'Gabim në përditësim' });
  }
});



// ========== STATISTICS ENDPOINTS ==========

// Daily revenue
app.get('/api/statistika/xhiro-ditore', async (req, res) => {
  const { data } = req.query; // format: YYYY-MM-DD
  const targetDate = data || new Date().toISOString().split('T')[0];
  
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT p.porosi_id) as numri_porosive,
        SUM(ap.sasia * am.cmimi) as xhiro_totale,
        SUM(ap.sasia) as totali_produkteve
      FROM porosite p
      JOIN artikujt_porosise ap ON p.porosi_id = ap.porosi_id
      JOIN artikujt_menu am ON ap.artikull_id = am.artikull_id
      WHERE DATE(p.ora_porosise) = $1
    `, [targetDate]);
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gabim në server' });
  }
});

// Best selling products
app.get('/api/statistika/produktet-me-te-shitura', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM produktet_me_te_shitura LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Inventory status
app.get('/api/inventar', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        perberes_id,
        emri_perberesit,
        njesia,
        stoku_aktual,
        stoku_minimal,
        cmimi_per_njesi,
        CASE 
          WHEN stoku_aktual <= stoku_minimal THEN 'Kritik'
          WHEN stoku_aktual <= stoku_minimal * 1.5 THEN 'I Ulet'
          ELSE 'Normal'
        END as statusi_stokut
      FROM perberesit
      ORDER BY 
        CASE 
          WHEN stoku_aktual <= stoku_minimal THEN 1
          WHEN stoku_aktual <= stoku_minimal * 1.5 THEN 2
          ELSE 3
        END,
        emri_perberesit
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.listen(5000, () => console.log("🚀 Server running on http://localhost:5000"));