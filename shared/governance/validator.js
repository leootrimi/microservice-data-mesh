// Governance validator using AJV for JSON Schema
const Ajv = require("ajv");
const ajv = new Ajv();
const orderCreatedSchema = require("../contracts/orderCreated");
const paymentCompletedSchema = require("../contracts/paymentCompleted");

const schemas = {
  order_created: orderCreatedSchema,
  payment_completed: paymentCompletedSchema
};

function validateEvent(eventType, payload) {
  const schema = schemas[eventType];
  if (!schema) return { valid: false, errors: ["Unknown event type"] };
  const validate = ajv.compile(schema);
  const valid = validate(payload);
  return { valid, errors: validate.errors };
}

module.exports = { validateEvent };
