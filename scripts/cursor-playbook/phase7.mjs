import {
  sectionBand,
  gap,
  h2,
  promptBox,
} from "./helpers.mjs";

export function phase7Blocks() {
  return [
    sectionBand(
      "7",
      "Launch Checklist",
      "Final verification, monitoring setup, and rollback plan",
    ),
    gap(120),

    h2("P7-A  —  Pre-launch gate"),
    promptBox(
      "P7-A · Launch Gate",
      "Phase 7 → Launch",
      `Run the full pre-launch gate and confirm GO status on every item.

Execute in order:

Step 1 — CI gate:
  pnpm run ci:gate  (must be run with production DATABASE_URL)
  Expected: lib/db TypeScript ✓ · api-server build ✓ · schema verification ✓

Step 2 — Deployment gate:
  pnpm run ci:deploy
  Expected: verify-production-env ✓ · tsc lib/db ✓ · api-server build ✓ · verify-production-schema ✓

Step 3 — All tests green:
  pnpm test (backend Vitest)
  pnpm -C artifacts/prosan test (frontend Vitest)
  pnpm exec playwright test --project=staging

Step 4 — Staging smoke:
  SMOKE_BASE_URL=https://staging.yourdomain.com node scripts/staging-smoke.mjs
  + Manual critical paths from P5-E all PASS

Step 5 — Security checklist:
  ☐ No BILLING_ALLOW_MOCK_IN_PRODUCTION in production env
  ☐ No SKIP_SCHEMA_VERIFY in production env
  ☐ SESSION_SECRET is 64+ random chars
  ☐ CORS_ALLOWED_ORIGINS has no wildcard
  ☐ Iyzico mode is LIVE (not sandbox) on production
  ☐ Sentry DSN active and receiving test events
  ☐ API subdomains have Cloudflare cache bypass rules active
  ☐ SSL/TLS: Full (strict) on Cloudflare

Step 6 — Final smoke on production (immediately after deploy):
  https://api.yourdomain.com/api/healthz → 200
  https://api.yourdomain.com/api/readyz → 200
  https://app.yourdomain.com → loads without error
  Login with founder account → dashboard loads

Document: all items ✓ → GO. Any item ✗ → STOP, fix, re-run gate.`,
      "This is the single gate before DNS cutover. Do not skip any item.",
    ),
    gap(80),

    h2("P7-B  —  Monitoring & alerting"),
    promptBox(
      "P7-B · Monitoring",
      "Phase 7 → Launch",
      `Set up monitoring and alerting for production.

1. Sentry alerts (configure in Sentry dashboard):
   - Any new issue: notify immediately (Slack or email)
   - Error rate spike: > 10 errors/minute → alert
   - New release tracking: set RELEASE_VERSION env var in deployment pipeline
     (use git commit SHA: RELEASE_VERSION=$(git rev-parse --short HEAD))

2. Uptime monitoring:
   Set up uptime checks (use UptimeRobot free tier or equivalent) for:
   - https://api.yourdomain.com/api/healthz — check every 1 minute
   - https://app.yourdomain.com — check every 5 minutes
   Alert: email + Slack if down > 2 consecutive checks

3. Database monitoring:
   For Neon/Supabase: enable query performance insights
   Alert on: connection count > 80% of limit · slow queries > 5s · storage > 80%

4. Log-based alerts (Pino → stdout → platform logging):
   Set up log alerts for these specific messages:
   - "tenant_default_company_fallback_used" → should NEVER appear in production
   - "BILLING_ALLOW_MOCK" → critical alert
   - "TENANT_SESSION_MISMATCH" → alert if > 5 in 1 hour (may indicate attack)
   - 5xx error rate > 1% over 5 minutes → alert

5. Business metrics dashboard (simple, manual to start):
   Daily: new signups · active sessions · sales transactions · revenue
   Alert threshold: 0 sales in 24 hours during business hours → investigate`,
      null,
    ),
    gap(80),

    h2("P7-C  —  Rollback plan"),
    promptBox(
      "P7-C · Rollback Plan",
      "Phase 7 → Launch",
      `Document and test the rollback procedure.

Create: docs/ROLLBACK_PROCEDURE.md with the following outline (fill with your hosting specifics — Railway, Docker tag, DB host):

1. Preconditions / when to rollback
   - Trigger examples: elevated 5xx, failed migration, bad config, data corruption risk
   - Define severity: who can approve rollback (on-call / founder)

2. Application rollback
   - Redeploy previous known-good image or git tag (record exact command in runbook)
   - Verify /api/healthz and /api/readyz return 200 after rollback
   - Invalidate CDN / Cloudflare cache if static assets are mismatched

3. Database rollback (only when migration is confirmed broken)
   - Prefer forward-fix; use restore from backup only with written approval
   - Steps: pause traffic (maintenance page) → restore snapshot → replay or skip migrations as needed

4. Verification checklist
   - Login smoke · critical billing read-only · recent orders visible
   - Sentry error rate returns to baseline within N minutes

5. Communication
   - Status page / customer channel template
   - Internal Slack message with timeline and owner

6. Practice drill
   - Run a staging rollback twice a year; record duration and gaps

Keep secrets and account-specific URLs out of the public doc; reference internal vault entries instead.`,
      null,
    ),
  ];
}
