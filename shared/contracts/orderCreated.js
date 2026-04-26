module.exports = {
  $id: "order_created.v1",
  type: "object",
  additionalProperties: false,
  required: ["orderId", "amount", "customer"],
  properties: {
    orderId: { type: "string", minLength: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    customer: { type: "string", minLength: 1 }
  }
};
