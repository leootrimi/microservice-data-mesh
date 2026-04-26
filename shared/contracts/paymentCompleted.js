// paymentCompleted contract schema
module.exports = {
  type: "object",
  required: ["orderId", "amount", "paymentMethod", "status"],
  properties: {
    orderId: { type: "string" },
    amount: { type: "number" },
    paymentMethod: { type: "string" },
    status: { type: "string", enum: ["success", "failed"] }
  }
};
