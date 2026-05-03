import { test as base } from '@playwright/test';

// Test fixture data - these should be seeded in the test environment
export const TEST_TENANT = {
  subdomain: process.env.E2E_TENANT_SUBDOMAIN || 'test-tenant',
  email: process.env.E2E_ADMIN_EMAIL || 'admin@test-tenant.com',
  password: process.env.E2E_ADMIN_PASSWORD || 'TestPassword123!',
};

export const TEST_PRODUCT = {
  sku: process.env.E2E_PRODUCT_SKU || 'TEST-PROD-001',
  name: process.env.E2E_PRODUCT_NAME || 'Test Product',
  initialStock: parseInt(process.env.E2E_PRODUCT_STOCK || '100'),
  price: parseFloat(process.env.E2E_PRODUCT_PRICE || '50.00'),
};

export const TEST_CUSTOMER = {
  name: process.env.E2E_CUSTOMER_NAME || 'Test Customer',
  email: process.env.E2E_CUSTOMER_EMAIL || 'customer@test.com',
};

export const TEST_STAFF_USER = {
  email: process.env.E2E_STAFF_EMAIL || 'staff@test-tenant.com',
  password: process.env.E2E_STAFF_PASSWORD || 'StaffPassword123!',
};

interface TestFixtures {
  loginAsAdmin: () => Promise<void>;
  loginAsStaff: () => Promise<void>;
  navigateToPOS: () => Promise<void>;
  navigateToDashboard: () => Promise<void>;
  navigateToProducts: () => Promise<void>;
  navigateToQuotes: () => Promise<void>;
  navigateToOrders: () => Promise<void>;
  navigateToUsers: () => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  loginAsAdmin: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_TENANT.email);
    await page.fill('input[type="password"]', TEST_TENANT.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    await use();
  },

  loginAsStaff: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_STAFF_USER.email);
    await page.fill('input[type="password"]', TEST_STAFF_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    await use();
  },

  navigateToPOS: async ({ page }, use) => {
    await page.goto('/hizli-satis');
    await page.waitForSelector('[data-testid="pos-page"]', { timeout: 5000 });
    await use();
  },

  navigateToDashboard: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="dashboard-page"]', { timeout: 5000 });
    await use();
  },

  navigateToProducts: async ({ page }, use) => {
    await page.goto('/urunler');
    await page.waitForSelector('[data-testid="products-page"]', { timeout: 5000 });
    await use();
  },

  navigateToQuotes: async ({ page }, use) => {
    await page.goto('/teklifler');
    await page.waitForSelector('[data-testid="quotes-page"]', { timeout: 5000 });
    await use();
  },

  navigateToOrders: async ({ page }, use) => {
    await page.goto('/siparisler');
    await page.waitForSelector('[data-testid="orders-page"]', { timeout: 5000 });
    await use();
  },

  navigateToUsers: async ({ page }, use) => {
    await page.goto('/kullanicilar');
    await page.waitForSelector('[data-testid="users-page"]', { timeout: 5000 });
    await use();
  },
});
