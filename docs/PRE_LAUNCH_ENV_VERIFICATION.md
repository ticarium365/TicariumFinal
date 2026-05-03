# Pre-Launch Environment Verification Checklist

This checklist must be completed before deploying to production.

## Automated Script Checks

### 1. verify-production-env.mjs

**Status:** ⚠️ **FAILED (Expected - Development Environment)**

**Output:**
```
verify-production-env: FAILED
- Missing required env: DATABASE_URL, SESSION_SECRET, NODE_ENV, TRUST_PROXY, SESSION_BEHIND_PROXY, CORS_ALLOWED_ORIGINS, IYZICO_API_KEY, IYZICO_SECRET_KEY, SENTRY_DSN, RELEASE_VERSION
- NODE_ENV must be production for deploy gate
```

**Required Environment Variables:**
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `SESSION_SECRET` - At least 32 characters (64+ recommended)
- [ ] `NODE_ENV=production` - Must be set to "production"
- [ ] `TRUST_PROXY=1` - Enable proxy trust (Cloudflare)
- [ ] `SESSION_BEHIND_PROXY=1` - Session behind reverse proxy
- [ ] `CORS_ALLOWED_ORIGINS` - Comma-separated allowed origins (no wildcard)
- [ ] `IYZICO_API_KEY` - Iyzico API key
- [ ] `IYZICO_SECRET_KEY` - Iyzico secret key
- [ ] `SENTRY_DSN` - Sentry error tracking DSN
- [ ] `RELEASE_VERSION` - Immutable release tag (e.g., "v1.2.3")

**Dangerous Flags (Must NOT be set):**
- [ ] `BILLING_ALLOW_MOCK_IN_PRODUCTION=true` - Forbidden
- [ ] `SKIP_SCHEMA_VERIFY=1` - Forbidden
- [ ] `IYZICO_MODE=mock` - Forbidden

**Script Location:** `scripts/verify-production-env.mjs`
**Run Command:** `node scripts/verify-production-env.mjs`
**Expected Result:** `verify-production-env: OK`

---

### 2. verify-production-schema.mjs

**Status:** ⚠️ **SKIPPED (Requires DATABASE_URL)**

**Required Tables and Columns:**
- [ ] `companies` table with columns: `id`, `subdomain`, `is_active`, `plan_type`
- [ ] `users` table with columns: `id`, `company_id`, `username`, `role`
- [ ] `marketplace_autopilot_action_logs` table with columns: `company_id`, `action_type`, `outcome_metrics`
- [ ] `marketplace_autopilot_intent_events` table with columns: `company_id`, `intent_kind`
- [ ] `company_settings` table with columns: `company_id`, `autopilot_closed_loop`

**Script Location:** `scripts/verify-production-schema.mjs`
**Run Command:** `node scripts/verify-production-schema.mjs`
**Expected Result:** `verify-production-schema: OK — kritik tablolar ve kolonlar mevcut`

---

### 3. pnpm run ci:gate

**Status:** ⚠️ **SKIPPED (Requires DATABASE_URL and production env)**

**Purpose:** Runs TypeScript compilation, linting, and tests
**Run Command:** `pnpm run ci:gate`
**Expected Result:** All tests pass, no lint errors, TypeScript compilation succeeds

---

## Manual Verification Steps

### 4. Required Environment Variables

**Tech Docs Section 14 Reference:**

| Variable | Purpose | Required Value |
|----------|---------|----------------|
| `DATABASE_URL` | PostgreSQL connection | Valid connection string |
| `SESSION_SECRET` | Session encryption | 64+ random characters |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | Valid port number (e.g., 3000) |
| `TRUST_PROXY` | Proxy trust | `1` (for Cloudflare) |
| `SESSION_BEHIND_PROXY` | Session proxy config | `1` |
| `SESSION_COOKIE_SAMESITE` | Cookie SameSite | `strict` or `lax` |
| `SESSION_COOKIE_DOMAIN` | Cookie domain | Your domain |
| `CORS_ALLOWED_ORIGINS` | CORS allowlist | Comma-separated origins (no `*`) |
| `STORAGE_DRIVER` | Storage backend | `r2` or `s3` |
| `R2_*` vars | Cloudflare R2 config | Account ID, access key, bucket |
| `IYZICO_*` vars | Iyzico payment config | API key, secret key |
| `SENTRY_DSN` | Error tracking | Valid Sentry DSN |

**Verification:**
- [ ] All required variables are set in production environment
- [ ] No placeholder values (e.g., "changeme", "secret")
- [ ] `CORS_ALLOWED_ORIGINS` contains specific domains, no wildcard `*`
- [ ] `CORS_ALLOWED_ORIGINS` does not contain `localhost`

---

### 5. Dangerous Flags Check

**Flags that MUST NOT be set in production:**

- [ ] `BILLING_ALLOW_MOCK_IN_PRODUCTION=true` → **FAIL** if set
- [ ] `SKIP_SCHEMA_VERIFY=1` → **FAIL** if set
- [ ] `ENABLE_SCHEDULER=true` → Review intent, only set if scheduler is needed
- [ ] `IYZICO_MODE=mock` → **FAIL** if set

**Verification Command:**
```bash
# Check for dangerous flags
env | grep -E "(BILLING_ALLOW_MOCK|SKIP_SCHEMA_VERIFY|ENABLE_SCHEDULER|IYZICO_MODE)"
```

**Expected Result:** No output (none of these flags should be set)

---

### 6. SESSION_SECRET Strength

**Requirements:**
- Minimum 32 characters (64+ recommended for production)
- Must be cryptographically random
- Must NOT be a dictionary word
- Must NOT be common values like "secret", "changeme", "password"

**Verification:**
```bash
# Check length
echo $SESSION_SECRET | wc -c

# Check for common weak values
if echo "$SESSION_SECRET" | grep -qiE "^(secret|changeme|password|123456|admin)"; then
  echo "FAIL: Weak SESSION_SECRET detected"
fi
```

**Expected Result:**
- Length ≥ 64 characters
- Not a dictionary word or common weak value

**Generation (if needed):**
```bash
# Generate a strong random secret (64 chars)
openssl rand -base64 48
```

---

### 7. Database Connection

**Migration Verification:**

**Step 1:** Run migrations
```bash
pnpm -C lib/db run migrate:sql
```

**Expected Result:** All migrations apply successfully without errors

**Step 2:** Verify schema
```bash
node scripts/verify-production-schema.mjs
```

**Expected Result:** `verify-production-schema: OK — kritik tablolar ve kolonlar mevcut`

**Step 3:** Test connection
```bash
# Using psql or your preferred DB client
psql $DATABASE_URL -c "SELECT 1;"
```

**Expected Result:** Connection succeeds and returns `1`

---

### 8. Cloudflare Proxy Headers

**Configuration:**
- `TRUST_PROXY=1` must be set
- `SESSION_BEHIND_PROXY=1` must be set

**Verification:**

**Test 1: Client IP detection**
```bash
# Create a test endpoint to verify req.ip
# GET /api/test/ip should return the real client IP, not 127.0.0.1
```

**Expected Result:** `req.ip` returns the real client IP (e.g., `203.0.113.1`), not `127.0.0.1`

**Test 2: Session cookie over HTTPS**
```bash
# Check that session cookie has:
# - Secure flag (only sent over HTTPS)
# - HttpOnly flag (not accessible via JavaScript)
# - SameSite=Strict or SameSite=Lax
# - Domain set to your production domain
```

**Expected Result:**
- Cookie header includes `Secure; HttpOnly; SameSite=Strict; Domain=.yourdomain.com`
- Cookie is NOT sent over HTTP (only HTTPS)

**Test 3: X-Forwarded-For header processing**
```bash
# Cloudflare should send X-Forwarded-For header
# Verify Express trusts this header
```

**Expected Result:** Express correctly parses `X-Forwarded-For` chain and extracts the original client IP

---

## Additional Security Checks

### 9. Billing Flow Safety

**Already verified (see billing flow audit):**
- [x] BILLING_ALLOW_MOCK_IN_PRODUCTION guard - PASS
- [x] Payment idempotency - PASS
- [x] Webhook signature verification - PASS
- [x] Return URL handling - PASS
- [x] Double-subscription prevention - PASS

---

### 10. CORS Configuration

**Verification:**
- [ ] `CORS_ALLOWED_ORIGINS` contains only trusted domains
- [ ] No wildcard `*` in allowlist
- [ ] No `localhost` in allowlist
- [ ] Origins include protocol (https://)
- [ ] Multiple origins separated by commas

**Example valid value:**
```
CORS_ALLOWED_ORIGINS=https://app.ticarium365.com,https://www.ticarium365.com
```

---

### 11. Sentry Configuration

**Verification:**
- [ ] `SENTRY_DSN` is set to production project DSN
- [ ] Sentry is receiving test events
- [ ] Error tracking is active
- [ ] Performance monitoring is enabled (optional but recommended)

**Test:**
```bash
# Trigger a test error to verify Sentry is working
# Check Sentry dashboard for the error
```

---

## Pre-Launch Checklist Summary

| Check | Status | Notes |
|-------|--------|-------|
| verify-production-env.mjs | ⚠️ | Requires production env vars |
| verify-production-schema.mjs | ⚠️ | Requires DATABASE_URL |
| pnpm run ci:gate | ⚠️ | Requires DATABASE_URL |
| Required env vars defined | ⏳ | Manual verification needed |
| Dangerous flags NOT set | ⏳ | Manual verification needed |
| SESSION_SECRET strength (64+ chars) | ⏳ | Manual verification needed |
| Database connection & migration | ⏳ | Manual verification needed |
| Cloudflare proxy headers | ⏳ | Manual verification needed |
| Billing flow safety | ✅ | Verified PASS (5/5) |
| CORS configuration | ⏳ | Manual verification needed |
| Sentry configuration | ⏳ | Manual verification needed |

---

## Final Launch Steps

1. **Set all required environment variables** in production environment
2. **Run verify-production-env.mjs** → Must return OK
3. **Run database migrations** → Must succeed
4. **Run verify-production-schema.mjs** → Must return OK
5. **Run pnpm run ci:gate** → Must pass all tests
6. **Manually verify Cloudflare proxy headers** → req.ip returns real client IP
7. **Test session cookie** → Secure, HttpOnly, SameSite flags correct
8. **Trigger test error** → Verify Sentry receives it
9. **Test billing flow** → Verify Iyzico integration works end-to-end
10. **Monitor logs** → No critical errors in first 15 minutes

---

## Emergency Rollback Plan

If issues are detected after launch:

1. **Database issues:** Rollback to previous migration
2. **Billing issues:** Set `BILLING_ALLOW_MOCK_IN_PRODUCTION=true` temporarily (with alert)
3. **Proxy issues:** Disable `TRUST_PROXY` temporarily (may break session)
4. **CORS issues:** Add `*` to `CORS_ALLOWED_ORIGINS` temporarily (security risk)
5. **General issues:** Revert to previous deployment

---

**Last Updated:** 2026-05-03
**Document Version:** 1.0
