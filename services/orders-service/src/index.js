require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const amqp = require("amqplib");

const {
  getProductDefinition,
  toCatalogEntry
} = require("../../../shared/governance/catalog");
const {
  canAccessProduct,
  getRequesterRole,
  validateOrderQuality
} = require("../../../shared/governance/policies");
const { validateArtifact } = require("../../../shared/governance/validator");

const app = express();
const productDefinition = getProductDefinition("orders_data_product");

const governanceState = {
  domain: "orders",
  publishedEvents: 0,
  publishedDataProducts: 0,
  rejectedRequests: 0,
  violations: []
};

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB
});

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

  // persist asynchronously, do not block request handling
  persistViolationToDb(v);
}

async function connectRabbitWithRetry(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertExchange("events", "topic", { durable: true });
      return;
    } catch (error) {
      console.error(`RabbitMQ connection attempt ${attempt} failed`, error.message);
      await sleep(1000);
    }
  }

  throw new Error("Could not connect to RabbitMQ");
}

async function initDb() {
  try {
    console.log("Initializing database tables...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(50) PRIMARY KEY,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        customer VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    console.log("✅ orders table ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders_data_product (
        order_id VARCHAR(50) PRIMARY KEY,
        customer VARCHAR(100) NOT NULL,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        order_status VARCHAR(20) NOT NULL,
        source_updated_at TIMESTAMPTZ NOT NULL,
        published_at TIMESTAMPTZ NOT NULL
      )
    `);

    console.log("✅ orders_data_product table ready");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS violations (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    console.log("✅ violations table ready");

    console.log("Database initialization completed successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);

    // optional: rethrow so app crashes instead of running in bad state
    throw error;
  }
}

async function getLatestPublishedAt() {
  const result = await pool.query(
    "SELECT MAX(published_at) AS latest FROM orders_data_product"
  );

  return result.rows[0].latest
    ? new Date(result.rows[0].latest).toISOString()
    : null;
}

async function getCatalogEntry() {
  return toCatalogEntry(productDefinition, {
    lastUpdatedAt: await getLatestPublishedAt()
  });
}

async function persistViolationToDb(v) {
  try {
    await pool.query(
      `INSERT INTO violations (type, message, details, created_at) VALUES ($1, $2, $3, $4)`,
      [v.type, v.message, v.details || null, v.at]
    );
  } catch (err) {
    console.error('Failed to persist violation to DB', err.message || err);
  }
}

async function listProductRecords() {
  const result = await pool.query(`
    SELECT order_id, customer, amount, order_status, source_updated_at, published_at
    FROM orders_data_product
    ORDER BY published_at DESC
  `);

  return result.rows.map((row) => ({
    orderId: row.order_id,
    customer: row.customer,
    amount: Number(row.amount),
    orderStatus: row.order_status,
    sourceUpdatedAt: new Date(row.source_updated_at).toISOString(),
    publishedAt: new Date(row.published_at).toISOString()
  }));
}

function requireProductAccess(req, res) {
  const role = getRequesterRole(req.headers);

  if (!canAccessProduct(productDefinition, role)) {
    addViolation("access", `Role ${role} cannot access orders data product.`, {
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
  const product = await getCatalogEntry();
  res.json({
    service: "orders-service",
    status: "ok",
    dataProduct: product
  });
});

app.get("/data-products", async (req, res) => {
  res.json([await getCatalogEntry()]);
});

app.get("/data-products/orders", async (req, res) => {
  const role = requireProductAccess(req, res);

  if (!role) {
    return;
  }

  res.json({
    product: await getCatalogEntry(),
    accessedBy: role,
    records: await listProductRecords()
  });
});

app.get("/governance/status", async (req, res) => {
  res.json({
    service: "orders-service",
    domain: "orders",
    rules: {
      contract: "order_created.v1 -> orders_data_product.v1",
      ownership: productDefinition.owner,
      freshnessMs: productDefinition.defaultFreshnessMs,
      allowedRoles: productDefinition.allowedRoles
    },
    counters: {
      publishedEvents: governanceState.publishedEvents,
      publishedDataProducts: governanceState.publishedDataProducts,
      rejectedRequests: governanceState.rejectedRequests
    },
    product: await getCatalogEntry(),
    recentViolations: governanceState.violations
  });
});

app.post("/orders", async (req, res) => {
  const order = {
    orderId: typeof req.body.orderId === "string" ? req.body.orderId.trim() : "",
    amount: Number(req.body.amount),
    customer: typeof req.body.customer === "string" ? req.body.customer.trim() : ""
  };

  const contractValidation = validateArtifact("order_created", order);

  if (!contractValidation.valid) {
    governanceState.rejectedRequests += 1;
    addViolation("contract", "Order event contract validation failed.", {
      errors: contractValidation.errors
    });
    return res.status(400).json({
      error: "Invalid order payload",
      details: contractValidation.errors
    });
  }

  const qualityErrors = validateOrderQuality(order);

  if (qualityErrors.length > 0) {
    governanceState.rejectedRequests += 1;
    addViolation("quality", "Order quality checks failed.", {
      errors: qualityErrors
    });
    return res.status(400).json({
      error: "Order quality checks failed",
      details: qualityErrors
    });
  }

  const now = new Date().toISOString();
  const dataProductPayload = {
    orderId: order.orderId,
    customer: order.customer,
    amount: order.amount,
    orderStatus: "created",
    sourceUpdatedAt: now,
    publishedAt: now
  };

  const productValidation = validateArtifact(
    "orders_data_product",
    dataProductPayload
  );

  if (!productValidation.valid) {
    governanceState.rejectedRequests += 1;
    addViolation("contract", "Orders data product contract validation failed.", {
      errors: productValidation.errors
    });
    return res.status(500).json({
      error: "Orders data product contract failed",
      details: productValidation.errors
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO orders(order_id, amount, customer, created_at)
        VALUES ($1, $2, $3, $4)
      `,
      [order.orderId, order.amount, order.customer, now]
    );
    await client.query(
      `
        INSERT INTO orders_data_product(
          order_id,
          customer,
          amount,
          order_status,
          source_updated_at,
          published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (order_id) DO UPDATE
        SET customer = EXCLUDED.customer,
            amount = EXCLUDED.amount,
            order_status = EXCLUDED.order_status,
            source_updated_at = EXCLUDED.source_updated_at,
            published_at = EXCLUDED.published_at
      `,
      [
        dataProductPayload.orderId,
        dataProductPayload.customer,
        dataProductPayload.amount,
        dataProductPayload.orderStatus,
        dataProductPayload.sourceUpdatedAt,
        dataProductPayload.publishedAt
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      governanceState.rejectedRequests += 1;
      addViolation("quality", "Duplicate order identifier rejected.", {
        orderId: order.orderId
      });
      return res.status(409).json({ error: "Order already exists" });
    }

    console.error("Orders DB error", error);
    return res.status(500).json({ error: "DB error" });
  } finally {
    client.release();
  }

  channel.publish(
    "events",
    "order_created",
    Buffer.from(JSON.stringify(order)),
    { persistent: true }
  );
  channel.publish(
    "events",
    "data_product.orders.v1",
    Buffer.from(JSON.stringify(dataProductPayload)),
    { persistent: true }
  );

  governanceState.publishedEvents += 1;
  governanceState.publishedDataProducts += 1;

  res.status(201).json({
    status: "Order created",
    order,
    publishedDataProduct: "orders_data_product"
  });
});

async function start() {
  await initDb();
  await connectRabbitWithRetry();

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`Orders Service running on ${port}`);
  });
}

start().catch((error) => {
  console.error("Orders service failed to start", error);
  process.exit(1);
});
