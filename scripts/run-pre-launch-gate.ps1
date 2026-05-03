# Pre-Launch Gate Execution Script
# Run this script to execute all pre-launch gate checks
# This script requires PowerShell with execution policy RemoteSigned or higher

param(
    [string]$DatabaseUrl,
    [string]$StagingBaseUrl,
    [string]$StagingApiUrl,
    [string]$E2EAdminEmail,
    [string]$E2EAdminPassword
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Pending {
    param([string]$Message)
    Write-Host "⏳ $Message" -ForegroundColor Yellow
}

$RootDir = Split-Path -Parent $PSScriptRoot

Write-Step "Pre-Launch Gate Execution"

# Check required parameters
if (-not $DatabaseUrl) {
    Write-Fail "DATABASE_URL parameter is required"
    Write-Host "Usage: .\scripts\run-pre-launch-gate.ps1 -DatabaseUrl 'postgresql://...' -StagingBaseUrl 'https://...'"
    exit 1
}

# Step 1: CI Gate
Write-Step "Step 1 — CI Gate"
$env:DATABASE_URL = $DatabaseUrl
try {
    Push-Location $RootDir
    pnpm run ci:gate
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "CI Gate passed"
    } else {
        Write-Fail "CI Gate failed"
        exit 1
    }
} catch {
    Write-Fail "CI Gate error: $_"
    exit 1
} finally {
    Pop-Location
}

# Step 2: Deployment Gate
Write-Step "Step 2 — Deployment Gate"
$env:NODE_ENV = "production"
try {
    Push-Location $RootDir
    pnpm run ci:deploy
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "Deployment Gate passed"
    } else {
        Write-Fail "Deployment Gate failed"
        exit 1
    }
} catch {
    Write-Fail "Deployment Gate error: $_"
    exit 1
} finally {
    Pop-Location
}

# Step 3: All Tests Green
Write-Step "Step 3 — All Tests Green"

# 3.1 Backend Vitest
Write-Host "Running backend Vitest..."
try {
    Push-Location "$RootDir\artifacts\api-server"
    pnpm test
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "Backend tests passed"
    } else {
        Write-Fail "Backend tests failed"
        exit 1
    }
} catch {
    Write-Fail "Backend tests error: $_"
    exit 1
} finally {
    Pop-Location
}

# 3.2 Frontend Vitest
Write-Host "Running frontend Vitest..."
try {
    Push-Location "$RootDir\artifacts\prosan"
    pnpm test
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "Frontend tests passed"
    } else {
        Write-Fail "Frontend tests failed"
        exit 1
    }
} catch {
    Write-Fail "Frontend tests error: $_"
    exit 1
} finally {
    Pop-Location
}

# 3.3 Playwright E2E (if staging URL provided)
if ($StagingBaseUrl -and $E2EAdminEmail -and $E2EAdminPassword) {
    Write-Host "Running Playwright E2E tests..."
    $env:E2E_BASE_URL = $StagingBaseUrl
    $env:E2E_ADMIN_EMAIL = $E2EAdminEmail
    $env:E2E_ADMIN_PASSWORD = $E2EAdminPassword
    try {
        Push-Location $RootDir
        pnpm exec playwright test --project=staging
        if ($LASTEXITCODE -eq 0) {
            Write-Pass "E2E tests passed"
        } else {
            Write-Fail "E2E tests failed"
            exit 1
        }
    } catch {
        Write-Fail "E2E tests error: $_"
        exit 1
    } finally {
        Pop-Location
    }
} else {
    Write-Pending "E2E tests skipped (staging credentials not provided)"
}

# Step 4: Staging Smoke
if ($StagingBaseUrl -and $StagingApiUrl) {
    Write-Step "Step 4 — Staging Smoke"
    $env:SMOKE_BASE_URL = $StagingBaseUrl
    $env:SMOKE_API_URL = $StagingApiUrl
    try {
        Push-Location $RootDir
        node scripts/staging-smoke.mjs
        if ($LASTEXITCODE -eq 0) {
            Write-Pass "Staging smoke passed"
        } else {
            Write-Fail "Staging smoke failed"
            exit 1
        }
    } catch {
        Write-Fail "Staging smoke error: $_"
        exit 1
    } finally {
        Pop-Location
    }
} else {
    Write-Pending "Staging smoke skipped (staging URLs not provided)"
}

# Step 5: Security Checklist
Write-Step "Step 5 — Security Checklist"
Write-Pending "Manual verification required for security checklist items"
Write-Host "Please verify the following manually:" -ForegroundColor Yellow
Write-Host "  - No BILLING_ALLOW_MOCK_IN_PRODUCTION in production env"
Write-Host "  - No SKIP_SCHEMA_VERIFY in production env"
Write-Host "  - SESSION_SECRET is 64+ random chars"
Write-Host "  - CORS_ALLOWED_ORIGINS has no wildcard"
Write-Host "  - Iyzico mode is LIVE (not sandbox) on production"
Write-Host "  - Sentry DSN active and receiving test events"
Write-Host "  - API subdomains have Cloudflare cache bypass rules active"
Write-Host "  - SSL/TLS: Full (strict) on Cloudflare"

# Step 6: Production Smoke
Write-Step "Step 6 — Production Smoke"
Write-Pending "Production smoke requires actual deployment"
Write-Host "After deployment, verify:" -ForegroundColor Yellow
Write-Host "  - https://api.yourdomain.com/api/healthz → 200"
Write-Host "  - https://api.yourdomain.com/api/readyz → 200"
Write-Host "  - https://app.yourdomain.com → loads without error"
Write-Host "  - Login with founder account → dashboard loads"

# Final Decision
Write-Step "Gate Decision"
Write-Pass "Automated checks completed successfully"
Write-Host "Manual verifications required before GO decision" -ForegroundColor Yellow
Write-Host "Complete Step 4 manual critical paths" -ForegroundColor Yellow
Write-Host "Complete Step 5 security checklist" -ForegroundColor Yellow
Write-Host "Complete Step 6 production smoke after deployment" -ForegroundColor Yellow
