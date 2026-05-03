# E2E Test Setup

## Overview

End-to-end tests for the 3 most critical user flows using Playwright.

## Installation

Playwright is already installed in the root package.json. Added `@playwright/test` as a dev dependency.

## Configuration

**playwright.config.ts** - Playwright configuration at monorepo root
- baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000'
- 1 worker for isolation
- HTML reporter
- Screenshots on failure
- Trace on first retry

## Test Fixtures

**e2e/fixtures.ts** - Test fixtures with seeded test data
- TEST_TENANT: Test tenant credentials (subdomain, email, password)
- TEST_PRODUCT: Test product (SKU, name, stock, price)
- TEST_CUSTOMER: Test customer (name, email)
- TEST_STAFF_USER: Test staff user (email, password)

Fixtures also include navigation helpers:
- loginAsAdmin / loginAsStaff
- navigateToPOS / navigateToDashboard / navigateToProducts
- navigateToQuotes / navigateToOrders / navigateToUsers

## Environment Variables

Required for running tests on staging:

```bash
E2E_BASE_URL=https://staging.example.com
E2E_TENANT_SUBDOMAIN=test-tenant
E2E_ADMIN_EMAIL=admin@test-tenant.com
E2E_ADMIN_PASSWORD=TestPassword123!
E2E_PRODUCT_SKU=TEST-PROD-001
E2E_PRODUCT_NAME=Test Product
E2E_PRODUCT_STOCK=100
E2E_PRODUCT_PRICE=50.00
E2E_CUSTOMER_NAME=Test Customer
E2E_CUSTOMER_EMAIL=customer@test.com
E2E_STAFF_EMAIL=staff@test-tenant.com
E2E_STAFF_PASSWORD=StaffPassword123!
```

## Test Files

**e2e/pos-sale.spec.ts** - Login to first sale (POS flow)
- Login → navigate to Hızlı Satış → scan/add product → set quantity → select payment method → confirm sale
- Assert: success screen shown
- Navigate to Dashboard → assert: today revenue card shows sale amount
- Navigate to Ürünler → assert: product stock decreased

**e2e/quote-to-order.spec.ts** - Create B2B quote and convert to order
- Login → Teklifler → Yeni Teklif → select customer → add product line → save
- Assert: quote in Gönderildi state
- Click Siparişe Çevir → assert: order created
- Navigate to Siparişler → assert: order appears

**e2e/user-management.spec.ts** - User management (admin only)
- Login as admin → Kullanıcılar → Yeni Kullanıcı → enter email, select Staff role → send
- Assert: user appears in list with Beklemede badge
- Login as the new staff user → assert: billing page NOT accessible

## Running Tests

```bash
# Run all E2E tests
pnpm exec playwright test

# Run with UI
pnpm exec playwright test --ui

# Run specific test file
pnpm exec playwright test e2e/pos-sale.spec.ts

# Run in headed mode
pnpm exec playwright test --headed
```

## Test Data Seeding

Before running E2E tests, ensure the following data exists in the test environment:

1. **Test Tenant**: A company with subdomain matching E2E_TENANT_SUBDOMAIN
2. **Admin User**: User with E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD, role: admin
3. **Test Product**: Product with SKU matching E2E_PRODUCT_SKU, stock: E2E_PRODUCT_STOCK
4. **Test Customer**: Customer with E2E_CUSTOMER_EMAIL
5. **Staff User**: User with E2E_STAFF_EMAIL (created during test)

## Test Data Attributes

Tests use data-testid attributes for reliable element selection. Ensure the following data-testid attributes exist in the UI:

- `[data-testid="pos-page"]`
- `[data-testid="dashboard-page"]`
- `[data-testid="products-page"]`
- `[data-testid="quotes-page"]`
- `[data-testid="orders-page"]`
- `[data-testid="users-page"]`
- `[data-testid="product-search-input"]`
- `[data-testid="quantity-input"]`
- `[data-testid="payment-method-cash"]`
- `[data-testid="confirm-sale"]`
- `[data-testid="sale-success"]`
- `[data-testid="today-revenue"]`
- `[data-testid="product-stock-*"]`
- `[data-testid="new-quote-btn"]`
- `[data-testid="customer-select"]`
- `[data-testid="add-product-line"]`
- `[data-testid="line-product-input"]`
- `[data-testid="line-quantity-input"]`
- `[data-testid="save-quote"]`
- `[data-testid="quote-status"]`
- `[data-testid="quote-number"]`
- `[data-testid="convert-to-order"]`
- `[data-testid="confirm-conversion"]`
- `[data-testid="order-success"]`
- `[data-testid="order-list"]`
- `[data-testid="new-user-btn"]`
- `[data-testid="user-email"]`
- `[data-testid="role-select"]`
- `[data-testid="send-invitation"]`
- `[data-testid="user-*"]`
- `[data-testid="status-pending"]`
- `[data-testid="user-menu"]`
- `[data-testid="logout-btn"]`
- `[data-testid="forbidden"]`

## Notes

- Tests use 1 worker for isolation
- Tests are configured to run on Chromium
- Screenshots are captured on failure
- Trace is enabled on first retry
- Tests require seeded test data in the environment
