require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const amqp = require('amqplib');
const { validateEvent } = require('../shared/governance/validator');

const app = express();
app.use(express.json());

let db, payments, channel;

async function connectMongo() {
  const client = await MongoClient.connect(process.env.MONGO_URI, { useUnifiedTopology: true });
  db = client.db();
  payments = db.collection('payments');
}
connectMongo();

async function connectRabbit() {
  const conn = await amqp.connect('amqp://rabbitmq:5672');
  channel = await conn.createChannel();
  await channel.assertExchange('events', 'topic', { durable: true });
  await channel.assertQueue('payments-order-created', { durable: true });
  await channel.bindQueue('payments-order-created', 'events', 'order_created');
  channel.consume('payments-order-created', async (msg) => {
    const order = JSON.parse(msg.content.toString());
    // Optionally validate order event here
    // ...
    // Could auto-initiate payment, but for demo, just log
    console.log('Received order_created event:', order);
    // Optionally auto-create payment here
    channel.ack(msg);
  });
}
connectRabbit();

app.post('/payments', async (req, res) => {
  const payment = req.body;
  const { valid, errors } = validateEvent('payment_completed', { ...payment, status: 'success' });
  if (!valid) {
    console.error('Payment schema validation failed', errors);
    return res.status(400).json({ error: 'Invalid payment', details: errors });
  }
  try {
    await payments.insertOne({ ...payment, status: 'success' });
    channel.publish('events', 'payment_completed', Buffer.from(JSON.stringify({ ...payment, status: 'success' })));
    res.json({ status: 'Payment processed', payment: { ...payment, status: 'success' } });
  } catch (err) {
    console.error('Mongo error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`Payments Service running on ${port}`));
