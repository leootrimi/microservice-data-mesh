require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const { validateEvent } = require('../shared/governance/validator');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB
});

let channel;
async function connectRabbit() {
  const conn = await amqp.connect('amqp://rabbitmq:5672');
  channel = await conn.createChannel();
  await channel.assertExchange('events', 'topic', { durable: true });
}
connectRabbit();

app.post('/orders', async (req, res) => {
  const order = req.body;
  const { valid, errors } = validateEvent('order_created', order);
  if (!valid) {
    console.error('Order schema validation failed', errors);
    return res.status(400).json({ error: 'Invalid order', details: errors });
  }
  try {
    await pool.query('INSERT INTO orders(order_id, amount, customer) VALUES ($1, $2, $3)', [order.orderId, order.amount, order.customer]);
    channel.publish('events', 'order_created', Buffer.from(JSON.stringify(order)));
    res.json({ status: 'Order created', order });
  } catch (err) {
    console.error('DB error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Orders Service running on ${port}`));
