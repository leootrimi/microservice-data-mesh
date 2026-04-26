const schemas = {
  order_created: require("../contracts/orderCreated"),
  payment_completed: require("../contracts/paymentCompleted"),
  orders_data_product: require("../contracts/ordersDataProduct"),
  payments_data_product: require("../contracts/paymentsDataProduct"),
  business_summary: require("../contracts/businessSummary")
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushIf(errors, condition, message) {
  if (condition) {
    errors.push({ message });
  }
}

function validateNoAdditionalProperties(payload, allowedKeys, errors) {
  Object.keys(payload).forEach((key) => {
    if (!allowedKeys.includes(key)) {
      errors.push({ message: `Unexpected property: ${key}` });
    }
  });
}

function validateOrderCreated(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return [{ message: "Payload must be an object." }];
  }

  validateNoAdditionalProperties(payload, ["orderId", "amount", "customer"], errors);
  pushIf(errors, typeof payload.orderId !== "string" || !payload.orderId.trim(), "orderId must be a non-empty string.");
  pushIf(
    errors,
    typeof payload.amount !== "number" ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0,
    "amount must be a positive number."
  );
  pushIf(
    errors,
    typeof payload.customer !== "string" || !payload.customer.trim(),
    "customer must be a non-empty string."
  );

  return errors;
}

function validatePaymentCompleted(payload) {
  const errors = [];
  const allowedMethods = ["card", "cash", "transfer"];
  const allowedStatuses = ["success", "failed"];

  if (!isPlainObject(payload)) {
    return [{ message: "Payload must be an object." }];
  }

  validateNoAdditionalProperties(
    payload,
    ["orderId", "amount", "paymentMethod", "status"],
    errors
  );
  pushIf(errors, typeof payload.orderId !== "string" || !payload.orderId.trim(), "orderId must be a non-empty string.");
  pushIf(
    errors,
    typeof payload.amount !== "number" ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0,
    "amount must be a positive number."
  );
  pushIf(
    errors,
    !allowedMethods.includes(payload.paymentMethod),
    "paymentMethod must be card, cash, or transfer."
  );
  pushIf(
    errors,
    !allowedStatuses.includes(payload.status),
    "status must be success or failed."
  );

  return errors;
}

function validateOrdersDataProduct(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return [{ message: "Payload must be an object." }];
  }

  validateNoAdditionalProperties(
    payload,
    [
      "orderId",
      "customer",
      "amount",
      "orderStatus",
      "sourceUpdatedAt",
      "publishedAt"
    ],
    errors
  );
  pushIf(errors, typeof payload.orderId !== "string" || !payload.orderId.trim(), "orderId must be a non-empty string.");
  pushIf(
    errors,
    typeof payload.customer !== "string" || !payload.customer.trim(),
    "customer must be a non-empty string."
  );
  pushIf(
    errors,
    typeof payload.amount !== "number" ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0,
    "amount must be a positive number."
  );
  pushIf(
    errors,
    payload.orderStatus !== "created",
    "orderStatus must be created."
  );
  pushIf(
    errors,
    typeof payload.sourceUpdatedAt !== "string" || !payload.sourceUpdatedAt.trim(),
    "sourceUpdatedAt must be a non-empty string."
  );
  pushIf(
    errors,
    typeof payload.publishedAt !== "string" || !payload.publishedAt.trim(),
    "publishedAt must be a non-empty string."
  );

  return errors;
}

function validatePaymentsDataProduct(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return [{ message: "Payload must be an object." }];
  }

  validateNoAdditionalProperties(
    payload,
    [
      "orderId",
      "amount",
      "paymentMethod",
      "status",
      "sourceUpdatedAt",
      "publishedAt"
    ],
    errors
  );
  pushIf(errors, typeof payload.orderId !== "string" || !payload.orderId.trim(), "orderId must be a non-empty string.");
  pushIf(
    errors,
    typeof payload.amount !== "number" ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0,
    "amount must be a positive number."
  );
  pushIf(
    errors,
    !["card", "cash", "transfer"].includes(payload.paymentMethod),
    "paymentMethod must be card, cash, or transfer."
  );
  pushIf(
    errors,
    !["success", "failed"].includes(payload.status),
    "status must be success or failed."
  );
  pushIf(
    errors,
    typeof payload.sourceUpdatedAt !== "string" || !payload.sourceUpdatedAt.trim(),
    "sourceUpdatedAt must be a non-empty string."
  );
  pushIf(
    errors,
    typeof payload.publishedAt !== "string" || !payload.publishedAt.trim(),
    "publishedAt must be a non-empty string."
  );

  return errors;
}

function validateBusinessSummary(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return [{ message: "Payload must be an object." }];
  }

  validateNoAdditionalProperties(
    payload,
    ["totalRevenue", "failedPayments", "pendingOrders", "generatedAt", "orders"],
    errors
  );
  pushIf(
    errors,
    typeof payload.totalRevenue !== "number" ||
      !Number.isFinite(payload.totalRevenue) ||
      payload.totalRevenue < 0,
    "totalRevenue must be a non-negative number."
  );
  pushIf(
    errors,
    !Number.isInteger(payload.failedPayments) || payload.failedPayments < 0,
    "failedPayments must be a non-negative integer."
  );
  pushIf(
    errors,
    !Number.isInteger(payload.pendingOrders) || payload.pendingOrders < 0,
    "pendingOrders must be a non-negative integer."
  );
  pushIf(
    errors,
    typeof payload.generatedAt !== "string" || !payload.generatedAt.trim(),
    "generatedAt must be a non-empty string."
  );
  pushIf(errors, !Array.isArray(payload.orders), "orders must be an array.");

  if (!Array.isArray(payload.orders)) {
    return errors;
  }

  payload.orders.forEach((order, index) => {
    if (!isPlainObject(order)) {
      errors.push({ message: `orders[${index}] must be an object.` });
      return;
    }

    validateNoAdditionalProperties(
      order,
      ["orderId", "customer", "orderAmount", "paymentStatus", "paidAmount"],
      errors
    );
    pushIf(
      errors,
      typeof order.orderId !== "string" || !order.orderId.trim(),
      `orders[${index}].orderId must be a non-empty string.`
    );
    pushIf(
      errors,
      typeof order.customer !== "string" || !order.customer.trim(),
      `orders[${index}].customer must be a non-empty string.`
    );
    pushIf(
      errors,
      typeof order.orderAmount !== "number" ||
        !Number.isFinite(order.orderAmount) ||
        order.orderAmount < 0,
      `orders[${index}].orderAmount must be a non-negative number.`
    );
    pushIf(
      errors,
      !["success", "failed", "pending"].includes(order.paymentStatus),
      `orders[${index}].paymentStatus must be success, failed, or pending.`
    );
    pushIf(
      errors,
      typeof order.paidAmount !== "number" ||
        !Number.isFinite(order.paidAmount) ||
        order.paidAmount < 0,
      `orders[${index}].paidAmount must be a non-negative number.`
    );
  });

  return errors;
}

const validators = {
  order_created: validateOrderCreated,
  payment_completed: validatePaymentCompleted,
  orders_data_product: validateOrdersDataProduct,
  payments_data_product: validatePaymentsDataProduct,
  business_summary: validateBusinessSummary
};

function validateArtifact(artifactName, payload) {
  const validator = validators[artifactName];

  if (!validator) {
    return { valid: false, errors: [{ message: "Unknown contract" }] };
  }

  const errors = validator(payload);
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  schemas,
  validateArtifact,
  validateEvent: validateArtifact
};
