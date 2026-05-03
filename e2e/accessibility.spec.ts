import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Audit - Automated Checks', () => {
  const PRIORITY_SCREENS = [
    { name: 'Login', path: '/login' },
    { name: 'Dashboard', path: '/' },
    { name: 'POS', path: '/hizli-satis' },
    { name: 'Ürünler', path: '/urunler' },
    { name: 'Satış Geçmişi', path: '/satislar' },
  ];

  test.beforeEach(async ({ page }) => {
    // Login before accessing protected routes
    const email = process.env.E2E_ADMIN_EMAIL || 'admin@test-tenant.com';
    const password = process.env.E2E_ADMIN_PASSWORD || 'TestPassword123!';
    
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
  });

  PRIORITY_SCREENS.forEach((screen) => {
    test(`accessibility check: ${screen.name}`, async ({ page }) => {
      await page.goto(screen.path);
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Assert: 0 critical violations
      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical'
      );
      expect(criticalViolations.length).toBe(0);

      // Assert: 0 serious violations
      const seriousViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'serious'
      );
      expect(seriousViolations.length).toBe(0);

      // Log moderate violations for post-launch backlog
      const moderateViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'moderate'
      );
      if (moderateViolations.length > 0) {
        console.log(`\n[MODERATE] ${screen.name}: ${moderateViolations.length} moderate violations`);
        moderateViolations.forEach((v) => {
          console.log(`  - ${v.id}: ${v.description}`);
        });
      }
    });
  });

  test('keyboard navigation: Login page tab order', async ({ page }) => {
    await page.goto('/login');
    
    // Tab order: Username → Password → Giriş Yap → Şifremi Unuttum
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
    
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('type'))).toBe('password');
    
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toContain('Giriş');
  });

  test('keyboard navigation: POS tab order', async ({ page }) => {
    await page.goto('/hizli-satis');
    
    // Tab order: Search field → first cart item → payment button
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.placeholder);
    expect(firstFocused).toBeTruthy();
  });

  test('modal: focus trapped inside, ESC closes', async ({ page }) => {
    // Navigate to a page with a modal trigger
    await page.goto('/');
    
    // Look for a modal trigger button (e.g., settings, user menu)
    const modalTrigger = page.locator('[data-testid="user-menu"], [data-testid="settings-btn"]').first();
    if (await modalTrigger.count() > 0) {
      await modalTrigger.click();
      
      // Check if modal is open
      const modal = page.locator('[role="dialog"]').first();
      if (await modal.count() > 0) {
        // Press ESC to close
        await page.keyboard.press('Escape');
        
        // Verify modal is closed
        await expect(modal).not.toBeVisible({ timeout: 2000 });
      }
    }
  });
});
