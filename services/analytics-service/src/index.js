require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
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

let mongoDb, paymentsCol;
MongoClient.connect(process.env.MONGO_URI, { useUnifiedTopology: true }).then(client => {
  mongoDb = client.db();
  paymentsCol = mongoDb.collection('payments');
});

// Event listeners for analytics (optional for demo)
async function connectRabbit() {
  const conn = await amqp.connect('amqp://rabbitmq:5672');
  const channel = await conn.createChannel();
  await channel.assertExchange('events', 'topic', { durable: true });
  // Could subscribe to events for real-time analytics
}
connectRabbit();

app.get('/analytics/summary', async (req, res) => {
  try {
    const ordersRes = await pool.query('SELECT * FROM orders');
    const orders = ordersRes.rows;
    const payments = await paymentsCol.find({}).toArray();
    const totalRevenue = payments.reduce((sum, p) => p.status === 'success' ? sum + Number(p.amount) : sum, 0);
    const failedPayments = payments.filter(p => p.status === 'failed').length;
    const ordersWithPayment = orders.map(order => {
      const payment = payments.find(p => p.orderId === order.order_id);
      return {
        orderId: order.order_id,
        amount: Number(order.amount),
        customer: order.customer,
        paymentStatus: payment ? payment.status : 'pending'
      };
    });
    res.json({ totalRevenue, orders: ordersWithPayment, failedPayments });
  } catch (err) {
    console.error('Analytics error', err);
    res.status(500).json({ error: 'Analytics error' });
  }
});

app.get('/data-products', (req, res) => {
  res.json([
    {
      name: 'Order Summary',
      endpoint: '/analytics/summary',
      schema: {
        totalRevenue: 'number',
        orders: [
          { orderId: 'string', amount: 'number', customer: 'string', paymentStatus: 'string' }
        ],
        failedPayments: 'number'
      },
      description: 'Aggregated orders and payments analytics.'
    }
  ]);
});

const port = process.env.PORT || 3003;
app.listen(port, () => console.log(`Analytics Service running on ${port}`));
