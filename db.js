const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Add it to your local .env or Vercel environment variables.');
}

const connectionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text, values) {
  const client = await connectionPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO public');
    const result = await client.query(text, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function connect() {
  const client = await connectionPool.connect();
  const queryClient = client.query.bind(client);
  let searchPathSet = false;

  client.query = async (text, values) => {
    if (!searchPathSet && typeof text === 'string' && text.trim().toUpperCase() === 'BEGIN') {
      const result = await queryClient(text, values);
      await queryClient('SET LOCAL search_path TO public');
      searchPathSet = true;
      return result;
    }
    return queryClient(text, values);
  };

  return client;
}

module.exports = { query, connect, end: () => connectionPool.end() };
