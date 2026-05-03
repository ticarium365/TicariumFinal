# Monitoring and Alerting Setup

**Status:** Configuration documented, requires manual setup in external services

---

## 1. Sentry Alerts

### Sentry Dashboard Configuration

#### Alert 1: New Issue Notification
**Type:** Issue Alert
**Trigger:** Any new issue created
**Actions:**
- Send to Slack channel: `#production-alerts`
- Send email: `ops@yourdomain.com`
- Priority: Immediate

**Setup in Sentry:**
1. Go to Settings → Alerts
2. Create new alert rule
3. Condition: "Issue is first seen"
4. Actions: Add Slack integration + Email notification

---

#### Alert 2: Error Rate Spike
**Type:** Metric Alert
**Trigger:** Error rate > 10 errors/minute
**Duration:** Over 5 minutes
**Actions:**
- Send to Slack channel: `#production-alerts`
- Send email: `ops@yourdomain.com`
- Priority: High

**Setup in Sentry:**
1. Go to Settings → Alerts → Metric Alerts
2. Create new metric alert
3. Metric: `error rate`
4. Threshold: `> 10 errors/min`
5. Time window: `5 minutes`
6. Actions: Slack + Email

---

#### Alert 3: Release Tracking
**Environment Variable Setup:**
```bash
# Add to deployment pipeline
export RELEASE_VERSION=$(git rev-parse --short HEAD)
```

**Sentry Configuration:**
```typescript
// In artifacts/api-server/src/index.ts or app initialization
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.RELEASE_VERSION,
  tracesSampleRate: 0.1,
  // ... other config
});
```

**Setup in Sentry:**
1. Go to Settings → Releases
2. Enable release tracking
3. Configure deploy hooks for Slack notifications

---

## 2. Uptime Monitoring

### UptimeRobot Configuration (Free Tier)

#### Check 1: API Health Endpoint
**URL:** `https://api.yourdomain.com/api/healthz`
**Check Type:** HTTP(s)
**Check Interval:** Every 1 minute
**Alert Threshold:** Down for 2 consecutive checks
**Alert Contacts:**
- Email: `ops@yourdomain.com`
- Slack: `#production-alerts`

**Setup:**
1. Login to UptimeRobot
2. Create new monitor
3. Set URL to `https://api.yourdomain.com/api/healthz`
4. Select "HTTP(s)" type
5. Set interval to 1 minute
6. Add alert contacts

---

#### Check 2: App Frontend
**URL:** `https://app.yourdomain.com`
**Check Type:** HTTP(s)
**Check Interval:** Every 5 minutes
**Alert Threshold:** Down for 2 consecutive checks
**Alert Contacts:**
- Email: `ops@yourdomain.com`
- Slack: `#production-alerts`

**Setup:**
1. Create new monitor in UptimeRobot
2. Set URL to `https://app.yourdomain.com`
3. Select "HTTP(s)" type
4. Set interval to 5 minutes
5. Add alert contacts

---

### Alternative: Checkly (Better for API checks)

If using Checkly instead of UptimeRobot:

**API Check Configuration:**
```javascript
// checkly/api-health.check.js
const assert = require('assert');

async function browserCheck() {
  const response = await fetch('https://api.yourdomain.com/api/healthz');
  assert.equal(response.status, 200, 'API health check failed');
  
  const data = await response.json();
  assert.ok(data.status === 'ok', 'API health status not ok');
}

module.exports = browserCheck;
```

**Alert Configuration:**
- Check interval: 1 minute
- Alert on: Failure, degraded performance
- Notify: Slack, email

---

## 3. Database Monitoring

### Neon/Supabase Configuration

#### Enable Query Performance Insights

**For Neon:**
1. Go to Neon Console → Project → Monitoring
2. Enable "Query Performance Insights"
3. Set retention period (recommended: 7 days)

**For Supabase:**
1. Go to Supabase Dashboard → Database → Logs
2. Enable "Query Performance"
3. Configure slow query threshold (recommended: 5s)

---

#### Alert 1: Connection Count
**Trigger:** Connection count > 80% of limit
**Setup:**
- Neon: Set alert in Monitoring → Alerts
- Supabase: Set alert in Database → Settings → Alerts
- Threshold: 80% of max_connections
- Notification: Slack + email

---

#### Alert 2: Slow Queries
**Trigger:** Query duration > 5 seconds
**Setup:**
- Neon: Enable in Query Performance Insights
- Supabase: Enable in Query Performance
- Threshold: 5000ms
- Notification: Slack + email

---

#### Alert 3: Storage Usage
**Trigger:** Storage > 80%
**Setup:**
- Neon: Set alert in Project Settings → Alerts
- Supabase: Set alert in Database → Settings → Alerts
- Threshold: 80%
- Notification: Slack + email

---

### Database Connection Limits

**Check current limits:**
```sql
-- For PostgreSQL
SHOW max_connections;

-- Check current connections
SELECT count(*) FROM pg_stat_activity;
```

**Environment Variables:**
```bash
# Set connection pool size appropriately
DATABASE_POOL_SIZE=20
DATABASE_POOL_MAX=50
```

---

## 4. Log-Based Alerts

### Pino Configuration for Structured Logging

**Ensure Pino is configured to output structured logs:**
```typescript
// artifacts/api-server/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  // Add timestamp and hostname
  timestamp: pino.stdTimeFunctions.isoTime,
  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
  },
});
```

---

### Log Alert Configuration

#### Alert 1: Tenant Default Company Fallback
**Log Pattern:** `tenant_default_company_fallback_used`
**Severity:** CRITICAL
**Action:** Immediate Slack + email alert
**Reason:** Should NEVER appear in production

**Setup in Platform (e.g., Cloudflare Analytics, LogDNA, etc.):**
- Create log alert for pattern: `tenant_default_company_fallback_used`
- Alert immediately on match
- Send to `#production-alerts`

---

#### Alert 2: Billing Mock Usage
**Log Pattern:** `BILLING_ALLOW_MOCK`
**Severity:** CRITICAL
**Action:** Immediate Slack + email alert
**Reason:** Mock billing should not be used in production

**Setup:**
- Create log alert for pattern: `BILLING_ALLOW_MOCK`
- Alert immediately on match
- Send to `#production-alerts`

---

#### Alert 3: Tenant Session Mismatch
**Log Pattern:** `TENANT_SESSION_MISMATCH`
**Severity:** WARNING
**Threshold:** > 5 occurrences in 1 hour
**Action:** Slack alert
**Reason:** May indicate attack or configuration issue

**Setup:**
- Create log alert for pattern: `TENANT_SESSION_MISMATCH`
- Set threshold: > 5 in 1 hour
- Send to `#production-alerts`

---

#### Alert 4: 5xx Error Rate Spike
**Log Pattern:** HTTP 5xx status codes
**Metric:** Error rate > 1% over 5 minutes
**Severity:** HIGH
**Action:** Slack + email alert
**Reason:** Indicates server errors

**Setup:**
- Create metric alert for 5xx error rate
- Threshold: > 1%
- Time window: 5 minutes
- Send to `#production-alerts`

---

### Platform-Specific Setup

**For Cloudflare Analytics:**
1. Go to Analytics → Log Push
2. Enable log push to destination (e.g., Datadog, LogDNA)
3. Configure alerts in destination platform

**For LogDNA (now Quicktail):**
1. Create alert views for each pattern
2. Set thresholds and notification channels
3. Enable real-time alerting

**For Datadog:**
1. Create log monitors for each pattern
2. Set alert thresholds
3. Configure notification channels (Slack, email)

---

## 5. Business Metrics Dashboard

### Simple Manual Dashboard (Google Sheets / Notion)

#### Daily Metrics to Track

**Sheet Columns:**
- Date
- New Signups
- Active Sessions (peak concurrent)
- Sales Transactions
- Revenue (total)
- Revenue (average per transaction)
- Notes

---

#### Alert Threshold: Zero Sales

**Condition:** 0 sales in 24 hours during business hours
**Business Hours:** 9:00 AM - 6:00 PM (local time)
**Action:** Manual investigation required

**Setup:**
1. Create conditional formatting in spreadsheet
2. Highlight row if Sales Transactions = 0
3. Set up daily email reminder at 7:00 PM
4. Review if no sales occurred

---

### Automated Dashboard (Future Enhancement)

**Recommended Tools:**
- **Metabase** (Open source, self-hosted)
- **Grafana** (Open source, self-hosted)
- **Mixpanel** (SaaS, paid)
- **Amplitude** (SaaS, paid)

**SQL Queries for Metrics:**

```sql
-- Daily new signups
SELECT 
  DATE(created_at) as date,
  COUNT(*) as new_signups
FROM users
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Daily sales transactions
SELECT 
  DATE(created_at) as date,
  COUNT(*) as transactions,
  SUM(total_price) as revenue
FROM sales
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Active sessions (peak concurrent)
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(DISTINCT user_id) as active_users
FROM sessions
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

### Business Metrics Alert Setup

**For Automated Dashboards (Metabase/Grafana):**

**Alert: Zero Sales in 24h**
- Query: Daily sales count
- Condition: count = 0
- Time window: Last 24 hours
- Notification: Slack + email
- Schedule: Check every hour

**Alert: Revenue Drop > 50%**
- Query: Daily revenue
- Condition: revenue < (7-day average * 0.5)
- Time window: Last 24 hours vs previous 7 days
- Notification: Slack + email
- Schedule: Check daily at 7:00 PM

---

## Alert Channel Setup

### Slack Integration

**Create Slack Channel:**
- Channel name: `#production-alerts`
- Purpose: Production monitoring alerts
- Members: Ops team, on-call engineers

**Webhook URLs:**
- Sentry: Configure in Sentry → Settings → Slack
- UptimeRobot: Configure in UptimeRobot → Alert Contacts
- Log platform: Configure in platform → Notifications

---

### Email Distribution

**Recipients:**
- Primary: `ops@yourdomain.com`
- On-call: `oncall@yourdomain.com`
- Founder: `founder@yourdomain.com` (for critical alerts only)

**Email Groups:**
- `alerts@yourdomain.com` - All alerts
- `critical@yourdomain.com` - Critical alerts only
- `business@yourdomain.com` - Business metrics only

---

## Monitoring Checklist

### Before Launch

- [ ] Sentry alerts configured (new issue, error rate, release tracking)
- [ ] RELEASE_VERSION env var added to deployment pipeline
- [ ] Uptime monitors set up for API and app
- [ ] Database monitoring enabled (connections, slow queries, storage)
- [ ] Log-based alerts configured (4 patterns)
- [ ] Business metrics dashboard created
- [ ] Slack channel created and integrated
- [ ] Email distribution list configured
- [ ] Alert thresholds tested with synthetic errors

### Post-Launch

- [ ] Verify all alerts are firing correctly
- [ ] Tune alert thresholds based on false positives
- [ ] Review business metrics daily for first week
- [ ] Set up weekly monitoring review meeting
- [ ] Document incident response procedures

---

## Incident Response

### On-Call Rotation

**Setup:**
- Use PagerDuty or similar for on-call scheduling
- Primary on-call: 24/7 coverage
- Secondary on-call: Backup for escalation

**Escalation:**
- Level 1: Primary on-call (15 min response)
- Level 2: Secondary on-call (30 min response)
- Level 3: CTO/Founder (1 hour response)

---

### Runbook Template

**For Each Alert Type:**
1. Alert description
2. Severity level
3. Immediate actions
4. Investigation steps
5. Resolution procedures
6. Post-incident review requirements

---

## Notes

- All monitoring requires manual setup in external services (Sentry, UptimeRobot, database console, log platform)
- Start with simple manual dashboard for business metrics
- Automate business metrics when resources allow
- Review and tune alert thresholds regularly
- Document all incidents for post-mortem analysis
