import {
  sectionBand,
  gap,
  h2,
  promptBox,
  pb,
} from "./helpers.mjs";

export function phase6Blocks() {
  return [
    sectionBand(
      "6",
      "Testing & QA",
      "Unit tests for critical business logic, E2E for critical flows",
    ),
    gap(120),

    h2("P6-A  —  Backend unit tests"),
    promptBox(
      "P6-A · Backend Tests",
      "Phase 6 → Testing",
      `Write unit tests for critical backend business logic.

Test framework: use Vitest (compatible with the monorepo setup, install if not present).
Test files: co-locate with source as *.test.ts

Priority 1 — Billing logic (artifacts/api-server/src/routes/billing/):
  Test: checkout creates exactly 1 subscription record
  Test: duplicate checkout with same idempotency key returns existing record, not error
  Test: webhook with invalid signature returns 400
  Test: successful webhook transitions subscription to 'active' state
  Test: BILLING_ALLOW_MOCK_IN_PRODUCTION=true in NODE_ENV=production → error thrown

Priority 2 — Sale transaction (artifacts/api-server/src/routes/ — sales route):
  Test: creating a sale decrements stock by the correct quantity
  Test: creating a sale with insufficient stock returns 400 with clear message
  Test: sale with multiple line items: each item stock decremented correctly
  Test: failed sale (DB error mid-transaction): stock NOT decremented (rollback verified)

Priority 3 — Tenant boundary:
  Test: request with mismatched session companyId vs host → TENANT_SESSION_MISMATCH
  Test: super_admin can access any tenant
  Test: regular user cannot access another tenant's data

Run: pnpm test
All tests must pass. Coverage target: >80% on billing.ts and sales routes.`,
      null,
    ),
    gap(80),

    h2("P6-B  —  Frontend component tests"),
    promptBox(
      "P6-B · Frontend Tests",
      "Phase 6 → Testing",
      `Write component tests for the new UI component library.

Setup: Vitest + @testing-library/react + jsdom
Install if not present. Config in artifacts/prosan/vite.config.ts (test section).

Test these components from Phase 2:

Button.tsx:
  - Renders with correct text
  - Calls onClick when clicked
  - Does NOT call onClick when disabled
  - Shows spinner when loading=true, hides children text
  - Applies correct CSS class for each variant (primary/secondary/danger/ghost)

DataTable.tsx:
  - Renders column headers correctly
  - Renders correct number of rows
  - Shows SkeletonTable when loading=true
  - Shows EmptyState when data=[] and loading=false
  - Calls onSort with correct column key when sortable header clicked
  - Pagination: shows correct page, calls onPageChange

Modal.tsx:
  - Renders children in body
  - Calls onClose when ESC key pressed
  - Calls onClose when clicking overlay backdrop
  - Does NOT call onClose when clicking modal content

Input.tsx:
  - Shows error message when error prop provided
  - Input has red border-color class when error provided
  - Calls onChange with correct value

Run: pnpm -C artifacts/prosan test
All tests must pass before Phase 7.`,
      null,
    ),
    gap(80),

    h2("P6-C  —  E2E critical flows"),
    promptBox(
      "P6-C · E2E Tests",
      "Phase 6 → Testing",
      `Write E2E tests for the 3 most critical user flows using Playwright.

Install: pnpm add -D @playwright/test
Config: playwright.config.ts at monorepo root
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000'
  Use 1 worker for isolation

Setup: create test fixtures for:
  - A seeded test tenant (company) with known credentials
  - A test product with known SKU and stock quantity
  - A test customer

E2E Test 1 — Login to first sale:
  test('complete a POS sale', async ({ page }) => {
    // Login → navigate to Hızlı Satış → scan/add product → set quantity
    // → select payment method → confirm sale
    // → assert: success screen shown
    // → navigate to Dashboard → assert: today revenue card shows sale amount
    // → navigate to Ürünler → assert: product stock decreased
  })

E2E Test 2 — Create B2B quote and convert to order:
  test('quote to order flow', async ({ page }) => {
    // Login → Teklifler → Yeni Teklif → select customer → add product line
    // → save → assert: quote in Gönderildi state
    // → click Siparişe Çevir → assert: order created
    // → navigate to Siparişler → assert: order appears
  })

E2E Test 3 — User management (admin only):
  test('admin invites staff user', async ({ page }) => {
    // Login as admin → Kullanıcılar → Yeni Kullanıcı
    // → enter email, select Staff role → send
    // → assert: user appears in list with Beklemede badge
    // Login as the new staff user → assert: billing page NOT accessible
  })

Run: pnpm exec playwright test
All 3 must pass on staging environment.`,
      null,
    ),
    gap(80),

    h2("P6-D  —  Accessibility baseline"),
    promptBox(
      "P6-D · Accessibility",
      "Phase 6 → Testing",
      `Run an accessibility audit and fix critical issues.

Tools:
  Install @axe-core/playwright for automated checks
  Also run manual keyboard navigation test

Automated audit (add to E2E suite):
  For each of the 5 priority screens (Login, Dashboard, POS, Ürünler, Satış Geçmişi):
  await checkA11y(page)  — using axe-core
  Assert: 0 critical violations, 0 serious violations

Manual checks to verify:
1. Keyboard navigation:
   Tab order on Login: Username → Password → Giriş Yap → Şifremi Unuttum
   Tab order on POS: Search field → first cart item → payment button
   All modals: focus trapped inside, ESC closes

2. Screen reader compatibility (test with VoiceOver or NVDA):
   DataTable: announces "X satır, Y sütun" on focus
   Buttons: all have aria-label if icon-only
   Status badges: announce color + text (not just color)
   Loading states: aria-busy=true on loading containers

3. Color contrast:
   All text on colored backgrounds: minimum 4.5:1 ratio (WCAG AA)
   Sidebar text on navy background: verify white (#FFFFFF) passes
   Badge text: verify sufficient contrast for all badge color combinations

4. Required fixes before launch:
   Any critical axe violation → fix immediately
   Any serious axe violation → fix before launch
   Moderate violations → log as post-launch backlog`,
      null,
    ),

    pb(),
  ];
}
