# Pre-Launch Gate Checklist

**Status:** ⏳ PENDING EXECUTION
**Gate:** Single gate before DNS cutover - DO NOT SKIP ANY ITEM
**Decision:** All items ✓ → GO. Any item ✗ → STOP, fix, re-run gate

---

## Step 1 — CI Gate

**Command:**
```bash
pnpm run ci:gate
```

**Requirements:**
- Must be run with production `DATABASE_URL`
- Expected results:
  - ✅ lib/db TypeScript ✓
  - ✅ api-server build ✓
  - ✅ schema verification ✓

**Status:** ⏳ BLOCKED (PowerShell execution policy)

**Manual Execution Required:**
```powershell
# Run in PowerShell with elevated privileges or use alternative method
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
cd c:\Users\user\Desktop\Ticarium\ticarium365
$env:DATABASE_URL="postgresql://user:pass@host:5432/db"
pnpm run ci:gate
```

---

## Step 2 — Deployment Gate

**Command:**
```bash
pnpm run ci:deploy
```

**Requirements:**
- Expected results:
  - ✅ verify-production-env ✓
  - ✅ tsc lib/db ✓
  - ✅ api-server build ✓
  - ✅ verify-production-schema ✓

**Status:** ⏳ BLOCKED (PowerShell execution policy)

**Manual Execution Required:**
```powershell
cd c:\Users\user\Desktop\Ticarium\ticarium365
$env:DATABASE_URL="postgresql://user:pass@host:5432/db"
$env:NODE_ENV="production"
pnpm run ci:deploy
```

---

## Step 3 — All Tests Green

### 3.1 Backend Vitest
**Command:**
```bash
cd artifacts/api-server
pnpm test
```

**Requirements:**
- ✅ All unit tests pass
- ✅ >80% coverage on billing.ts and sales routes

**Status:** ⏳ BLOCKED (PowerShell execution policy)

### 3.2 Frontend Vitest
**Command:**
```bash
cd artifacts/prosan
pnpm test
```

**Requirements:**
- ✅ All component tests pass
- ✅ Button, DataTable, Modal, Input tests green

**Status:** ⏳ BLOCKED (PowerShell execution policy)

### 3.3 Playwright E2E
**Command:**
```bash
cd c:\Users\user\Desktop\Ticarium\ticarium365
E2E_BASE_URL=https://staging.yourdomain.com \
E2E_ADMIN_EMAIL=admin@test-tenant.com \
E2E_ADMIN_PASSWORD=TestPassword123! \
pnpm exec playwright test --project=staging
```

**Requirements:**
- ✅ POS sale test passes
- ✅ Quote to order test passes
- ✅ User management test passes

**Status:** ⏳ BLOCKED (PowerShell execution policy + requires staging URL)

---

## Step 4 — Staging Smoke

### 4.1 Automated Smoke
**Command:**
```bash
SMOKE_BASE_URL=https://staging.yourdomain.com \
SMOKE_API_URL=https://api-staging.yourdomain.com \
node scripts/staging-smoke.mjs
```

**Requirements:**
- ✅ Health check passes
- ✅ Homepage accessible
- ✅ API responding
- ✅ CORS sanity

**Status:** ⏳ BLOCKED (PowerShell execution policy + requires staging URL)

### 4.2 Manual Critical Paths (from P5-E)

**Required Manual Verifications:**
- [ ] New user registration flow works
- [ ] Billing flow (checkout) completes successfully
- [ ] Tenant isolation enforced (cannot access other tenant data)
- [ ] Auth expiry redirects to login correctly

**Status:** ⏳ PENDING MANUAL VERIFICATION

---

## Step 5 — Security Checklist

### 5.1 Environment Variables
- [ ] ✅ No `BILLING_ALLOW_MOCK_IN_PRODUCTION` in production env
- [ ] ✅ No `SKIP_SCHEMA_VERIFY` in production env
- [ ] ✅ `SESSION_SECRET` is 64+ random chars
- [ ] ✅ `CORS_ALLOWED_ORIGINS` has no wildcard
- [ ] ✅ Iyzico mode is LIVE (not sandbox) on production

**Verification Command:**
```bash
# Check production environment variables
# (Must be verified in production environment or deployment config)
```

**Status:** ⏳ PENDING MANUAL VERIFICATION

### 5.2 Infrastructure
- [ ] ✅ Sentry DSN active and receiving test events
- [ ] ✅ API subdomains have Cloudflare cache bypass rules active
- [ ] ✅ SSL/TLS: Full (strict) on Cloudflare

**Status:** ⏳ PENDING MANUAL VERIFICATION

---

## Step 6 — Final Smoke on Production

**Timing:** Immediately after deploy, before DNS cutover

**Required Verifications:**
- [ ] ✅ https://api.yourdomain.com/api/healthz → 200
- [ ] ✅ https://api.yourdomain.com/api/readyz → 200
- [ ] ✅ https://app.yourdomain.com → loads without error
- [ ] ✅ Login with founder account → dashboard loads

**Status:** ⏳ PENDING (requires production deployment)

---

## Execution Instructions

### Option 1: PowerShell (Requires Execution Policy Change)
```powershell
# Allow script execution for current user
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Run CI gate
cd c:\Users\user\Desktop\Ticarium\ticarium365
$env:DATABASE_URL="postgresql://user:pass@host:5432/db"
pnpm run ci:gate

# Run deployment gate
$env:NODE_ENV="production"
pnpm run ci:deploy
```

### Option 2: Use Node Directly
```powershell
cd c:\Users\user\Desktop\Ticarium\ticarium365
node --version
pnpm --version
# Use pnpm via npx if needed
npx pnpm run ci:gate
```

### Option 3: Git Bash / WSL
```bash
cd /c/Users/user/Desktop/Ticarium/ticarium365
export DATABASE_URL="postgresql://user:pass@host:5432/db"
pnpm run ci:gate
```

---

## Gate Decision Matrix

| Step | Status | Decision |
|------|--------|----------|
| 1 — CI Gate | ⏳ Pending | Must pass |
| 2 — Deployment Gate | ⏳ Pending | Must pass |
| 3 — All Tests Green | ⏳ Pending | Must pass |
| 4 — Staging Smoke | ⏳ Pending | Must pass |
| 5 — Security Checklist | ⏳ Pending | All items must pass |
| 6 — Production Smoke | ⏳ Pending | Must pass |

**Overall Status:** ⏳ PENDING

**Decision:** ⏸️ STOP - Complete all steps before proceeding

---

## Notes

- PowerShell execution policy currently blocks pnpm commands
- Requires manual execution policy change or alternative execution method
- Production environment variables must be set before running gates
- Staging URL required for E2E tests and smoke tests
- Production verification requires actual deployment
- This is the single gate before DNS cutover - DO NOT SKIP ANY ITEM
