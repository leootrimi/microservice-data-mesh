const {
  getProductDefinition,
  listProductDefinitions,
  toCatalogEntry
} = require("../shared/governance/catalog");
const {
  canAccessProduct,
  evaluateFreshness,
  validateBusinessSummaryQuality,
  validateOrderQuality,
  validatePaymentQuality
} = require("../shared/governance/policies");
const { validateArtifact } = require("../shared/governance/validator");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function main() {
  const now = new Date().toISOString();

  runCheck("valid order contract passes", () => {
    const result = validateArtifact("order_created", {
      orderId: "o1",
      amount: 100,
      customer: "Alice"
    });
    assert(result.valid, "Expected valid order_created payload.");
  });

  runCheck("schema drift is rejected", () => {
    const result = validateArtifact("order_created", {
      orderId: "o1",
      amount: 100,
      customer: "Alice",
      unexpectedField: true
    });
    assert(!result.valid, "Expected additional fields to be rejected.");
  });

  runCheck("order quality rejects zero amount", () => {
    const errors = validateOrderQuality({
      orderId: "o1",
      amount: 0,
      customer: "Alice"
    });
    assert(errors.length > 0, "Expected zero amount to fail quality checks.");
  });

  runCheck("payment quality enforces amount match with source order", () => {
    const errors = validatePaymentQuality(
      {
        orderId: "o1",
        amount: 120,
        paymentMethod: "card",
        status: "success"
      },
      {
        knownOrder: { orderId: "o1", amount: 100 }
      }
    );
    assert(
      errors.some((error) => error.includes("does not match order amount")),
      "Expected mismatched payment amount to fail."
    );
  });

  runCheck("catalog exposes metadata for all data products", () => {
    const entries = listProductDefinitions().map((definition) =>
      toCatalogEntry(definition, { lastUpdatedAt: now })
    );
    assert(entries.length === 3, "Expected 3 data products in the catalog.");
    assert(
      entries.every((entry) => entry.owner && entry.schemaContract && entry.outputPort),
      "Expected owner, schemaContract, and outputPort in every catalog entry."
    );
  });

  runCheck("access rules allow BI reader on data products", () => {
    const ordersProduct = getProductDefinition("orders_data_product");
    const businessSummary = getProductDefinition("business_summary");
    assert(canAccessProduct(ordersProduct, "bi_reader"), "BI reader should access orders product.");
    assert(
      canAccessProduct(businessSummary, "bi_reader"),
      "BI reader should access business summary."
    );
    assert(
      !canAccessProduct(ordersProduct, "anonymous"),
      "Anonymous role should be rejected."
    );
  });

  runCheck("freshness reports stale products", () => {
    const fresh = evaluateFreshness(now, 8000, new Date(now).getTime() + 1000);
    const stale = evaluateFreshness(now, 8000, new Date(now).getTime() + 9000);
    assert(fresh.status === "fresh", "Expected fresh record within SLA.");
    assert(stale.status === "stale", "Expected stale record after SLA.");
  });

  runCheck("business summary contract and quality validation both pass", () => {
    const summary = {
      totalRevenue: 100,
      failedPayments: 0,
      pendingOrders: 0,
      generatedAt: now,
      orders: [
        {
          orderId: "o1",
          customer: "Alice",
          orderAmount: 100,
          paymentStatus: "success",
          paidAmount: 100
        }
      ]
    };
    const contract = validateArtifact("business_summary", summary);
    const qualityErrors = validateBusinessSummaryQuality(summary);
    assert(contract.valid, "Expected business summary contract to pass.");
    assert(qualityErrors.length === 0, "Expected business summary quality checks to pass.");
  });

  console.log("");
  console.log("Model verification passed.");
}

main();
