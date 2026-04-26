module.exports = {
  $id: "payments_data_product.v1",
  type: "object",
  additionalProperties: false,
  required: [
    "orderId",
    "amount",
    "paymentMethod",
    "status",
    "sourceUpdatedAt",
    "publishedAt"
  ],
  properties: {
    orderId: { type: "string", minLength: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    paymentMethod: {
      type: "string",
      enum: ["card", "cash", "transfer"]
    },
    status: { type: "string", enum: ["success", "failed"] },
    sourceUpdatedAt: { type: "string", minLength: 1 },
    publishedAt: { type: "string", minLength: 1 }
  }
};
