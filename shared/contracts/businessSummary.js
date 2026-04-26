module.exports = {
  $id: "business_summary.v1",
  type: "object",
  additionalProperties: false,
  required: [
    "totalRevenue",
    "failedPayments",
    "pendingOrders",
    "generatedAt",
    "orders"
  ],
  properties: {
    totalRevenue: { type: "number", minimum: 0 },
    failedPayments: { type: "integer", minimum: 0 },
    pendingOrders: { type: "integer", minimum: 0 },
    generatedAt: { type: "string", minLength: 1 },
    orders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "orderId",
          "customer",
          "orderAmount",
          "paymentStatus",
          "paidAmount"
        ],
        properties: {
          orderId: { type: "string", minLength: 1 },
          customer: { type: "string", minLength: 1 },
          orderAmount: { type: "number", minimum: 0 },
          paymentStatus: {
            type: "string",
            enum: ["success", "failed", "pending"]
          },
          paidAmount: { type: "number", minimum: 0 }
        }
      }
    }
  }
};
