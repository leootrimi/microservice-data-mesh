// Simple DB init script for Orders
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB
});

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(50) PRIMARY KEY,
    amount NUMERIC NOT NULL,
    customer VARCHAR(100) NOT NULL
  )`);
  process.exit(0);
})();
