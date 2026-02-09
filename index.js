const express = require('express');
const app = express();
const cors = require('cors');
const pool = require('./db'); // Import the connection from step 2

// Middleware
app.use(cors());
app.use(express.json()); // Allows us to handle JSON data

// ROUTES
// Example: Get all users
app.get('/users', async (req, res) => {
  try {
    const allUsers = await pool.query('SELECT * FROM porosite');
    res.json(allUsers.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.listen(5000, () => {
  console.log('Server is running on port 5000');
});