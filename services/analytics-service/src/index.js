require("dotenv").config();

const express = require("express");
const amqp = require("amqplib");

const {
  getProductDefinition,
  listProductDefinitions,
  toCatalogEntry
} = require("../../../shared/governance/catalog");
const {
  canAccessProduct,
  getRequesterRole,
  validateBusinessSummaryQuality
} = require("../../../shared/governance/policies");
const { validateArtifact } = require("../../../shared/governance/validator");

const app = express();
const businessSummaryDefinition = getProductDefinition("business_summary");

const ordersStore = new Map();
const paymentsStore = new Map();

const governanceState = {
  service: "analytics-service",
  dataMeshMode: "data-products-only",
  ingestedOrdersProducts: 0,
  ingestedPaymentsProducts: 0,
  rejectedMessages: 0,
  lastUpdatedAtByProduct: {
    orders_data_product: null,
    payments_data_product: null,
    business_summary: null
  },
  violations: []
};

const summaryState = {
  totalRevenue: 0,
  failedPayments: 0,
  pendingOrders: 0,
  generatedAt: null,
  orders: []
};

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
  governanceState.violations.unshift({
    type,
    message,
    details,
    at: new Date().toISOString()
  });
  governanceState.violations = governanceState.violations.slice(0, 20);
}

function recomputeSummary() {
  const joinedOrders = Array.from(ordersStore.values())
    .map((order) => {
      const payment = paymentsStore.get(order.orderId);

      return {
        orderId: order.orderId,
        customer: order.customer,
        orderAmount: Number(order.amount),
        paymentStatus: payment ? payment.status : "pending",
        paidAmount: payment ? Number(payment.amount) : 0
      };
    })
    .sort((left, right) => left.orderId.localeCompare(right.orderId));

  const nextSummary = {
    totalRevenue: joinedOrders.reduce((sum, order) => {
      return order.paymentStatus === "success"
        ? sum + Number(order.paidAmount)
        : sum;
    }, 0),
    failedPayments: joinedOrders.filter(
      (order) => order.paymentStatus === "failed"
    ).length,
    pendingOrders: joinedOrders.filter(
      (order) => order.paymentStatus === "pending"
    ).length,
    generatedAt: new Date().toISOString(),
    orders: joinedOrders
  };

  const contractValidation = validateArtifact("business_summary", nextSummary);
  const qualityErrors = validateBusinessSummaryQuality(nextSummary);

  if (!contractValidation.valid || qualityErrors.length > 0) {
    governanceState.rejectedMessages += 1;
    addViolation(
      "quality",
      "Business summary failed governance checks and was not refreshed.",
      {
        contractErrors: contractValidation.errors,
        qualityErrors
      }
    );
    return;
  }

  summaryState.totalRevenue = nextSummary.totalRevenue;
  summaryState.failedPayments = nextSummary.failedPayments;
  summaryState.pendingOrders = nextSummary.pendingOrders;
  summaryState.generatedAt = nextSummary.generatedAt;
  summaryState.orders = nextSummary.orders;
  governanceState.lastUpdatedAtByProduct.business_summary = nextSummary.generatedAt;
}

async function connectRabbitWithRetry(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertExchange("events", "topic", { durable: true });

      await channel.assertQueue("analytics-orders-product", { durable: true });
      await channel.bindQueue(
        "analytics-orders-product",
        "events",
        "data_product.orders.v1"
      );

      await channel.assertQueue("analytics-payments-product", { durable: true });
      await channel.bindQueue(
        "analytics-payments-product",
        "events",
        "data_product.payments.v1"
      );

      await channel.consume("analytics-orders-product", async (message) => {
        if (!message) {
          return;
        }

        try {
          const payload = JSON.parse(message.content.toString());
          const validation = validateArtifact("orders_data_product", payload);

          if (!validation.valid) {
            governanceState.rejectedMessages += 1;
            addViolation("contract", "Rejected invalid orders data product.", {
              errors: validation.errors
            });
            channel.ack(message);
            return;
          }

          ordersStore.set(payload.orderId, {
            ...payload,
            amount: Number(payload.amount)
          });
          governanceState.ingestedOrdersProducts += 1;
          governanceState.lastUpdatedAtByProduct.orders_data_product =
            payload.publishedAt;
          recomputeSummary();
          channel.ack(message);
        } catch (error) {
          governanceState.rejectedMessages += 1;
          addViolation("runtime", "Failed to ingest orders data product.", {
            error: error.message
          });
          channel.ack(message);
        }
      });

      await channel.consume("analytics-payments-product", async (message) => {
        if (!message) {
          return;
        }

        try {
          const payload = JSON.parse(message.content.toString());
          const validation = validateArtifact("payments_data_product", payload);

          if (!validation.valid) {
            governanceState.rejectedMessages += 1;
            addViolation("contract", "Rejected invalid payments data product.", {
              errors: validation.errors
            });
            channel.ack(message);
            return;
          }

          paymentsStore.set(payload.orderId, {
            ...payload,
            amount: Number(payload.amount)
          });
          governanceState.ingestedPaymentsProducts += 1;
          governanceState.lastUpdatedAtByProduct.payments_data_product =
            payload.publishedAt;
          recomputeSummary();
          channel.ack(message);
        } catch (error) {
          governanceState.rejectedMessages += 1;
          addViolation("runtime", "Failed to ingest payments data product.", {
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

function requireSummaryAccess(req, res) {
  const role = getRequesterRole(req.headers);

  if (!canAccessProduct(businessSummaryDefinition, role)) {
    addViolation("access", `Role ${role} cannot access business summary.`, {
      path: req.path,
      role
    });
    res.status(403).json({
      error: "Access denied",
      requiredRoles: businessSummaryDefinition.allowedRoles
    });
    return null;
  }

  return role;
}

function buildCatalog() {
  return listProductDefinitions().map((definition) =>
    toCatalogEntry(definition, {
      lastUpdatedAt: governanceState.lastUpdatedAtByProduct[definition.key]
    })
  );
}

app.get("/health", (req, res) => {
  res.json({
    service: "analytics-service",
    status: "ok",
    mode: governanceState.dataMeshMode
  });
});

app.get("/analytics/summary", (req, res) => {
  const role = requireSummaryAccess(req, res);

  if (!role) {
    return;
  }

  res.json({
    ...summaryState,
    accessedBy: role,
    sourceProducts: ["orders_data_product", "payments_data_product"]
  });
});

app.get("/data-products", (req, res) => {
  res.json(buildCatalog());
});

app.get("/data-products/business-summary", (req, res) => {
  const role = requireSummaryAccess(req, res);

  if (!role) {
    return;
  }

  res.json({
    product: toCatalogEntry(businessSummaryDefinition, {
      lastUpdatedAt: governanceState.lastUpdatedAtByProduct.business_summary
    }),
    records: summaryState.orders,
    metrics: {
      totalRevenue: summaryState.totalRevenue,
      failedPayments: summaryState.failedPayments,
      pendingOrders: summaryState.pendingOrders
    }
  });
});

app.get("/governance/report", (req, res) => {
  res.json({
    thesisAlignment: {
      domainOwnership: true,
      dataAsAProduct: true,
      selfServiceConsumption: true,
      federatedComputationalGovernance: true,
      operationalDbReadsDisabled: true
    },
    ingestion: {
      ordersProducts: governanceState.ingestedOrdersProducts,
      paymentsProducts: governanceState.ingestedPaymentsProducts,
      rejectedMessages: governanceState.rejectedMessages
    },
    dataProducts: buildCatalog(),
    summary: {
      totalRevenue: summaryState.totalRevenue,
      failedPayments: summaryState.failedPayments,
      pendingOrders: summaryState.pendingOrders,
      generatedAt: summaryState.generatedAt
    },
    recentViolations: governanceState.violations
  });
});

async function start() {
  await connectRabbitWithRetry();

  const port = Number(process.env.PORT || 3003);
  app.listen(port, () => {
    console.log(`Analytics Service running on ${port}`);
  });
}

start().catch((error) => {
  console.error("Analytics service failed to start", error);
  process.exit(1);
});
