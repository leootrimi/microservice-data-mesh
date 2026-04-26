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
    amount NUMERIC NOT NULL CHECK (amount > 0),
    customer VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders_data_product (
    order_id VARCHAR(50) PRIMARY KEY,
    customer VARCHAR(100) NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    order_status VARCHAR(20) NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ NOT NULL
  )`);
  process.exit(0);
})();
