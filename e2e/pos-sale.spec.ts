import { test, expect } from '@playwright/test';
import { TEST_PRODUCT } from './fixtures';

test.describe('E2E Test 1 — Login to first sale', () => {
  test('complete a POS sale', async ({ page, loginAsAdmin, navigateToPOS, navigateToDashboard, navigateToProducts }) => {
    // Login
    await loginAsAdmin();

    // Navigate to Hızlı Satış (POS)
    await navigateToPOS();

    // Add product to cart
    const productInput = page.locator('input[placeholder*="Ürün ara"]', { hasText: /Ürün/i }).or(page.locator('[data-testid="product-search-input"]'));
    await productInput.fill(TEST_PRODUCT.sku);
    await page.keyboard.press('Enter');
    
    // Wait for product to appear and add it
    await page.waitForSelector(`text=${TEST_PRODUCT.name}`, { timeout: 5000 });
    await page.click(`text=${TEST_PRODUCT.name}`);

    // Set quantity
    const quantityInput = page.locator('[data-testid="quantity-input"]').or(page.locator('input[type="number"]'));
    await quantityInput.fill('2');
    await page.keyboard.press('Enter');

    // Select payment method (Nakit)
    await page.click('[data-testid="payment-method-cash"]').or(page.locator('button:has-text("Nakit")'));

    // Confirm sale
    await page.click('[data-testid="confirm-sale"]').or(page.locator('button:has-text("Onayla")'));

    // Assert: success screen shown
    await expect(page.locator('[data-testid="sale-success"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Satış başarıyla tamamlandı')).toBeVisible();

    // Navigate to Dashboard
    await navigateToDashboard();

    // Assert: today revenue card shows sale amount
    const saleAmount = TEST_PRODUCT.price * 2;
    await expect(page.locator('[data-testid="today-revenue"]')).toContainText(saleAmount.toString());

    // Navigate to Ürünler
    await navigateToProducts();

    // Assert: product stock decreased
    const expectedStock = TEST_PRODUCT.initialStock - 2;
    await page.fill('input[placeholder*="Ara"]', TEST_PRODUCT.sku);
    await page.keyboard.press('Enter');
    
    const stockBadge = page.locator(`[data-testid="product-stock-${TEST_PRODUCT.sku}"]`).or(page.locator('[data-testid="product-stock"]'));
    await expect(stockBadge).toContainText(expectedStock.toString());
  });
});
