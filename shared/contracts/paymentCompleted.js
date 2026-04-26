module.exports = {
  $id: "payment_completed.v1",
  type: "object",
  additionalProperties: false,
  required: ["orderId", "amount", "paymentMethod", "status"],
  properties: {
    orderId: { type: "string", minLength: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    paymentMethod: {
      type: "string",
      enum: ["card", "cash", "transfer"]
    },
    status: { type: "string", enum: ["success", "failed"] }
  }
};
