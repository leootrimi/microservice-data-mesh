# Data Mesh Microservices BI PoC

## Overview

A Proof-of-Concept Data Mesh-based Business Intelligence system using microservices, event-driven architecture, and a simple BI dashboard.

**Tech Stack:**
- Node.js (Express)
- PostgreSQL
- MongoDB
- RabbitMQ
- React (Vite)
- Docker Compose

## Architecture

- **Orders Service:** REST API, PostgreSQL, publishes `order_created` events
- **Payments Service:** REST API, MongoDB, subscribes to `order_created`, publishes `payment_completed`
- **Analytics Service:** Aggregates data, exposes BI API, provides data catalog
- **Governance Layer:** Validates events, enforces data contracts, logs errors
- **Frontend:** BI dashboard (React)

## Running the Project

```sh
docker-compose up --build
```

- Orders: http://localhost:3001
- Payments: http://localhost:3002
- Analytics: http://localhost:3003
- Frontend: http://localhost:8080
- RabbitMQ UI: http://localhost:15672 (guest/guest)

## Example API Requests

### Create Order
```sh
curl -X POST http://localhost:3001/orders -H "Content-Type: application/json" -d '{"orderId":"o1","amount":100,"customer":"Alice"}'
```

### Process Payment
```sh
curl -X POST http://localhost:3002/payments -H "Content-Type: application/json" -d '{"orderId":"o1","amount":100,"paymentMethod":"card"}'
```

### Get Analytics
```sh
curl http://localhost:3003/analytics/summary
```

### Get Data Products
```sh
curl http://localhost:3003/data-products
```

## Testing Scenarios

1. **Schema Change → Contract Validation Fails**
   - Change a field in `/shared/contracts/orderCreated.js` and restart a service. Invalid events will be rejected/logged.
2. **Invalid Data → Governance Logs Error**
   - Send a payment with wrong amount. Check logs for governance error.
3. **Events Flow**
   - Create order, process payment, check analytics for updates.
4. **Analytics Consistency**
   - Analytics API always reflects latest valid events.

## Environment Variables
- See `docker-compose.yml` for all service env vars.

## Notes
- No direct HTTP calls between services. All communication via RabbitMQ events.
- Governance and contracts are enforced on all events.
