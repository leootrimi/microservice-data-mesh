const { evaluateFreshness } = require("./policies");

const productDefinitions = {
  orders_data_product: {
    key: "orders_data_product",
    name: "Orders Data Product",
    domain: "orders",
    owner: "orders-domain-team",
    version: "1.0.0",
    description: "Curated order facts published by the Orders domain for BI use.",
    schemaContract: "orders_data_product",
    freshnessEnv: "ORDERS_PRODUCT_FRESHNESS_MS",
    defaultFreshnessMs: 8000,
    allowedRoles: ["bi_reader", "governance_admin", "orders_owner"],
    outputPort: {
      transport: "rabbitmq+http",
      topic: "data_product.orders.v1",
      endpoint: "/data-products/orders"
    },
    inputPorts: [],
    qualityChecks: [
      "Strict contract validation",
      "Positive order amount",
      "Non-empty customer"
    ]
  },
  payments_data_product: {
    key: "payments_data_product",
    name: "Payments Data Product",
    domain: "payments",
    owner: "payments-domain-team",
    version: "1.0.0",
    description: "Curated payment facts owned by the Payments domain.",
    schemaContract: "payments_data_product",
    freshnessEnv: "PAYMENTS_PRODUCT_FRESHNESS_MS",
    defaultFreshnessMs: 8000,
    allowedRoles: ["bi_reader", "governance_admin", "payments_owner"],
    outputPort: {
      transport: "rabbitmq+http",
      topic: "data_product.payments.v1",
      endpoint: "/data-products/payments"
    },
    inputPorts: ["order_created"],
    qualityChecks: [
      "Strict contract validation",
      "Amount must match source order",
      "Allowed payment methods only"
    ]
  },
  business_summary: {
    key: "business_summary",
    name: "Business Summary",
    domain: "analytics",
    owner: "analytics-domain-team",
    version: "1.0.0",
    description: "A BI-ready summary built only from governed domain data products.",
    schemaContract: "business_summary",
    freshnessEnv: "BUSINESS_SUMMARY_FRESHNESS_MS",
    defaultFreshnessMs: 8000,
    allowedRoles: ["bi_reader", "governance_admin", "analytics_owner"],
    outputPort: {
      transport: "http",
      endpoint: "/analytics/summary"
    },
    inputPorts: ["data_product.orders.v1", "data_product.payments.v1"],
    qualityChecks: [
      "Revenue equals successful payments",
      "Pending and failed counts align with product rows",
      "No reads from operational databases"
    ]
  }
};

function getProductDefinition(productKey) {
  return productDefinitions[productKey];
}

function listProductDefinitions(productKeys = Object.keys(productDefinitions)) {
  return productKeys.map((productKey) => productDefinitions[productKey]).filter(Boolean);
}

function getFreshnessMs(definition) {
  const rawValue = process.env[definition.freshnessEnv];
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : definition.defaultFreshnessMs;
}

function toCatalogEntry(definition, runtime = {}) {
  const freshnessMs = getFreshnessMs(definition);
  const freshness = evaluateFreshness(runtime.lastUpdatedAt, freshnessMs);

  return {
    key: definition.key,
    name: definition.name,
    domain: definition.domain,
    owner: definition.owner,
    version: definition.version,
    description: definition.description,
    schemaContract: definition.schemaContract,
    allowedRoles: definition.allowedRoles,
    outputPort: definition.outputPort,
    inputPorts: definition.inputPorts,
    qualityChecks: definition.qualityChecks,
    lastUpdatedAt: freshness.lastUpdatedAt,
    freshness
  };
}

module.exports = {
  getFreshnessMs,
  getProductDefinition,
  listProductDefinitions,
  productDefinitions,
  toCatalogEntry
};
