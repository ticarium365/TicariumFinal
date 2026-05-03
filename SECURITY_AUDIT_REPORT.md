# Backend Security Audit Report

**Date:** 2026-05-03
**Scope:** `artifacts/api-server/src/`
**Stack:** Express + express-session + connect-pg-simple + Pino + Drizzle ORM

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 8 |
| Low | 3 |

---

## Findings Table

| Finding | Severity | File:Line | Fix |
|---------|----------|-----------|-----|
| **Route `/catalog` has no authentication middleware** | Critical | `routes/index.ts:72` | Add `requireAuth` to `/catalog` route mount |
| **Route `/payment/status` exposes plan/trial data without authentication** | Critical | `routes/payment.ts:13` | Add `requireAuth` to `/payment/status` route |
| **`req.body` used directly without Zod schema validation in multiple routes** | High | `routes/suppliers.ts:145-152`, `routes/profit.ts:186-190,326-327`, `routes/products.ts:199`, `routes/einvoice.ts:752`, `routes/customers.ts:217-224`, `routes/contact.ts:66-72`, `routes/budgets.ts:232-237` | Add Zod schema validation for all request bodies |
| **`req.body.channel` used without validation in auth resend verification** | High | `routes/auth.ts:938-940` | Add enum validation for channel field |
| **Raw SQL with table name interpolation in RLS policy script** | Medium | `scripts/apply-rls.ts:48-55` | Use allowlist for table names before sql.raw() |
| **Multiple routes mounted without `requireAuth` in index.ts** | Medium | `routes/index.ts:64-67,69-71,73-76,82-87,95,98,117-120` | Add `requireAuth` middleware to all routes that handle user data |
| **`req.body` used directly in settings PUT without full schema validation** | Medium | `routes/settings.ts:38-50` | Add Zod schema for company settings update |
| **`req.body.mode` used without validation in products import** | Medium | `routes/products.ts:199` | Add enum validation for mode field |
| **Advisory locks use computed hash without validation** | Low | `routes/pricing-rules.ts:237-240` | Add bounds check for lockKey value |
| **`req.body` properties used with partial sanitization in product-analytics** | Low | `routes/product-analytics.ts:62-67` | Consider full Zod schema instead of manual sanitization |
| **SESSION_SECRET length check only in production** | Low | `app.ts:180-184` | Enforce minimum length in all environments |
| **Route `/notifications` mounted without authentication** | Medium | `routes/index.ts:76` | Add `requireAuth` to `/notifications` route |
| **Route `/branches` mounted without authentication** | Medium | `routes/index.ts:82` | Add `requireAuth` to `/branches` route |
| **Route `/integrations` mounted without authentication** | Medium | `routes/index.ts:83` | Add `requireAuth` to `/integrations` route |
| **Route `/ext-integrations` mounted without authentication** | Medium | `routes/index.ts:84` | Add `requireAuth` to `/ext-integrations` route |
| **Route `/subscriptions` mounted without authentication** | Medium | `routes/index.ts:85` | Add `requireAuth` to `/subscriptions` route |
| **Route `/billing` mounted without authentication** | Medium | `routes/index.ts:86` | Add `requireAuth` to `/billing` route |
| **Route `/storage` mounted without authentication** | Medium | `routes/index.ts:87` | Add `requireAuth` to `/storage` route |

---

## Detailed Findings

### 1. Route Protection Coverage

**Status:** Mixed - Some routes protected at index level, some at route level

**Protected at index level (good):**
- `/products` - `requireAuth` + `requireFeature(FEATURES.INVENTORY_CORE)`
- `/sales` - `requireAuth` + `requireFeature(FEATURES.SALES_INVOICES)`
- `/stock` - `requireAuth` + `requireFeature(FEATURES.INVENTORY_CORE)`
- `/customers` - `requireAuth` + `requireFeature(FEATURES.CUSTOMERS_CRM)`
- `/suppliers` - `requireAuth` + `requireFeature(FEATURES.SUPPLIERS)`
- `/purchases` - `requireAuth` + `requireFeature(FEATURES.SUPPLIERS)`
- `/stock-counts` - `requireAuth` + `requireFeature(FEATURES.STOCK_COUNTS)`
- `/finance` - `requireAuth` + `requireFeature(FEATURES.FINANCE_EXPENSES)`
- `/banking` - `requireAuth` + `requireFeature(FEATURES.FINANCE_BANKING)`
- `/finance-dashboard` - `requireAuth` + `requireFeature(FEATURES.PROFIT_DASHBOARD)`

**Protected at route level (acceptable but less ideal):**
- `/users` - Router has `requireAuth` + `requireAdmin` internally
- `/dashboard` - Router has `requireAuth` internally
- `/settings` - Router has `requireAuth` internally
- `/reports` - Router has `requireAuth` internally
- `/firma-profili` - Router has `requireAuth` + `requireAdmin` internally
- `/kurulum-skoru` - Router has `requireAuth` internally
- `/onboarding` - Router has `requireAuth` internally
- `/product-analytics` - Router has `requireAuth` internally
- `/companies` - Router has `requireAuth` + `requireSuperAdmin` internally
- `/alerts` - Router has `requireAuth` internally

**NOT protected (critical/high risk):**
- `/catalog` - No `requireAuth` anywhere (CRITICAL)
- `/payment/status` - No `requireAuth` (CRITICAL)
- `/notifications` - No `requireAuth` at index level
- `/branches` - No `requireAuth` at index level
- `/integrations` - No `requireAuth` at index level
- `/ext-integrations` - No `requireAuth` at index level
- `/subscriptions` - No `requireAuth` at index level
- `/billing` - No `requireAuth` at index level
- `/storage` - No `requireAuth` at index level

### 2. Input Sanitization

**Status:** Inconsistent - Some routes use Zod, many use direct `req.body` access

**Routes with direct `req.body` access (no Zod schema):**
- `routes/suppliers.ts:145-152` - Direct field access in update
- `routes/profit.ts:186-190` - Direct field access in fixed assets update
- `routes/profit.ts:326-327` - Direct spread of req.body in employee costs
- `routes/products.ts:199` - Direct `req.body.mode` access
- `routes/einvoice.ts:752` - Direct `req.body.since` access
- `routes/customers.ts:217-224` - Direct field access in update
- `routes/contact.ts:66-72` - Direct `req.body.status` and `req.body.notes` access
- `routes/budgets.ts:232-237` - Direct `req.body` parameter access
- `routes/auth.ts:938-940` - Direct `req.body.channel` access
- `routes/settings.ts:38-50` - Direct field access in settings update

**Routes with proper sanitization:**
- `routes/firma-profili.ts` - Has `validateAndCleanSgkConfig()` function
- `routes/product-analytics.ts` - Has `sanitizeProps()` function with field limits

### 3. SQL Injection Risk

**Status:** Low risk - Drizzle ORM parameterizes by default, but some raw SQL usage

**Raw SQL usage found (all use parameterized queries, mostly safe):**
- `services/usage.ts:136-141` - Parameterized INSERT with sql template literal
- `services/trialWatcher.ts:100` - Advisory lock (safe)
- `scripts/apply-rls.ts:48-55` - **MEDIUM RISK** - Table name interpolation in sql.raw()
- `routes/ad-budgets.ts:183` - Parameterized SELECT
- `routes/audit-logs.ts:53-64` - Parameterized queries
- `routes/einvoice.ts:820-831` - Parameterized queries
- `routes/finance-dashboard.ts:100-105,272-277` - Parameterized queries
- `routes/health.ts:24` - Simple SELECT 1 (safe)
- `routes/marketplace/marketplace-workers.ts:82-85` - Parameterized queries
- `routes/profit.ts:454-466` - Parameterized queries
- `routes/profit-engine.ts:143-172,234-238,313-318,364-369` - Parameterized queries
- `routes/pricing-rules.ts:241` - Advisory lock (safe)
- `routes/subscriptions/subscriptions-admin-billing-metrics.ts:257-261,423-425` - Parameterized queries

**Note:** All `db.execute(sql\`...\`)` calls use parameterized queries. The only concern is `scripts/apply-rls.ts` which uses table names in sql.raw() - this should use an allowlist.

### 4. Session Configuration

**Status:** Good - Properly configured

**Verified:**
- ✅ `cookie.secure`: `"auto"` when behind proxy, `true` in production (line 124-125 in session-config.ts)
- ✅ `cookie.httpOnly`: `true` (line 125)
- ✅ `cookie.sameSite`: Parsed from env, defaults to `"lax"` (line 76-80)
- ✅ `SESSION_SECRET`: Required, length check in production, weak value denylist (app.ts:176-199)
- ✅ Store: `connect-pg-simple` with PostgreSQL (line 41-45)
- ✅ `SESSION_BEHIND_PROXY` check when `sameSite="none"` (line 109-113)
- ✅ Production env validation in `env-validation.ts` (lines 15-91)

**Potential improvement:**
- SESSION_SECRET length check only enforced in production (app.ts:182) - could enforce in all environments

### 5. CORS Configuration

**Status:** Good - Strict allowlist, no wildcard in production

**Verified:**
- ✅ `CORS_ALLOWED_ORIGINS` required in production (env-validation.ts:24)
- ✅ Wildcard `*` forbidden in production (env-validation.ts:53-54)
- ✅ `localhost` forbidden in production (env-validation.ts:53-54)
- ✅ Regex-based allowlist for production: `*.ticarium365.com` + Replit domains (app.ts:121-132)
- ✅ Exact origins supported via `CORS_ALLOWED_ORIGINS` env var (app.ts:138-143)
- ✅ Extra origins via `CORS_EXTRA_ORIGINS` env var (app.ts:133-135)
- ✅ `credentials: true` for cookie support (app.ts:155)

---

## Recommendations

### Immediate (Critical/High)
1. Add `requireAuth` to `/catalog` route mount
2. Add `requireAuth` to `/payment/status` route
3. Implement Zod schema validation for all request bodies
4. Add enum validation for `req.body.channel` in auth route

### Short-term (Medium)
1. Add `requireAuth` to all routes handling user data that are currently unprotected
2. Add table name allowlist in `scripts/apply-rls.ts`
3. Add Zod schema for settings update
4. Add enum validation for import mode field

### Long-term (Low)
1. Enforce SESSION_SECRET minimum length in all environments
2. Add bounds check for advisory lock hash values
3. Consider full Zod schema for product-analytics instead of manual sanitization
4. Standardize route protection at index level for consistency

---

## Positive Security Measures Observed

1. **Tenant isolation middleware** - `enforceTenantSessionAlignment` applied globally
2. **Rate limiting** - Configured for different endpoints
3. **Helmet security headers** - CSP, HSTS, referrer policy configured
4. **Request ID correlation** - For audit trails
5. **Audit logging** - Comprehensive audit trail in audit-logs route
6. **Production env validation** - Strict checks before startup
7. **Sentry integration** - Error tracking
8. **PG advisory locks** - For concurrent operation safety
9. **Drizzle ORM** - Parameterized queries by default
10. **Session secret validation** - Length and weak value checks in production
