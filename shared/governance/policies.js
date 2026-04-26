const ALLOWED_PAYMENT_METHODS = ["card", "cash", "transfer"];

function getRequesterRole(headers = {}) {
  const rawRole = headers["x-data-role"] || headers["X-Data-Role"] || "anonymous";
  return String(Array.isArray(rawRole) ? rawRole[0] : rawRole).trim() || "anonymous";
}

function canAccessProduct(definition, role) {
  return Boolean(definition && definition.allowedRoles.includes(role));
}

function evaluateFreshness(lastUpdatedAt, freshnessMs, now = Date.now()) {
  if (!lastUpdatedAt) {
    return {
      status: "no_data",
      freshnessMs,
      ageMs: null,
      lastUpdatedAt: null
    };
  }

  const ageMs = Math.max(0, now - new Date(lastUpdatedAt).getTime());

  return {
    status: ageMs <= freshnessMs ? "fresh" : "stale",
    freshnessMs,
    ageMs,
    lastUpdatedAt
  };
}

function validateOrderQuality(order) {
  const errors = [];

  if (!Number.isFinite(order.amount) || order.amount <= 0) {
    errors.push("Order amount must be greater than 0.");
  }

  if (typeof order.customer !== "string" || !order.customer.trim()) {
    errors.push("Customer is required.");
  }

  return errors;
}

function validatePaymentQuality(payment, context = {}) {
  const errors = [];
  const { knownOrder } = context;

  if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
    errors.push("Payment amount must be greater than 0.");
  }

  if (!ALLOWED_PAYMENT_METHODS.includes(payment.paymentMethod)) {
    errors.push("Payment method must be card, cash, or transfer.");
  }

  if (!["success", "failed"].includes(payment.status)) {
    errors.push("Payment status must be success or failed.");
  }

  if (!knownOrder) {
    errors.push("Payment references an unknown order.");
    return errors;
  }

  if (Number(knownOrder.amount) !== Number(payment.amount)) {
    errors.push(
      `Payment amount ${payment.amount} does not match order amount ${knownOrder.amount}.`
    );
  }

  return errors;
}

function validateBusinessSummaryQuality(summary) {
  const errors = [];
  const recalculatedRevenue = summary.orders.reduce((sum, order) => {
    return order.paymentStatus === "success" ? sum + Number(order.paidAmount) : sum;
  }, 0);
  const recalculatedFailedPayments = summary.orders.filter(
    (order) => order.paymentStatus === "failed"
  ).length;
  const recalculatedPendingOrders = summary.orders.filter(
    (order) => order.paymentStatus === "pending"
  ).length;

  if (Number(summary.totalRevenue) !== recalculatedRevenue) {
    errors.push("Business summary revenue does not match successful payment totals.");
  }

  if (summary.failedPayments !== recalculatedFailedPayments) {
    errors.push("Business summary failedPayments does not match order-level statuses.");
  }

  if (summary.pendingOrders !== recalculatedPendingOrders) {
    errors.push("Business summary pendingOrders does not match order-level statuses.");
  }

  return errors;
}

module.exports = {
  ALLOWED_PAYMENT_METHODS,
  canAccessProduct,
  evaluateFreshness,
  getRequesterRole,
  validateBusinessSummaryQuality,
  validateOrderQuality,
  validatePaymentQuality
};
