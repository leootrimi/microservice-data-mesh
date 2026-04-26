module.exports = {
  $id: "orders_data_product.v1",
  type: "object",
  additionalProperties: false,
  required: [
    "orderId",
    "customer",
    "amount",
    "orderStatus",
    "sourceUpdatedAt",
    "publishedAt"
  ],
  properties: {
    orderId: { type: "string", minLength: 1 },
    customer: { type: "string", minLength: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    orderStatus: { type: "string", enum: ["created"] },
    sourceUpdatedAt: { type: "string", minLength: 1 },
    publishedAt: { type: "string", minLength: 1 }
  }
};
