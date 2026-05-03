# Rollback Procedure

**Status:** ⏳ PENDING STAGING TEST
**Critical:** A rollback plan that has never been tested is not a rollback plan

---

## 1. When to Rollback

### Automatic Triggers

Rollback should be initiated immediately when any of the following conditions are met:

#### Trigger 1: Health Check Failure
**Condition:** `/api/healthz` or `/api/readyz` returns non-200 status for > 5 minutes
**Severity:** CRITICAL
**Action:** Immediate rollback

**Verification:**
```bash
# Check health endpoint
curl https://api.yourdomain.com/api/healthz
curl https://api.yourdomain.com/api/readyz

# Expected: {"status":"ok"} with HTTP 200
```

---

#### Trigger 2: Sentry Error Rate Spike
**Condition:** Sentry error rate > 50 new issues in 10 minutes
**Severity:** CRITICAL
**Action:** Immediate rollback if errors are related to recent deployment

**Verification:**
- Check Sentry dashboard for error spike
- Correlate with deployment timestamp
- If errors started after deployment → rollback

---

#### Trigger 3: Billing Transaction Failures
**Condition:** Billing transactions returning errors that were working before deployment
**Severity:** CRITICAL
**Action:** Immediate rollback

**Verification:**
```sql
-- Check recent billing errors
SELECT COUNT(*) as error_count
FROM payments
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '15 minutes';

-- If error_count > 0 and was 0 before deployment → rollback
```

**Iyzico-specific checks:**
- Check Iyzico dashboard for recent failures
- Verify API key configuration hasn't changed
- Check webhook signature validation

---

#### Trigger 4: Data Integrity Alert
**Condition:** Tenant boundary breach detected
**Severity:** CRITICAL
**Action:** Immediate rollback

**Verification:**
- Check logs for `TENANT_SESSION_MISMATCH` errors
- If > 10 mismatches in 5 minutes → rollback
- This indicates a critical security issue

---

#### Trigger 5: Database Connection Failures
**Condition:** Database connection pool exhausted or connection timeouts
**Severity:** CRITICAL
**Action:** Immediate rollback

**Verification:**
```sql
-- Check connection count
SELECT count(*) as active_connections
FROM pg_stat_activity;

-- If > 80% of max_connections → rollback
```

**Application logs:**
- Check for "connection pool exhausted" errors
- Check for "timeout acquiring connection" errors

---

### Manual Triggers

Rollback may also be initiated manually for:

- Performance degradation (response time > 5s for > 50% of requests)
- Feature regression (critical feature not working)
- User-reported critical issues
- Security concerns identified post-deployment

---

## 2. Rollback Steps

### Platform-Specific Instructions

**Note:** Fill in actual values for your hosting platform below.

---

### Step 1: Switch to Previous Deployment

#### Option A: Cloudflare DNS Rollback (if using DNS-based deployment)

**Command:**
```bash
# Via Cloudflare API or Dashboard
# Switch DNS records back to previous deployment IP/container
```

**Cloudflare Dashboard Steps:**
1. Login to Cloudflare Dashboard
2. Select domain: `yourdomain.com`
3. Go to DNS → Records
4. Update `api.yourdomain.com` A record to previous IP
5. Update `app.yourdomain.com` A record to previous IP
6. Wait for DNS propagation (typically 1-5 minutes)

**Verification:**
```bash
# Check DNS propagation
dig api.yourdomain.com
dig app.yourdomain.com

# Should resolve to previous deployment IP
```

---

#### Option B: Container Rollback (if using Docker/Kubernetes)

**Docker Compose:**
```bash
# SSH into server
ssh user@server.yourdomain.com

# Navigate to deployment directory
cd /var/www/ticarium

# Switch to previous container tag
docker-compose pull app:previous-tag
docker-compose up -d app

# Verify container is running
docker-compose ps
```

**Kubernetes:**
```bash
# Rollback deployment
kubectl rollout undo deployment/api-server

# Verify rollback
kubectl rollout status deployment/api-server
kubectl get pods
```

---

#### Option C: Railway/Render/Vercel Rollback

**Railway:**
1. Go to Railway Dashboard → Project
2. Select service
3. Click "Deployments" tab
4. Find previous successful deployment
5. Click "Redeploy" on that version

**Render:**
1. Go to Render Dashboard → Service
2. Click "Deploys" tab
3. Find previous successful deploy
4. Click "Redeploy"

**Vercel:**
1. Go to Vercel Dashboard → Project
2. Click "Deployments" tab
3. Find previous successful deployment
4. Click "..." → "Redeploy"

---

### Step 2: Verify Health Endpoint

**Command:**
```bash
curl -f https://api.yourdomain.com/api/healthz
curl -f https://api.yourdomain.com/api/readyz
```

**Expected Result:**
```json
{"status":"ok"}
```
HTTP status: 200

**If health check fails:**
1. Check application logs
2. Verify database connection
3. If still failing, investigate before proceeding

---

### Step 3: Verify Login Works

**Manual Test:**
1. Navigate to `https://app.yourdomain.com/login`
2. Enter known credentials
3. Verify successful login to dashboard

**Automated Test (if available):**
```bash
# Run login E2E test
E2E_BASE_URL=https://app.yourdomain.com \
E2E_ADMIN_EMAIL=admin@yourdomain.com \
E2E_ADMIN_PASSWORD=yourpassword \
pnpm exec playwright test e2e/user-management.spec.ts
```

**Expected Result:**
- Login page loads
- Credentials accepted
- Dashboard accessible
- No errors in browser console

---

### Step 4: Database Migration Rollback (if applicable)

**Important:** Not all migrations are safe to rollback. See Section 3 for details.

**If migration was safe to rollback:**
```bash
# Run rollback migration
cd artifacts/api-server
pnpm migrate:down

# Or specific migration
pnpm migrate:down:specific <migration-name>
```

**Verification:**
```sql
-- Check schema version
SELECT * FROM schema_migrations;

-- Verify expected schema state
\d table_name
```

**If migration was NOT safe to rollback:**
- Do not rollback database schema
- Rollback application code only
- Plan data migration to revert changes safely
- Document as "data migration required"

---

### Step 5: Notify Users (if downtime > 5 minutes)

**Use communication template from Section 5**

**Channels:**
- Status page (if configured)
- Email to all active users
- In-app banner
- Slack/Discord announcement

**Timing:**
- Notify immediately if downtime > 5 minutes
- Provide estimated resolution time
- Update every 15 minutes until resolved

---

## 3. Database Rollback Safety

### Migration Safety Assessment

**For each migration applied since last known-good state:**

#### Safe to Rollback (Can reverse immediately)

**Adding Columns:**
```sql
-- Example migration
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
```
**Rollback:** `ALTER TABLE users DROP COLUMN phone_number;`
**Safe:** ✅ Yes - dropping an added column is safe

**Adding Indexes:**
```sql
-- Example migration
CREATE INDEX idx_users_email ON users(email);
```
**Rollback:** `DROP INDEX idx_users_email;`
**Safe:** ✅ Yes - dropping an added index is safe

**Adding Tables:**
```sql
-- Example migration
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```
**Rollback:** `DROP TABLE audit_logs;`
**Safe:** ✅ Yes - dropping an added table is safe (if no critical data)

**Adding Constraints (CHECK, NOT NULL on new column):**
```sql
-- Example migration
ALTER TABLE products ADD CONSTRAINT check_positive_stock CHECK (stock >= 0);
```
**Rollback:** `ALTER TABLE products DROP CONSTRAINT check_positive_stock;`
**Safe:** ✅ Yes - dropping added constraint is safe

---

#### NOT Safe to Rollback (Requires data migration)

**Dropping Columns:**
```sql
-- Example migration
ALTER TABLE users DROP COLUMN old_field;
```
**Rollback:** Cannot simply re-add column - data is lost
**Safe:** ❌ NO - data migration required
**Action:** Restore from backup before deployment timestamp

**Dropping Tables:**
```sql
-- Example migration
DROP TABLE old_table;
```
**Rollback:** Cannot simply recreate table - data is lost
**Safe:** ❌ NO - data migration required
**Action:** Restore from backup before deployment timestamp

**Renaming Columns:**
```sql
-- Example migration
ALTER TABLE users RENAME COLUMN username TO user_name;
```
**Rollback:** Can rename back, but may break application if code expects new name
**Safe:** ⚠️ CAUTION - verify application compatibility
**Action:** Test rollback in staging first

**Changing Column Data Type (lossy conversion):**
```sql
-- Example migration
ALTER TABLE users ALTER COLUMN age TYPE INTEGER USING age::INTEGER;
```
**Rollback:** May lose data precision
**Safe:** ❌ NO - data loss possible
**Action:** Restore from backup before deployment timestamp

**Dropping Constraints (FOREIGN KEY, UNIQUE):**
```sql
-- Example migration
ALTER TABLE orders DROP CONSTRAINT fk_orders_user_id;
```
**Rollback:** Can re-add constraint, but may fail if data integrity violated
**Safe:** ⚠️ CAUTION - verify data integrity
**Action:** Check for orphaned records before rollback

---

### Migration Rollback Decision Tree

```
Migration Type
├── Add Column → Safe to rollback ✅
├── Add Index → Safe to rollback ✅
├── Add Table → Safe to rollback ✅ (if no critical data)
├── Add Constraint → Safe to rollback ✅
├── Drop Column → NOT SAFE ❌ (restore from backup)
├── Drop Table → NOT SAFE ❌ (restore from backup)
├── Rename Column → CAUTION ⚠️ (test in staging)
├── Change Data Type → NOT SAFE ❌ (restore from backup)
└── Drop Constraint → CAUTION ⚠️ (verify data integrity)
```

### Pre-Deployment Checklist

**Before deploying:**
- [ ] Review all migrations since last deployment
- [ ] Identify which are safe to rollback
- [ ] Identify which require data migration
- [ ] Document backup restore procedure for unsafe migrations
- [ ] Test rollback in staging environment

---

## 4. Staging Rollback Test

### Test Procedure

**Objective:** Verify rollback procedure works correctly before go-live

**Test Date:** ⏳ PENDING
**Tested By:** ⏳ PENDING
**Result:** ⏳ PENDING

---

#### Test Steps

**Step 1: Deploy Version N+1 to Staging**
```bash
# Deploy new version to staging
git checkout <new-version-tag>
pnpm deploy:staging

# Verify deployment
curl https://api-staging.yourdomain.com/api/healthz
```

**Expected:** Health endpoint returns 200

---

#### Step 2: Verify New Version Works
- Login to staging
- Create test sale
- Verify functionality

**Expected:** All features work correctly

---

#### Step 3: Trigger Rollback to Version N
```bash
# Execute rollback procedure
# Follow platform-specific steps from Section 2

# Example for DNS-based rollback:
# Switch staging DNS back to previous deployment
```

**Expected:** Rollback completes without errors

---

#### Step 4: Verify Rollback Success

**Check 1: Health Endpoint**
```bash
curl https://api-staging.yourdomain.com/api/healthz
```
**Expected:** `{"status":"ok"}` with HTTP 200

---

**Check 2: Login Works**
- Navigate to staging login
- Enter credentials
- Verify dashboard access

**Expected:** Login successful, dashboard loads

---

**Check 3: Sales History Accessible**
- Navigate to sales history page
- Verify historical data loads
- Verify no data loss

**Expected:** All historical sales visible

---

**Check 4: No Database Errors**
- Check application logs
- Verify no database connection errors
- Verify no migration errors

**Expected:** Clean logs, no errors

---

#### Test Results

**Status:** ⏳ PENDING EXECUTION

**Results:**
- [ ] Health endpoint after rollback: ⏳
- [ ] Login after rollback: ⏳
- [ ] Sales history accessible: ⏳
- [ ] Database errors: ⏳
- [ ] Rollback time: ⏳

**Overall Result:** ⏳

**Notes:**
```
(Pending test execution - document any issues encountered)
```

---

**Sign-off:**
- Tester: _______________
- Date: _______________
- Approved: ☐ Yes ☐ No

---

## 5. Communication Templates

### Template 1: Planned Maintenance

**Subject:** [Scheduled Maintenance] Ticarium System Update

**Body:**
```
Dear Ticarium Users,

We will be performing scheduled maintenance on [Date] from [Start Time] to [End Time] [Timezone].

During this time, the following services will be unavailable:
- Web application: https://app.yourdomain.com
- API services: https://api.yourdomain.com
- Mobile app (if applicable)

Expected downtime: [X] minutes

What to expect:
- You will not be able to access the application during maintenance
- Any unsaved work may be lost
- API calls will fail during maintenance window

We apologize for any inconvenience and appreciate your patience.

Best regards,
The Ticarium Team
```

**Status Page Message:**
```
Scheduled Maintenance
We are performing scheduled maintenance. Expected completion: [Time].
```

---

### Template 2: Unplanned Outage

**Subject:** [URGENT] Ticarium Service Outage

**Body:**
```
Dear Ticarium Users,

We are currently experiencing a service outage affecting:
- Web application: https://app.yourdomain.com
- API services: https://api.yourdomain.com

Our team is actively working to resolve the issue.

Current status: [Investigating / Fixing / Verifying]
Estimated resolution: [Time] or Unknown

We will provide updates every 15 minutes until resolved.

We apologize for the disruption and appreciate your patience.

Best regards,
The Ticarium Team
```

**Status Page Message:**
```
Service Outage
We are experiencing an outage. Our team is investigating.
Last updated: [Timestamp]
```

---

### Template 3: Partial Degradation

**Subject:** [Notice] Ticarium Service Degradation

**Body:**
```
Dear Ticarium Users,

We are currently experiencing partial service degradation affecting:
[Specific features affected, e.g., billing, sales reporting]

The following services are working normally:
- [Working features, e.g., login, product management]

Our team is actively working to resolve the issue.

Current status: [Investigating / Fixing / Verifying]
Estimated resolution: [Time] or Unknown

We apologize for the inconvenience and appreciate your patience.

Best regards,
The Ticarium Team
```

**Status Page Message:**
```
Partial Degradation
[Feature] is currently experiencing issues. Other services are operational.
Last updated: [Timestamp]
```

---

### Template 4: Rollback Complete

**Subject:** [Update] Ticarium Service Restored

**Body:**
```
Dear Ticarium Users,

We have successfully restored Ticarium services following a recent issue.

All services are now operational:
- Web application: https://app.yourdomain.com ✅
- API services: https://api.yourdomain.com ✅

If you experience any issues, please contact support at support@yourdomain.com.

We apologize for the disruption and appreciate your patience.

Best regards,
The Ticarium Team
```

**Status Page Message:**
```
All Systems Operational
All services are running normally.
```

---

### Communication Channels

**Primary Channels:**
- Email: all@yourdomain.com (for all users)
- Status page: https://status.yourdomain.com
- In-app banner (if application loads)

**Secondary Channels:**
- Slack/Discord: #announcements
- Twitter/X: @ticarium_status

**Internal Channels:**
- Slack: #production-alerts
- Email: ops@yourdomain.com

---

## 6. Post-Rollback Checklist

### Immediate Actions (After Rollback)

- [ ] Health endpoint returning 200
- [ ] Login functionality verified
- [ ] Critical features working (POS, sales, products)
- [ ] No database errors in logs
- [ ] Users notified (if downtime > 5 minutes)
- [ ] Status page updated

---

### Post-Incident Review (Within 24 Hours)

- [ ] Document root cause of failure
- [ ] Document what triggered rollback
- [ ] Evaluate rollback procedure effectiveness
- [ ] Identify improvements needed
- [ ] Update rollback procedure if needed
- [ ] Schedule team retrospective

---

### Improvement Actions

**If rollback took > 10 minutes:**
- Consider automating rollback triggers
- Improve deployment verification
- Add more granular health checks

**If rollback failed:**
- Update rollback procedure with lessons learned
- Add additional verification steps
- Test rollback procedure again in staging

**If communication was delayed:**
- Automate status page updates
- Pre-configure alert notifications
- Improve on-call escalation

---

## 7. Emergency Contacts

### On-Call Team

**Primary On-Call:**
- Name: _______________
- Phone: _______________
- Email: _______________

**Secondary On-Call:**
- Name: _______________
- Phone: _______________
- Email: _______________

**Escalation (CTO/Founder):**
- Name: _______________
- Phone: _______________
- Email: _______________

---

### Service Providers

**Cloudflare:**
- Support: https://support.cloudflare.com
- Emergency: _______________

**Database Provider (Neon/Supabase):**
- Support: _______________
- Emergency: _______________

**Hosting Provider:**
- Support: _______________
- Emergency: _______________

---

## 8. Rollback Procedure Summary

**Decision Matrix:**

| Condition | Action | Time to Execute |
|-----------|--------|-----------------|
| Health check failure > 5 min | Immediate rollback | 2-5 min |
| Sentry error rate spike | Investigate then rollback | 5-10 min |
| Billing failures | Immediate rollback | 2-5 min |
| Tenant boundary breach | Immediate rollback | 2-5 min |
| Database connection failure | Immediate rollback | 2-5 min |
| Performance degradation | Manual decision | Variable |

**Rollback Time Target:**
- Target: < 5 minutes from trigger to completion
- Maximum acceptable: 10 minutes

**Success Criteria:**
- Health endpoint returns 200
- Login functionality works
- Critical features operational
- No data loss
- Users notified (if applicable)

---

## Notes

- ⚠ **A rollback plan that has never been tested is not a rollback plan**
- Complete staging rollback test before go-live
- Update this document after each rollback incident
- Keep emergency contacts current
- Review and update this procedure quarterly
