// orderCreated contract schema
module.exports = {
  type: "object",
  required: ["orderId", "amount", "customer"],
  properties: {
    orderId: { type: "string" },
    amount: { type: "number" },
    customer: { type: "string" }
  }
};
