const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};