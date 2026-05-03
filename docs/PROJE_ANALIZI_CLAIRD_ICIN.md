# Ticarium365 Proje Analizi - Claude İçin

**Tarih:** 2026-05-03
**Analiz Edilen:** Tüm proje yapısı, testler, dokümantasyon

---

## Proje Genel Durumu

### Teknik Stack
- **Backend:** Node.js, Express, Drizzle ORM, PostgreSQL (Neon/Supabase)
- **Frontend:** React, Vite, TailwindCSS, Radix UI
- **Test Frameworks:** Vitest (unit), Playwright (E2E), @testing-library/react (component)
- **Deployment:** Cloudflare, Railway/Render/Vercel options
- **Monitoring:** Sentry, UptimeRobot, log-based alerts
- **Billing:** Iyzico (Türk payment gateway)

### Mevcut Durum

**✅ Tamamlananlar:**
1. Backend unit tests (billing, sales, tenant boundary)
2. Component tests (Button, DataTable, Modal, Input)
3. E2E tests (POS sale, quote to order, user management)
4. Accessibility audit setup (axe-core)
5. Pre-launch gate documentation
6. Monitoring & alerting configuration
7. Rollback procedure documentation

**⏳ Bekleyenler (PowerShell execution policy nedeniyle):**
- pnpm install (vitest, @testing-library/react, @axe-core/playwright)
- Test execution
- CI gate execution
- Deployment gate execution

---

## Bugüne Kadarki Çalışmalar (Bu Oturumda)

### 1. Backend Unit Tests (Vitest)
**Dosyalar:**
- `artifacts/api-server/src/routes/billing/billing-iyzico-flow.test.ts`
- `artifacts/api-server/src/routes/sales.test.ts`
- `artifacts/api-server/src/middlewares/auth.test.ts`

**Kapsam:**
- Billing logic: checkout, idempotency, webhook signature, subscription activation, production mock guard
- Sale transaction: stock decrement, insufficient stock, multiple line items, transaction rollback
- Tenant boundary: session/company mismatch, super_admin access, user isolation

**Hedef:** >80% coverage on billing.ts and sales

---

### 2. Component Tests (Vitest + @testing-library/react)
**Dosyalar:**
- `artifacts/prosan/src/components/ui/button.test.tsx`
- `artifacts/prosan/src/components/ui/data-table.test.tsx`
- `artifacts/prosan/src/components/ui/modal.test.tsx`
- `artifacts/prosan/src/components/ui/input.test.tsx`

**Kapsam:**
- Button: text rendering, onClick, disabled state, loading state, variant CSS classes
- DataTable: column headers, row rendering, loading state, empty state, sorting, pagination
- Modal: children rendering, ESC close, overlay click close, content click prevention
- Input: error message, error border, onChange handling

---

### 3. E2E Tests (Playwright)
**Dosyalar:**
- `e2e/pos-sale.spec.ts`
- `e2e/quote-to-order.spec.ts`
- `e2e/user-management.spec.ts`
- `e2e/fixtures.ts`
- `playwright.config.ts`

**Kapsam:**
- POS sale flow: login → add product → set quantity → payment → confirm → verify revenue → verify stock
- Quote to order flow: create quote → save → convert to order → verify
- User management: admin invites staff → verify staff permissions

**Test Data:** Seeded tenant, product, customer, staff user

---

### 4. Accessibility Audit
**Dosyalar:**
- `e2e/accessibility.spec.ts`
- `docs/ACCESSIBILITY_AUDIT.md`

**Kapsam:**
- Automated axe-core checks on 5 priority screens (Login, Dashboard, POS, Ürünler, Satış Geçmişi)
- Keyboard navigation tests
- Manual checklists: screen reader compatibility, color contrast, data-testid requirements

---

### 5. Pre-launch Gate
**Dosyalar:**
- `docs/PRE_LAUNCH_GATE.md`
- `scripts/run-pre-launch-gate.ps1`

**6 Adım:**
1. CI gate (TypeScript + build + schema verification)
2. Deployment gate (env verification + build + schema)
3. All tests green (backend, frontend, E2E)
4. Staging smoke (automated + manual critical paths)
5. Security checklist (8 items)
6. Production smoke (post-deployment verification)

---

### 6. Monitoring & Alerting
**Dosyalar:**
- `docs/MONITORING_ALERTING.md`
- `scripts/set-release-version.sh`
- `scripts/set-release-version.ps1`

**Kapsam:**
- Sentry alerts (new issue, error rate spike, release tracking)
- Uptime monitoring (API health, app frontend)
- Database monitoring (connections, slow queries, storage)
- Log-based alerts (4 critical patterns)
- Business metrics dashboard (daily signups, sessions, sales, revenue)

---

### 7. Rollback Procedure
**Dosyalar:**
- `docs/ROLLBACK_PROCEDURE.md`

**Kapsam:**
- Rollback triggers (5 automatic + manual)
- Platform-specific rollback steps (Cloudflare, Docker, Kubernetes, Railway, Render, Vercel)
- Database rollback safety (safe vs unsafe migrations)
- Staging rollback test procedure
- Communication templates (4 scenarios)
- Post-rollback checklist

---

## Mevcut Sorunlar ve Engeller

### 1. PowerShell Execution Policy
**Sorun:** PowerShell script execution policy pnpm komutlarını engelliyor
**Etki:** Testler çalıştırılamıyor, CI gate çalıştırılamıyor
**Çözüm:**
- `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Veya Git Bash/WSL kullanma
- Veya Node.js doğrudan kullanma

### 2. TypeScript Hataları
**Sorun:** vitest, @testing-library/react, @axe-core/playwright modülleri bulunamıyor
**Neden:** pnpm install çalıştırılmadı
**Çözüm:** pnpm install çalıştırıldığında çözülecek

### 3. Test Verisi Seeding
**Sorun:** E2E testleri için seeded test verisi gerekiyor
**Gereksinim:**
- Test tenant (company) with known credentials
- Test product with known SKU and stock quantity
- Test customer
- Test staff user

---

## Yapılabilecekler - Öneriler

### Kısa Vadeli (Bu Hafta)

**1. Testleri Çalıştırma:**
```bash
# PowerShell execution policy değiştir
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Dependencies kur
pnpm install

# Backend tests
cd artifacts/api-server
pnpm test

# Frontend tests
cd artifacts/prosan
pnpm test

# E2E tests (staging URL gerekiyor)
cd ..
E2E_BASE_URL=https://staging.yourdomain.com \
E2E_ADMIN_EMAIL=admin@test-tenant.com \
E2E_ADMIN_PASSWORD=TestPassword123! \
pnpm exec playwright test
```

**2. CI Gate Çalıştırma:**
```bash
# Production DATABASE_URL gerekiyor
$env:DATABASE_URL="postgresql://user:pass@host:5432/db"
pnpm run ci:gate
```

**3. Staging Rollback Test:**
- staging'e deploy
- rollback yap
- healthz, login, sales history verify et
- sonuçları ROLLBACK_PROCEDURE.md'a kaydet

---

### Orta Vadeli (Bu Ay)

**1. Monitoring Setup:**
- Sentry alerts configure et
- UptimeRobot monitors kur
- Database monitoring enable et
- Log-based alerts setup et
- Business metrics dashboard oluştur

**2. Accessibility Manual Checks:**
- Keyboard navigation test et
- Screen reader compatibility test et (VoiceOver/NVDA)
- Color contrast ratios verify et
- data-testid attributes ekle

**3. Security Verification:**
- BILLING_ALLOW_MOCK_IN_PRODUCTION check
- SKIP_SCHEMA_VERIFY check
- SESSION_SECRET verify (64+ chars)
- CORS_ALLOWED_ORIGINS verify (no wildcard)
- Iyzico mode verify (LIVE)

---

### Uzun Vadeli (Bu Çeyrek)

**1. Test Coverage Artırma:**
- Backend coverage >80% hedefini gerçekleştir
- Component coverage artır
- E2E test senaryolarını genişlet

**2. Automation:**
- Pre-launch gate script'i tam otomatik hale getir
- Deployment pipeline'a entegre et
- Monitoring alerts otomatik trigger et

**3. Documentation:**
- Tüm dokümantasyonu güncel tut
- Runbook'ları complete et
- On-call rotation kur

---

## Riskler

### Yüksek Risk
1. **PowerShell execution policy** - Testler çalıştırılamıyor
2. **Production deployment** - Rollback test edilmemiş
3. **Monitoring setup** - Manual configuration gerekiyor

### Orta Risk
1. **Test coverage** - Hedefe ulaşılmadı (testler çalıştırılmadı)
2. **Accessibility** - Manual checks pending
3. **Security checklist** - Verification pending

### Düşük Risk
1. **Documentation** - Complete
2. **Rollback procedure** - Documented (test pending)

---

## Claude İçin Karar Noktaları

### 1. Test Execution Strategy
**Seçenek A:** PowerShell execution policy değiştir ve testleri çalıştır
**Seçenek B:** Git Bash/WSL kullan
**Seçenek C:** Manuel test execution planla (devops team'a devret)

**Öneri:** Seçenek A (en hızlı çözüm)

---

### 2. Staging Environment
**Soru:** Staging URL ve credentials mevcut mu?
**Eğer yoksa:** Test verisi seeding gerekiyor
**Öneri:** Staging environment'ı hazırla, sonra E2E testleri çalıştır

---

### 3. Production Deployment
**Soru:** Production deployment ne zaman planlanıyor?
**Ön koşul:**
- CI gate ✓
- Deployment gate ✓
- All tests green ✓
- Staging smoke ✓
- Security checklist ✓
- Rollback test ✓

**Öneri:** Tüm gate'leri geçtikten sonra deploy

---

### 4. Monitoring Setup
**Soru:** External services (Sentry, UptimeRobot) kurulumu kim yapacak?
**Seçenekler:**
- DevOps team
- Founder/CTO
- External consultant

**Öneri:** DevOps team (en uygun)

---

## Özet

**Mevcut Durum:**
- ✅ Tüm testler yazıldı
- ✅ Tüm dokümantasyon hazır
- ⏳ Testler çalıştırılmadı (PowerShell block)
- ⏳ Monitoring kurulumu manual gerekiyor
- ⏳ Rollback test pending

**Kritik Yol:**
1. PowerShell execution policy değiştir
2. pnpm install
3. Testleri çalıştır
4. CI/Deployment gate çalıştır
5. Staging rollback test
6. Monitoring setup
7. Security verification
8. Production deploy

**Claude'den Beklenen:**
- Bu analiz üzerine karar ver
- Önceliklendirme yap
- Sonraki adımları belirle
- Riskleri değerlendir
- Timeline öner
