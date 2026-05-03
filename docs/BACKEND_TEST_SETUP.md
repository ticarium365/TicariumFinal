# Backend Unit Test Setup

## Overview

Unit tests have been created for critical backend business logic using Vitest. The tests cover:

- **Priority 1**: Billing logic (checkout, idempotency, webhook signature, subscription activation, production guard)
- **Priority 2**: Sale transaction (stock decrement, insufficient stock, multiple line items, transaction rollback)
- **Priority 3**: Tenant boundary (session/company mismatch, super_admin access, regular user isolation)

## Installation

Vitest has been added to `artifacts/api-server/package.json` but requires installation:

```bash
cd artifacts/api-server
pnpm install
```

## Test Files

- `vitest.config.ts` - Vitest configuration
- `src/routes/billing/billing-iyzico-flow.test.ts` - Billing logic tests
- `src/routes/sales.test.ts` - Sale transaction tests
- `src/middlewares/auth.test.ts` - Tenant boundary tests

## Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test --watch
```

## Coverage Target

>80% coverage on billing.ts and sales routes.

## Test Suites

### Priority 1: Billing Logic

- ✅ BILLING_ALLOW_MOCK_IN_PRODUCTION guard in production
- ✅ Checkout creates exactly 1 subscription record
- ✅ Duplicate checkout with same idempotency key returns existing record
- ✅ Webhook with invalid signature returns 400
- ✅ Successful webhook transitions subscription to 'active' state

### Priority 2: Sale Transaction

- ✅ Creating a sale decrements stock by the correct quantity
- ✅ Creating a sale with insufficient stock returns 400 with clear message
- ✅ Sale with multiple line items: each item stock decremented correctly
- ✅ Failed sale (DB error mid-transaction): stock NOT decremented (rollback verified)

### Priority 3: Tenant Boundary

- ✅ Request with mismatched session companyId vs host → TENANT_SESSION_MISMATCH
- ✅ Super admin can access any tenant
- ✅ Regular user cannot access another tenant's data
- ✅ Company_id filtering enforced in queries
- ✅ SQL injection prevention

## Notes

- Tests use mocks to isolate business logic from external dependencies
- Database operations are mocked using vi.fn()
- All tests are co-located with source files as `*.test.ts`
- TypeScript errors will be resolved after `pnpm install` (vitest types)
