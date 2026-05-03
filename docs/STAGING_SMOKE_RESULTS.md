# Staging Smoke Test Results

**Timestamp:** 2026-05-03T05:30:00.000Z
**Tester:** Automated Test Suite
**Environment:** Staging (URLs required via environment variables)

---

## Test Execution Status

⚠️ **PENDING MANUAL EXECUTION** - This document contains the test plan. Actual execution requires:
- `SMOKE_APP_URL` environment variable set to staging app URL
- `SMOKE_API_URL` environment variable set to staging API URL
- Manual browser interaction for Critical Paths 1 and 2

---

## Test Suite: Basic Automated Checks

| Test | Status | Duration | Notes |
|------|--------|----------|-------|
| healthz reachable | ⏳ PENDING | - | API health endpoint |
| readyz reachable | ⏳ PENDING | - | API readiness endpoint |
| homepage reachable | ⏳ PENDING | - | Frontend homepage loads |
| login page reachable | ⏳ PENDING | - | Login page loads |
| API responds | ⏳ PENDING | - | Unauthenticated API returns 401/403 |
| CORS sanity | ⏳ PENDING | - | CORS headers correct |
| expected redirect/auth behavior | ⏳ PENDING | - | Protected endpoints reject anonymous requests |

---

## Critical Path Tests

### Critical Path 1: New User Registration to First Sale

**Status:** ⚠️ MANUAL TEST REQUIRED

**Steps:**
1. Register new company account
2. Complete onboarding (add 1 product)
3. Go to Hızlı Satış (POS)
4. Add the product to cart
5. Complete sale as "Nakit"
6. **Verify:** Dashboard shows today's revenue > 0
7. **Verify:** Ürünler shows stock decreased by sold quantity

**Expected Results:**
- Dashboard revenue reflects the sale immediately
- Product stock is decremented by the sold quantity
- Sale appears in sales history
- No duplicate transactions created

**Actual Results:** (To be filled during manual testing)

**Status:** ⏳ PENDING

---

### Critical Path 2: Billing Flow

**Status:** ⚠️ MANUAL TEST REQUIRED

**Steps:**
1. Login as admin
2. Go to Abonelik → Paketi Yükselt
3. Complete Iyzico sandbox payment
4. **Verify:** subscription status updated after return
5. **Verify:** no duplicate subscription created

**Expected Results:**
- Iyzico payment completes successfully in sandbox
- Return URL redirects back with correct status
- Subscription status updates to "active" or appropriate state
- Only ONE subscription record created (no duplicates)
- Payment record shows correct amount and status

**Actual Results:** (To be filled during manual testing)

**Status:** ⏳ PENDING

---

### Critical Path 3: Tenant Isolation

**Status:** ⏳ PENDING (Automated API Test)

**Automated Checks:**
- Cross-tenant product access blocked (401/403/404)
- Company_id filtering enforced on sales endpoint
- Unauthenticated requests to tenant-scoped endpoints rejected

**Expected Results:**
- API rejects requests without valid session
- Company-scoped data cannot be accessed across tenants
- 403 or 404 returned for cross-tenant access attempts
- NEVER returns actual data from another tenant

**Actual Results:** (To be filled during test execution)

**Status:** ⏳ PENDING

---

### Critical Path 4: Auth Expiry

**Status:** ⏳ PENDING (Automated API Test)

**Automated Checks:**
- Invalid session token rejected (401/403)
- No session cookie rejected (401/403)
- Expired session returns 401
- Frontend should show "Oturumunuz sona erdi" modal

**Expected Results:**
- API returns 401 for invalid/expired sessions
- Frontend handles 401 by showing session expiry modal
- User is redirected to login page
- No data leakage on auth failure

**Actual Results:** (To be filled during test execution)

**Status:** ⏳ PENDING

---

## Execution Instructions

### Running Automated Tests

```bash
# Set environment variables
export SMOKE_APP_URL=https://your-staging-app.example.com
export SMOKE_API_URL=https://your-staging-api.example.com
export SMOKE_ORIGIN=https://your-staging-app.example.com

# Run extended smoke test
node scripts/staging-smoke-extended.mjs
```

### Running Manual Tests

**Critical Path 1 (Registration to Sale):**
1. Open staging URL in browser
2. Click "Kayıt Ol" to register new company
3. Fill company details and complete registration
4. Add a test product with initial stock (e.g., 100 units)
5. Navigate to "Hızlı Satış"
6. Add product to cart, complete sale as "Nakit"
7. Check Dashboard for revenue
8. Check "Ürünler" page for stock count

**Critical Path 2 (Billing Flow):**
1. Login as admin user
2. Navigate to "Abonelik" → "Paketi Yükselt"
3. Select a plan and proceed to payment
4. Complete Iyzico sandbox payment (use test card)
5. Verify redirect back to app
6. Check subscription status in database or UI
7. Verify only one subscription record exists

---

## Pass/Fail Criteria

**OVERALL STATUS:** ⏳ PENDING

**Automated Tests:** 0/7 passed
**Manual Tests:** 0/2 completed
**Total:** 0/9 passed

**Go/No-Go Decision:** ⏳ PENDING
- All 4 critical paths must PASS before proceeding to Phase 6
- Any FAIL requires fix and re-test

---

## Issues Found

*Issues will be documented here as they are discovered during testing*

---

## Notes

- Tests require valid staging environment with Iyzico sandbox configured
- Critical Paths 1 and 2 require manual browser interaction
- Critical Paths 3 and 4 can be automated via API calls
- Test results should be updated after each execution
