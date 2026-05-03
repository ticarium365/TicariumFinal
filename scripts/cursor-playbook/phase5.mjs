import {
  sectionBand,
  gap,
  h2,
  promptBox,
  pb,
} from "./helpers.mjs";

export function phase5Blocks() {
  return [
    sectionBand(
      "5",
      "Security & Production Readiness",
      "Tenant isolation, billing safety, environment verification, smoke tests",
    ),
    gap(120),

    h2("P5-A  —  Security audit"),
    promptBox(
      "P5-A · Security Audit",
      "Phase 5 → Security",
      `Run a security audit on the backend codebase.

Context: artifacts/api-server/src/
Already implemented: requireAuth, requireRole, requireSuperAdmin, tenant-boundary middleware.
Stack: Express + express-session + connect-pg-simple + Pino logger.

Audit tasks:
1. Route protection coverage:
   List every route registered in src/routes/index.ts.
   For each route: which middleware protects it? (requireAuth / requireRole / public / webhook)
   Flag any route that handles user data but has no auth middleware.

2. Input sanitization:
   Check all req.body usages — is every field validated through a Zod schema before use?
   Flag any route that uses req.body.X directly without Zod parsing.

3. SQL injection risk:
   Drizzle ORM parameterizes by default. Check for any raw SQL usage:
   Search for db.execute() with template literals or string concatenation.
   Flag any found.

4. Session configuration:
   Verify in src/lib/session-config.ts:
   - cookie.secure: true in production
   - cookie.httpOnly: true always
   - cookie.sameSite: 'none' when behind Cloudflare proxy
   - SESSION_SECRET: not a default/weak value (check verify-production-env.mjs)
   - Store: connect-pg-simple, not in-memory MemoryStore

5. CORS:
   Verify CORS_ALLOWED_ORIGINS is strictly set — no wildcard '*' in production.
   Check that the frontend origin is listed and no extra origins are permitted.

Output: table with finding · severity (Critical/High/Medium/Low) · file:line · fix.`,
      "Fix Critical and High findings before any other phase-5 work.",
    ),
    gap(80),

    h2("P5-B  —  Billing flow verification"),
    promptBox(
      "P5-B · Billing Safety",
      "Phase 5 → Security",
      `Verify the billing flow is safe for production.

Context: Iyzico payment integration via artifacts/api-server/src/routes/billing.ts
Sub-modules: billing-iyzico-flow.ts · billing-readonly.ts

Verify these 5 properties — show the code that implements each, then confirm it's correct:

1. BILLING_ALLOW_MOCK_IN_PRODUCTION guard:
   Location: somewhere in billing-iyzico-flow.ts or app startup
   Expected: if NODE_ENV=production AND this flag is true → server must refuse to start or log CRITICAL error
   Check: verify-production-env.mjs must exit code 1 if this is set in production

2. Payment idempotency:
   POST /api/billing/checkout — what prevents the same checkout from being processed twice?
   Show the idempotency key logic and the DB check.

3. Webhook signature verification:
   POST /api/billing/webhook — is the Iyzico webhook signature verified before processing?
   What happens if signature check fails? Must return 400, not 200.

4. Return URL handling (ALL /api/billing/return):
   After Iyzico redirects back, is the payment status re-verified server-side?
   Client-side success signal alone MUST NOT be trusted for activating subscriptions.

5. Double-subscription prevention:
   If a user submits checkout twice quickly: does the system create one subscription or two?
   Show the transaction/lock mechanism.

For each: PASS / FAIL / NEEDS REVIEW with the relevant code snippet.`,
      null,
    ),
    gap(80),

    h2("P5-C  —  Environment & deployment verification"),
    promptBox(
      "P5-C · Env Verification",
      "Phase 5 → Security",
      `Verify all environment configuration is production-ready.

Run and fix any issues found by these existing scripts:
  node scripts/verify-production-env.mjs
  node scripts/verify-production-schema.mjs
  pnpm run ci:gate (with real DATABASE_URL)

Then manually verify:

1. All required env vars from tech docs Section 14 are defined:
   DATABASE_URL · SESSION_SECRET · NODE_ENV=production · PORT · TRUST_PROXY
   SESSION_BEHIND_PROXY · SESSION_COOKIE_SAMESITE · SESSION_COOKIE_DOMAIN
   CORS_ALLOWED_ORIGINS · STORAGE_DRIVER · R2_* vars · IYZICO_* vars · SENTRY_DSN

2. Dangerous flags are NOT set in production:
   BILLING_ALLOW_MOCK_IN_PRODUCTION · SKIP_SCHEMA_VERIFY · ENABLE_SCHEDULER (check intent)

3. SESSION_SECRET strength:
   Must be at minimum 64 random characters.
   Verify it is not a dictionary word or the string "secret" or "changeme".

4. Database connection:
   Run: pnpm -C lib/db run migrate:sql
   Run: node scripts/verify-production-schema.mjs
   Both must complete without errors.

5. Cloudflare proxy headers:
   With TRUST_PROXY=1 and SESSION_BEHIND_PROXY=1:
   Verify req.ip returns the real client IP, not 127.0.0.1
   Verify session cookie is set correctly over HTTPS.

Create a checklist document at docs/PRE_LAUNCH_ENV_VERIFICATION.md with pass/fail for each item.`,
      null,
    ),
    gap(80),

    h2("P5-D  —  Autopilot & marketplace safety"),
    promptBox(
      "P5-D · Autopilot Safety",
      "Phase 5 → Security",
      `Verify autopilot and marketplace safety mechanisms.

Context: Routes at /api/marketplace/autopilot/*
Key endpoint: GET /api/marketplace/autopilot/safety-status
Migrations needed: 006, 007, 008 (autopilot tables)

Verify:
1. Migration status:
   Are migrations 006_marketplace_autopilot_action_logs.sql,
   007_marketplace_autopilot_roi.sql,
   008_company_settings_autopilot_closed_loop.sql applied?
   If not: apply them now. If yes: verify the tables exist.

2. Access control on autopilot routes:
   Read actions (safety-status, logs) → admin / staff / super_admin OK
   Write actions (apply, rollback) → admin / super_admin ONLY — verify requireRole(['admin','super_admin'])

3. confirm:true guard:
   Any autopilot action requiring confirm: true in request body:
   Verify the backend does strict boolean check (=== true, not truthy)
   Submit without confirm → must return 400 with clear error message

4. 503 handling:
   If autopilot tables don't exist (migration not applied) → endpoint returns 503
   Verify the 503 response is handled gracefully on the frontend
   (show "Özellik henüz aktif değil" not a crash)

5. Frontend UI:
   Autopilot actions (Apply / Rollback) must show a confirmation modal BEFORE firing the API call.
   Modal text must clearly state what will change.
   After confirmation: show progress state, not just a spinner.`,
      null,
    ),
    gap(80),

    h2("P5-E  —  Staging smoke test"),
    promptBox(
      "P5-E · Smoke Test",
      "Phase 5 → Security",
      `Run the full staging smoke test suite and fix any failures.

Existing script: SMOKE_BASE_URL=https://[staging-url] node scripts/staging-smoke.mjs
This covers: healthz · readyz · homepage · login · API · CORS

Extend the smoke test with these additional manual checks:

Critical path 1 — New user registration to first sale:
  1. Register new company account
  2. Complete onboarding (add 1 product)
  3. Go to Hızlı Satış (POS)
  4. Add the product to cart
  5. Complete sale as "Nakit"
  6. Verify: Dashboard shows today's revenue > 0
  7. Verify: Ürünler shows stock decreased by sold quantity

Critical path 2 — Billing flow:
  1. Login as admin
  2. Go to Abonelik → Paketi Yükselt
  3. Complete Iyzico sandbox payment
  4. Verify: subscription status updated after return
  5. Verify: no duplicate subscription created

Critical path 3 — Tenant isolation:
  1. Create Company A, add a product "TENANT_A_PRODUCT"
  2. Create Company B on a different subdomain
  3. Login as Company B user
  4. Try to access Company A's product ID directly via API
  5. Expected: 403 or 404 — NEVER the actual product data

Critical path 4 — Auth expiry:
  1. Login, get a valid session
  2. Manually expire the session in the DB
  3. Make an API request
  4. Expected: 401 response, frontend shows "Oturumunuz sona erdi" modal

Document all results in docs/STAGING_SMOKE_RESULTS.md with timestamp and tester name.`,
      "Do not proceed to Phase 6 until all 4 critical paths PASS.",
    ),

    pb(),
  ];
}
