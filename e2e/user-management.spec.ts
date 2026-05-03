import { test, expect } from '@playwright/test';
import { TEST_STAFF_USER } from './fixtures';

test.describe('E2E Test 3 — User management (admin only)', () => {
  test('admin invites staff user', async ({ page, loginAsAdmin, loginAsStaff, navigateToUsers }) => {
    // Login as admin
    await loginAsAdmin();

    // Navigate to Kullanıcılar (Users)
    await navigateToUsers();

    // Click Yeni Kullanıcı (New User)
    await page.click('[data-testid="new-user-btn"]').or(page.locator('button:has-text("Yeni Kullanıcı")'));

    // Enter email
    await page.fill('[data-testid="user-email"]', TEST_STAFF_USER.email);

    // Select Staff role
    await page.click('[data-testid="role-select"]').or(page.locator('[role="combobox"]'));
    await page.click('text=Staff');

    // Send invitation
    await page.click('[data-testid="send-invitation"]').or(page.locator('button:has-text("Gönder")'));

    // Assert: user appears in list with Beklemede badge
    await expect(page.locator(`[data-testid="user-${TEST_STAFF_USER.email}"]`)).toBeVisible();
    await expect(page.locator('[data-testid="status-pending"]')).toContainText('Beklemede');

    // Logout as admin
    await page.click('[data-testid="user-menu"]').or(page.locator('[data-testid="avatar"]'));
    await page.click('[data-testid="logout-btn"]').or(page.locator('button:has-text("Çıkış")'));

    // Login as the new staff user
    await loginAsStaff();

    // Try to navigate to billing page
    await page.goto('/abonelik');

    // Assert: billing page NOT accessible (403 or redirect)
    await expect(page.locator('[data-testid="forbidden"]')).toBeVisible({ timeout: 5000 });
    // OR check for redirect to dashboard
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/abonelik');
  });
});
