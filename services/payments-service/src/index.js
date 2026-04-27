require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");
const amqp = require("amqplib");

const {
  getProductDefinition,
  toCatalogEntry
} = require("../../../shared/governance/catalog");
const {
  canAccessProduct,
  getRequesterRole,
  validatePaymentQuality
} = require("../../../shared/governance/policies");
const { validateArtifact } = require("../../../shared/governance/validator");

const app = express();
const productDefinition = getProductDefinition("payments_data_product");

const governanceState = {
  domain: "payments",
  knownOrdersTracked: 0,
  consumedOrderEvents: 0,
  publishedEvents: 0,
  publishedDataProducts: 0,
  rejectedRequests: 0,
  violations: []
};

const knownOrders = new Map();

let mongoClient;
let paymentsCollection;
let paymentsDataProductCollection;
let violationsCollection;
let channel;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Data-Role");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addViolation(type, message, details = {}) {
  const v = {
    type,
    message,
    details,
    at: new Date().toISOString()
  };

  governanceState.violations.unshift(v);
  governanceState.violations = governanceState.violations.slice(0, 20);

  // persist asynchronously
  persistViolationToDb(v);
}

async function connectMongoWithRetry(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      mongoClient = new MongoClient(process.env.MONGO_URI);
      await mongoClient.connect();
      const db = mongoClient.db();
      paymentsCollection = db.collection("payments");
      paymentsDataProductCollection = db.collection("payments_data_product");
      violationsCollection = db.collection("violations");

      await paymentsCollection.createIndex({ orderId: 1 }, { unique: true });
      await paymentsDataProductCollection.createIndex(
        { orderId: 1 },
        { unique: true }
      );
      await violationsCollection.createIndex({ createdAt: 1 });
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt} failed`, error.message);
      await sleep(1000);
    }
  }

  throw new Error("Could not connect to MongoDB");
}

async function getLatestPublishedAt() {
  const latest = await paymentsDataProductCollection
    .find({})
    .sort({ publishedAt: -1 })
    .limit(1)
    .toArray();

  return latest[0] ? latest[0].publishedAt : null;
}

async function getCatalogEntry() {
  return toCatalogEntry(productDefinition, {
    lastUpdatedAt: await getLatestPublishedAt()
  });
}

async function persistViolationToDb(v) {
  try {
    if (!violationsCollection) {
      const db = mongoClient.db();
      violationsCollection = db.collection('violations');
    }

    await violationsCollection.insertOne({
      type: v.type,
      message: v.message,
      details: v.details || null,
      createdAt: v.at
    });
  } catch (err) {
    console.error('Failed to persist violation to MongoDB', err.message || err);
  }
}

async function connectRabbitWithRetry(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertExchange("events", "topic", { durable: true });
      await channel.assertQueue("payments-order-created", { durable: true });
      await channel.bindQueue("payments-order-created", "events", "order_created");

      await channel.consume("payments-order-created", async (message) => {
        if (!message) {
          return;
        }

        try {
          const order = JSON.parse(message.content.toString());
          const validation = validateArtifact("order_created", order);

          if (!validation.valid) {
            addViolation("contract", "Consumed invalid order_created event.", {
              errors: validation.errors
            });
            channel.ack(message);
            return;
          }

          knownOrders.set(order.orderId, order);
          governanceState.knownOrdersTracked = knownOrders.size;
          governanceState.consumedOrderEvents += 1;
          channel.ack(message);
        } catch (error) {
          addViolation("runtime", "Failed to consume order_created event.", {
            error: error.message
          });
          channel.ack(message);
        }
      });

      return;
    } catch (error) {
      console.error(`RabbitMQ connection attempt ${attempt} failed`, error.message);
      await sleep(1000);
    }
  }

  throw new Error("Could not connect to RabbitMQ");
}

function requireProductAccess(req, res) {
  const role = getRequesterRole(req.headers);

  if (!canAccessProduct(productDefinition, role)) {
    addViolation("access", `Role ${role} cannot access payments data product.`, {
      path: req.path,
      role
    });
    res.status(403).json({
      error: "Access denied",
      requiredRoles: productDefinition.allowedRoles
    });
    return null;
  }

  return role;
}

app.get("/health", async (req, res) => {
  res.json({
    service: "payments-service",
    status: "ok",
    dataProduct: await getCatalogEntry()
  });
});

app.get("/data-products", async (req, res) => {
  res.json([await getCatalogEntry()]);
});

app.get("/data-products/payments", async (req, res) => {
  const role = requireProductAccess(req, res);

  if (!role) {
    return;
  }

  const records = await paymentsDataProductCollection
    .find({})
    .sort({ publishedAt: -1 })
    .toArray();

  res.json({
    product: await getCatalogEntry(),
    accessedBy: role,
    records
  });
});

app.get("/governance/status", async (req, res) => {
  res.json({
    service: "payments-service",
    domain: "payments",
    rules: {
      contract: "payment_completed.v1 -> payments_data_product.v1",
      ownership: productDefinition.owner,
      freshnessMs: productDefinition.defaultFreshnessMs,
      allowedRoles: productDefinition.allowedRoles
    },
    counters: {
      knownOrdersTracked: governanceState.knownOrdersTracked,
      consumedOrderEvents: governanceState.consumedOrderEvents,
      publishedEvents: governanceState.publishedEvents,
      publishedDataProducts: governanceState.publishedDataProducts,
      rejectedRequests: governanceState.rejectedRequests
    },
    product: await getCatalogEntry(),
    recentViolations: governanceState.violations
  });
});

app.post("/payments", async (req, res) => {
  const payment = {
    orderId: typeof req.body.orderId === "string" ? req.body.orderId.trim() : "",
    amount: Number(req.body.amount),
    paymentMethod:
      typeof req.body.paymentMethod === "string"
        ? req.body.paymentMethod.trim()
        : "",
    status: "success"
  };

  const contractValidation = validateArtifact("payment_completed", payment);

  if (!contractValidation.valid) {
    governanceState.rejectedRequests += 1;
    addViolation("contract", "Payment event contract validation failed.", {
      errors: contractValidation.errors
    });
    return res.status(400).json({
      error: "Invalid payment payload",
      details: contractValidation.errors
    });
  }

  const knownOrder = knownOrders.get(payment.orderId);
  const qualityErrors = validatePaymentQuality(payment, { knownOrder });

  if (qualityErrors.length > 0) {
    governanceState.rejectedRequests += 1;
    addViolation("quality", "Payment quality checks failed.", {
      errors: qualityErrors
    });
    return res.status(400).json({
      error: "Payment quality checks failed",
      details: qualityErrors
    });
  }

  const now = new Date().toISOString();
  const dataProductPayload = {
    orderId: payment.orderId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    sourceUpdatedAt: now,
    publishedAt: now
  };

  const productValidation = validateArtifact(
    "payments_data_product",
    dataProductPayload
  );

  if (!productValidation.valid) {
    governanceState.rejectedRequests += 1;
    addViolation("contract", "Payments data product contract validation failed.", {
      errors: productValidation.errors
    });
    return res.status(500).json({
      error: "Payments data product contract failed",
      details: productValidation.errors
    });
  }

  try {
    await paymentsCollection.updateOne(
      { orderId: payment.orderId },
      {
        $set: {
          ...payment,
          sourceUpdatedAt: now
        }
      },
      { upsert: true }
    );

    await paymentsDataProductCollection.updateOne(
      { orderId: dataProductPayload.orderId },
      { $set: dataProductPayload },
      { upsert: true }
    );
  } catch (error) {
    console.error("MongoDB error", error);
    return res.status(500).json({ error: "DB error" });
  }

  channel.publish(
    "events",
    "payment_completed",
    Buffer.from(JSON.stringify(payment)),
    { persistent: true }
  );
  channel.publish(
    "events",
    "data_product.payments.v1",
    Buffer.from(JSON.stringify(dataProductPayload)),
    { persistent: true }
  );

  governanceState.publishedEvents += 1;
  governanceState.publishedDataProducts += 1;

  res.status(201).json({
    status: "Payment processed",
    payment,
    publishedDataProduct: "payments_data_product"
  });
});

async function start() {
  await connectMongoWithRetry();
  await connectRabbitWithRetry();

  const port = Number(process.env.PORT || 3002);
  app.listen(port, () => {
    console.log(`Payments Service running on ${port}`);
  });
}

start().catch((error) => {
  console.error("Payments service failed to start", error);
  process.exit(1);
});
