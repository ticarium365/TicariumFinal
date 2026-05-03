import { test, expect } from '@playwright/test';
import { TEST_PRODUCT, TEST_CUSTOMER } from './fixtures';

test.describe('E2E Test 2 — Create B2B quote and convert to order', () => {
  test('quote to order flow', async ({ page, loginAsAdmin, navigateToQuotes, navigateToOrders }) => {
    // Login
    await loginAsAdmin();

    // Navigate to Teklifler (Quotes)
    await navigateToQuotes();

    // Click Yeni Teklif (New Quote)
    await page.click('[data-testid="new-quote-btn"]').or(page.locator('button:has-text("Yeni Teklif")'));

    // Select customer
    await page.click('[data-testid="customer-select"]').or(page.locator('[role="combobox"]'));
    await page.fill('input[role="combobox"]', TEST_CUSTOMER.email);
    await page.keyboard.press('Enter');

    // Add product line
    await page.click('[data-testid="add-product-line"]').or(page.locator('button:has-text("Ürün Ekle")'));
    
    const productInput = page.locator('[data-testid="line-product-input"]').or(page.locator('input[placeholder*="Ürün"]'));
    await productInput.fill(TEST_PRODUCT.sku);
    await page.keyboard.press('Enter');

    // Set quantity
    const quantityInput = page.locator('[data-testid="line-quantity-input"]').or(page.locator('input[type="number"]'));
    await quantityInput.fill('5');

    // Save quote
    await page.click('[data-testid="save-quote"]').or(page.locator('button:has-text("Kaydet")'));

    // Assert: quote in Gönderildi state
    await expect(page.locator('[data-testid="quote-status"]')).toContainText('Gönderildi');
    const quoteNumber = await page.locator('[data-testid="quote-number"]').textContent();

    // Click Siparişe Çevir (Convert to Order)
    await page.click('[data-testid="convert-to-order"]').or(page.locator('button:has-text("Siparişe Çevir")'));

    // Confirm conversion
    await page.click('[data-testid="confirm-conversion"]').or(page.locator('button:has-text("Onayla")'));

    // Assert: order created
    await expect(page.locator('[data-testid="order-success"]')).toBeVisible();

    // Navigate to Siparişler (Orders)
    await navigateToOrders();

    // Assert: order appears
    await page.fill('input[placeholder*="Ara"]', quoteNumber || '');
    await page.keyboard.press('Enter');
    
    await expect(page.locator('[data-testid="order-list"]')).toContainText(quoteNumber || '');
  });
});
