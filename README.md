# Data Mesh Governance for BI in Microservices

This repository is a proof-of-concept for the thesis topic:

**"Governance Model for Business Intelligence in Microservices-Based Systems using Data Mesh Principles"**

The project now demonstrates the important thesis points in code, not only in description:

- domain-oriented microservices
- separate operational databases
- domain-owned data products
- metadata and contracts
- governance checks for schema, data quality, freshness, and access
- BI summary built only from governed data products
- an end-to-end verification script

## What the Architecture Proves

### Domains

- **Orders Service**
  - owns the Orders domain
  - operational store: PostgreSQL
  - publishes `order_created`
  - publishes `orders_data_product`

- **Payments Service**
  - owns the Payments domain
  - operational store: MongoDB
  - consumes `order_created`
  - validates payment quality against the known order
  - publishes `payment_completed`
  - publishes `payments_data_product`

- **Analytics Service**
  - does **not** read operational databases
  - consumes only governed data product events
  - materializes `business_summary`
  - exposes the central catalog and governance report

### Data Products

The demo contains three governed data products:

1. `orders_data_product`
2. `payments_data_product`
3. `business_summary`

Each product includes:

- domain owner
- contract/schema
- description
- output port
- allowed roles
- freshness SLA
- quality rules

## Governance Model Implemented

The governance layer is shared and automated through code:

- **Contract validation**
  - strict JSON contracts
  - unknown fields rejected

- **Data quality**
  - positive amounts only
  - non-empty customer
  - payment amount must match the source order
  - payment method restricted to known values

- **Freshness**
  - each data product has a freshness SLA
  - products become `stale` automatically if not updated in time

- **Access control**
  - raw data products require `X-Data-Role`
  - BI consumers can use `bi_reader`

- **Catalog + metadata**
  - analytics service exposes the product catalog
  - ownership, contract name, output port, and freshness are visible

## Why This Fits the Thesis Better Now

This implementation is aligned with the paper direction because it reflects the four core Data Mesh ideas:

1. **Domain ownership**
   - Orders and Payments own their data and publish their own products

2. **Data as a product**
   - data is exposed with contracts, metadata, owners, and governed access

3. **Self-service consumption**
   - BI and downstream consumers use product endpoints/events instead of direct operational DB reads

4. **Federated computational governance**
   - governance rules are coded centrally in shared modules and enforced automatically by services

## Run the Demo

```sh
docker compose up --build
```

Services:

- Orders: `http://localhost:3001`
- Payments: `http://localhost:3002`
- Analytics: `http://localhost:3003`
- Frontend: `http://localhost:8080`
- RabbitMQ UI: `http://localhost:15672`

## Manual Demo Flow

### 1. Create an order

```sh
curl -X POST http://localhost:3001/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"orderId\":\"o1\",\"amount\":100,\"customer\":\"Alice\"}"
```

### 2. Create a valid payment

```sh
curl -X POST http://localhost:3002/payments ^
  -H "Content-Type: application/json" ^
  -d "{\"orderId\":\"o1\",\"amount\":100,\"paymentMethod\":\"card\"}"
```

### 3. Read the BI summary

```sh
curl http://localhost:3003/analytics/summary -H "X-Data-Role: bi_reader"
```

### 4. View the catalog

```sh
curl http://localhost:3003/data-products
```

### 5. View the governance report

```sh
curl http://localhost:3003/governance/report
```

## Automatic Verification

After the stack is running, execute:

```sh
npm run verify:stack
```

On Windows PowerShell, use `npm.cmd run verify:stack` if script execution is blocked.

For a dependency-free governance logic check, you can also run:

```sh
npm run verify:model
```

The verification script proves:

1. unauthorized access is blocked
2. a valid order is accepted
3. an invalid payment is rejected by quality governance
4. a valid payment is accepted
5. analytics summary is built from data products
6. the catalog exposes governed metadata
7. freshness becomes `stale` when the SLA expires

## Important Note for the Demo

The freshness thresholds are intentionally short in `docker-compose.yml` so that stale-data detection can be demonstrated quickly during evaluation.
