const BI_HEADERS = {
  "Content-Type": "application/json",
  "X-Data-Role": "bi_reader"
};

const BASE_URLS = {
  orders: "http://localhost:3001",
  payments: "http://localhost:3002",
  analytics: "http://localhost:3003"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(method, url, options = {}) {
  const response = await fetch(url, {
    method,
    headers: options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const rawBody = await response.text();

  let parsedBody = rawBody;

  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch (error) {
    parsedBody = rawBody;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody
  };
}

async function waitFor(checkFn, description, timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();

    if (result) {
      return result;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

async function main() {
  const orderId = `demo-${Date.now()}`;
  const orderAmount = 100;

  console.log("1) Checking that raw data products are protected by access rules...");
  const unauthorizedAccess = await request(
    "GET",
    `${BASE_URLS.orders}/data-products/orders`
  );
  assert(
    unauthorizedAccess.status === 403,
    `Expected 403 for unauthorized data product access, got ${unauthorizedAccess.status}.`
  );

  console.log("2) Creating a valid order in the Orders domain...");
  const createOrderResponse = await request("POST", `${BASE_URLS.orders}/orders`, {
    headers: BI_HEADERS,
    body: {
      orderId,
      amount: orderAmount,
      customer: "Alice"
    }
  });
  assert(
    createOrderResponse.status === 201,
    `Expected order creation to succeed, got ${createOrderResponse.status}.`
  );

  console.log("3) Waiting for Payments to receive the governed order event...");
  await waitFor(async () => {
    const governanceStatus = await request(
      "GET",
      `${BASE_URLS.payments}/governance/status`
    );
    return governanceStatus.body?.counters?.knownOrdersTracked > 0;
  }, "Payments service to track the new order");

  console.log("4) Sending an invalid payment to prove data quality enforcement...");
  const invalidPaymentResponse = await request(
    "POST",
    `${BASE_URLS.payments}/payments`,
    {
      headers: BI_HEADERS,
      body: {
        orderId,
        amount: 999,
        paymentMethod: "card"
      }
    }
  );
  assert(
    invalidPaymentResponse.status === 400,
    `Expected invalid payment to be rejected, got ${invalidPaymentResponse.status}.`
  );

  console.log("5) Sending the valid payment...");
  const validPaymentResponse = await request(
    "POST",
    `${BASE_URLS.payments}/payments`,
    {
      headers: BI_HEADERS,
      body: {
        orderId,
        amount: orderAmount,
        paymentMethod: "card"
      }
    }
  );
  assert(
    validPaymentResponse.status === 201,
    `Expected valid payment to succeed, got ${validPaymentResponse.status}.`
  );

  console.log("6) Waiting for the analytics summary to materialize from data products...");
  const summaryResponse = await waitFor(async () => {
    const result = await request(
      "GET",
      `${BASE_URLS.analytics}/analytics/summary`,
      { headers: BI_HEADERS }
    );

    const matchingOrder = result.body?.orders?.find(
      (order) => order.orderId === orderId && order.paymentStatus === "success"
    );

    return result.status === 200 && matchingOrder ? result : null;
  }, "Analytics summary to include the processed order");

  console.log("7) Verifying the central data product catalog...");
  const catalogResponse = await request("GET", `${BASE_URLS.analytics}/data-products`);
  assert(
    catalogResponse.status === 200 && Array.isArray(catalogResponse.body),
    "Expected analytics data product catalog to be available."
  );
  assert(
    catalogResponse.body.length === 3,
    `Expected 3 governed data products, got ${catalogResponse.body.length}.`
  );
  assert(
    catalogResponse.body.every(
      (product) => product.owner && product.schemaContract && product.outputPort
    ),
    "Each data product should expose owner, contract, and output port metadata."
  );

  console.log("8) Checking governance reports and proof signals...");
  const paymentsGovernance = await request(
    "GET",
    `${BASE_URLS.payments}/governance/status`
  );
  const analyticsReportFresh = await request(
    "GET",
    `${BASE_URLS.analytics}/governance/report`
  );

  assert(
    JSON.stringify(paymentsGovernance.body?.recentViolations || []).includes(
      "does not match order amount"
    ),
    "Expected a recorded governance violation for the invalid payment."
  );

  const freshProducts = (analyticsReportFresh.body?.dataProducts || []).filter(
    (product) => product.freshness?.status === "fresh"
  );
  assert(
    freshProducts.length === 3,
    `Expected all 3 products to be fresh after the successful flow, got ${freshProducts.length}.`
  );

  console.log("9) Waiting for freshness SLA expiry to prove stale-data detection...");
  await sleep(9000);

  const analyticsReportStale = await request(
    "GET",
    `${BASE_URLS.analytics}/governance/report`
  );
  const staleProducts = (analyticsReportStale.body?.dataProducts || []).filter(
    (product) => product.freshness?.status === "stale"
  );
  assert(
    staleProducts.length >= 1,
    "Expected at least one data product to become stale after the freshness window."
  );

  console.log("");
  console.log("Verification passed.");
  console.log(
    JSON.stringify(
      {
        orderId,
        totalRevenue: summaryResponse.body.totalRevenue,
        catalogProducts: catalogResponse.body.map((product) => product.key),
        freshProducts: freshProducts.map((product) => product.key),
        staleProducts: staleProducts.map((product) => product.key)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Verification failed.");
  console.error(error.message);
  process.exit(1);
});
