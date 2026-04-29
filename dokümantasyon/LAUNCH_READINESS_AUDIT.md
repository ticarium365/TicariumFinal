# Ticarium365 — Launch Readiness Audit

**Tarih:** 2026-04-25  
**Kaynak:** Kod tabanı incelemesi (`artifacts/api-server`, `artifacts/prosan`, `lib/db`, `.env.example`). Üretim Railway / Cloudflare / Neon **durumunu doğrudan doğrulayamadık** — aşağıdaki **RUNBOOK** ile canlı ortamda teyit edilmeli.

---

## 1. EXECUTIVE SUMMARY

Ürün **fonksiyonel olarak zengin** ve süper-admin tarafında **faturalama / trial / lead metrikleri** için ciddi bir cockpit var. Gerçek “custom domain + trafik” lansmanı öncesi **asıl operasyonel risk** (lansman öncesi): **e-posta = yalnızca SMTP** ve birçok akış **SMTP yoksa sessizce düşüyor** → güven ve destek maliyeti. **Oturumlar** artık **PostgreSQL (`connect-pg-simple`)** ile paylaşımlı; deploy sonrası çerez aynı kalırsa oturum korunur.

Ödeme tarafında kod, **production’da mock Iyzico’yu varsayılan olarak kapatıyor**; canlıda `IYZICO_*` dolu değilse checkout **bilinçli olarak kırılır** — bu iyi bir güvenlik kararı ama lansman öncesi env teyidi şart.

---

## 2. WHAT IS SAFE TO LAUNCH NOW

- **Temel web + API ayrımı** (Cloudflare Pages + Railway) mimari olarak uygun.
- **Tenant boundary** (`tenant` + `tenant-boundary`) kodda tanımlı; yanlış subdomain ile veri sızıntısını hedefleyen katman var.
- **Kayıt akışı** (`POST /auth/register/business`) trial şirket + abonelik satırı + oturum açma ile **tek transaction mantığında** bağlı.
- **Lead formu** (`POST /api/contact`) **DB’ye yazıyor**; süper admin listesi ve hub özeti var.
- **Süper-admin UI** (`/super-admin`, `/admin/*`) faturalama metrikleri ve funnel sinyalleri için **sahadan üstün** seviyede.
- **Sentry (backend)** entegrasyonu hazır; DSN konursa çalışır.

---

## 3. HARD BLOCKERS

| # | Blokaj | Gerekçe |
|---|--------|---------|
| H1 | **Ödeme env** | Production’da `IYZICO_API_KEY` + `IYZICO_SECRET_KEY` yoksa **gerçek tahsilat kapalı** (`billing-iyzico-flow.ts`). Lansman geliri için blokaj. |
| H2 | **Bootstrap süper admin** | Prod’da varsayılan kullanıcı seed **kapalı** (`SEED_DEFAULT_USERS` olmadan). İlk `superadmin` yoksa **kurucu paneline girilemaz** — tek seferlik bootstrap gerekir. |

---

## 4. FIX TODAY (highest ROI)

1. **Neon + Railway env:** `IYZICO_*`, `SMTP_*`, `SENTRY_DSN`, `SESSION_SECRET`, `SESSION_COOKIE_*` (app + api subdomain), `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`.
2. **Deploy sonrası oturum:** İlk deploy’da Neon’da `session` tablosunun oluştuğunu doğrula (`connect-pg-simple`). Eski MemoryStore oturumları geçersiz kalır — kullanıcılar bir kez yeniden giriş yapar.
3. **Super admin varlığı:** Neon’da `users` tablosunda `role = 'super_admin'` ve aktif hesap; yoksa `SEED_DEFAULT_USERS=1` **tek deploy** veya manuel INSERT + şifre rotate runbook.
4. **Talha girişi:** Aşağıdaki “Talha” bölümü — Neon’da `username`, `company_id`, `is_active`, tenant subdomain eşleşmesi kontrolü (5 dk).

---

## 5. FIX THIS WEEK

- **Resend** (veya Postmark): SMTP relay veya HTTP API — domain doğrulama, SPF/DKIM.
- **Frontend Sentry** (`@sentry/react` + `VITE_*`) — şu an prosan paketinde **Sentry yok**; sadece backend.
- İsterseniz `session` tablosunu tamamen migration ile yönetmek için `SESSION_STORE_CREATE_TABLE=0` + SQL migration (üretim disiplini).

---

## 6. FILES TO EDIT (referans)

| Konu | Dosya |
|------|--------|
| Trial metni / sabit | `artifacts/api-server/src/routes/auth.ts` (`TRIAL_DAYS`) |
| Session store (gelecek) | `artifacts/api-server/src/lib/session-config.ts`, `app.ts` |
| Billing prod guard | `artifacts/api-server/src/routes/billing/billing-iyzico-flow.ts` |
| SMTP | `artifacts/api-server/src/lib/email.ts` |
| Lead | `artifacts/api-server/src/routes/contact.ts` |
| User seed / Talha | `artifacts/api-server/src/index.ts` (`seedDefaultUsers`) |
| Founder metrikleri | `artifacts/prosan/src/pages/super-admin/index.tsx`, `subscriptions-admin-billing-metrics.ts` |
| Entegrasyon katalog etiketleri | `artifacts/api-server/src/lib/integration-hub-catalog.ts` |

---

## 7. ENV VARIABLES NEEDED

**Zorunlu (minimum canlı):**  
`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`, `PORT`, `TRUST_PROXY=1` (Cloudflare), `CORS_ALLOWED_ORIGINS`, R2 veya depolama sürücü değişkenleri (bkz. `.env.example`).

**Ödeme:**  
`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MODE` (production/sandbox), `IYZICO_MERCHANT_ID` (webhook doğrulama için).  
**Asla:** `BILLING_ALLOW_MOCK_IN_PRODUCTION=true` (sadece acil laboratuvar).  
**Asla:** `IYZICO_MODE=mock` (production validation’da yasak — `env-validation.ts`).

**Oturum çapraz alt alan:**  
`SESSION_COOKIE_SAMESITE=none`, `SESSION_COOKIE_DOMAIN=.ticarium365.com` (örnek), `SESSION_BEHIND_PROXY=1`.

**E-posta (önerilen):**  
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Resend SMTP veya kurumsal SMTP.

**SMS (opsiyonel):**  
`NETGSM_*`, `SMS_ALLOW_ENV_FALLBACK` (dikkatli).

**Gözlem:**  
`SENTRY_DSN`, `RELEASE_VERSION`, `VITE_API_BASE_URL` (Pages build).

**Tek seferlik bootstrap:**  
`SEED_DEFAULT_USERS=1` (sonra kapat ve şifreleri rotate et).

---

## 8. RISKS IF WE IGNORE

- **Neon `session` tablosu:** Oluşmazsa veya yetki yoksa API açılışta hata verir; deploy sonrası log ve DB kontrolü yapın.
- **E-posta yok:** Şifre sıfırlama ve doğrulama kodu gitmez; destek yükü patlar.
- **Iyzico eksik:** Ödeme butonu hata verir veya mock kapalıysa 503 — lansman günü gelir sıfır.
- **Super admin yok:** Şirket / lead / faturalama operasyonu kilitlenir.

---

## 9. QUICK WINS (< 2 hours)

- [x] Trial süresi **kodla hizalı metin** (`auth.ts` 21→30 gün uyumsuzluğu giderildi).
- [ ] `.env.example` veya Railway’de **checklist** clipboard — tüm `IYZICO_*` + `SMTP_*` bir arada.
- [ ] Neon’da **tek satır**: aktif `super_admin` sayısı + `talha` kullanıcı satırı.
- [ ] **Health:** `GET /api/healthz` Pages’tan veya uptime monitordan ping.

---

## 10. RECOMMENDED NEXT COMMAND

Yerel veya CI (şema + API derlemesi):

```bash
pnpm run ci:gate
```

Canlı sonrası:

```bash
curl -sS https://<API_HOST>/api/healthz
```

---

## PHASE 1 — CHECKLIST ÇIKTILARI

### 1) ADMIN ACCESS — **PARTIAL**

- **Süper admin kod yolu:** `requireSuperAdmin`, `POST /api/companies` (yeni tenant), süper-admin sayfaları mevcut.
- **Prod seed:** `index.ts` → production’da varsayılan kullanıcılar **yok** (`SEED_DEFAULT_USERS=1` gerekir).
- **Sonuç:** Kurucunun Neon + Railway üzerinde **en az bir `super_admin`** olduğunu doğrulaması şart. Yoksa **BLOCKED**.

---

### 2) USER REGISTRATION — **REGISTRATION_READY** (koşullu: **PARTIAL**)

- **Akış:** `register/business` → şirket `trial`, `pkg_trial_enterprise` (yoksa `pkg_starter`), abonelik satırı, doğrulama token, **session set**.
- **Trial süresi:** `TRIAL_DAYS = 30` (kod); kullanıcı mesajı buna göre güncellendi.
- **Doğrulama:** SMS veya e-posta — **SMTP / NetGSM yoksa** üretimde kod **gidemeyebilir**; kayıt yine de oluşur (kötü UX → **PARTIAL** sayılabilir).
- **Admin görünürlük:** `companies` + süper admin hub / firmalar ekranı (mevcut kod yapısı uygun).

---

### 3) AUTH — Talha — **ROOT_CAUSE_FOUND** (ortam teyidi gerekir)

Kod gerçekleri:

- Seed listesinde `talha` / `talha123` **tanımlı** ancak production’da **ilk seed** genelde çalışmamış olabilir.
- `seedDefaultUsers`: production’da **eksik kullanıcı ekler** ama **mevcut kullanıcı şifresini asla rehash etmez** (`!isProd` dalı). Yani **şifre drift** / manuel DB / farklı ortam → giriş başarısız.
- **Tenant:** Login `req.companyId` üzerinden çalışır; subdomain yanlış şirkete çözülüyorsa **401**.

**Fix:** Neon’da `SELECT id, username, role, company_id, is_active FROM users WHERE username='talha';` + ilgili `companies.subdomain`. Gerekirse süper admin `POST /users` veya şifre sıfırlama akışı / tek seferlik hash güncelleme **operasyonel** (burada DB erişimi olmadan kod “fix” yapılmadı).

---

### 4) EMAIL — **EMAIL_MISSING** (ortam) + **EMAIL_PROVIDER_RECOMMENDED**

| Akış | Kod | SMTP yoksa |
|------|-----|------------|
| Doğrulama kodu (e-posta) | `sendMail` | Gönderilmez; dev’de log uyarısı |
| Şifre sıfırlama | `sendMail` | Akış kırılabilir veya no-op |
| İletişim formu | DB insert | E-posta zorunlu değil |
| Billing “receipt” email | İş kuralına bağlı | Kontrol: billing modülleri |

**Öneri:** **Resend** (düşük maliyet, hızlı domain verify) veya **Postmark** (transactional güçlü). Mevcut kod **değişmeden** Resend SMTP ile çalışır; ileride HTTP API sarmalayıcı eklenebilir.

---

### 5) CONTACT / LEAD — **LEAD_FLOW_READY**

- **İletişim / demo talebi:** `POST /api/contact` → `contact_requests` tablosu `status=new`.
- **Süper admin:** `GET /api/contact/admin`, `/admin/summary` — hub’da sayaçlar.
- **B2B:** `satinalma-merkezi` içinde fallback `/contact` ile ek tipler — ana yol yine DB.

---

### 6) BILLING / IYZICO — **Ödeme env’ine göre: PAYMENT_READY veya SANDBOX_ONLY / BLOCKED**

- Kod: `getBillingProvider()` — anahtar yoksa **mock**; production + mock + allow flag yoksa **checkout/webhook reddedilir**.
- **RUNBOOK:** Railway’de `IYZICO_*` doldur, sandbox ile **gerçek callback** URL’lerini test et (`/api/billing/return`, webhook secret).

---

### 7) SESSION STORE — **SESSION_OK**

- `connect-pg-simple` + `DATABASE_URL` (Neon). Cookie ayarları değişmedi (`buildSessionOptions`).
- Varsayılan tablo: `session`. `SESSION_STORE_CREATE_TABLE=0` ile yalnızca migration ile tablo oluşturma (ileri seviye).

---

### 8) ERROR MONITORING — **SENTRY_READY** (backend, DSN varsa) **+ ENV_ONLY / MISSING**

- Backend: `SENTRY_DSN` → `@sentry/node`. Yoksa log: devre dışı.
- **Frontend:** `artifacts/prosan` içinde **Sentry paketi yok** → **MISSING** (istismar ve üretim hataları kör).

---

### 9) INTEGRATIONS HONESTY (katalog + gerçek implementasyon)

| Entegrasyon | Katalog `lifecycle` | **Brutal sınıf** | Not |
|-------------|---------------------|------------------|-----|
| Trendyol | `live` | **PILOT** | Stub/sandbox sağlayıcılar devrede olabilir; gerçek API SLA’sız sayın. |
| Hepsiburada | `pilot` | **PILOT** | |
| N11 | `pilot` | **PILOT** | |
| Paraşüt | `live` | **PILOT** | Entegrasyon derinliği tenant başı değişir; “live” = ürün hedefi, garanti değil. |
| SMS (NetGSM) | meta | **READY** (NetGSM) / **MOCK** | Sadece `mock` + `netgsm` `implemented: true`. |
| Kargo | `roadmap` | **COMING_SOON** | Adapter hazırlık metni. |
| E-belge / UBL XML | mock + Paraşüt vb. | **PILOT** | “XML” ayrı katalog yok; e-Fatura mock/test yolu var. |
| Iyzico ödeme | `pilot` | **READY** (env doluysa) | |

**UI önerisi (ürün yeniden tasarımı değil):** Sadece metin: “Pilot — canlıya geçmeden hesap doğrulayın” tooltip kaynağı: `integration-hub-catalog` içi `lifecycle`.

---

### 10) FOUNDER DASHBOARD — **FOUNDER_CONTROL_READY** (super admin erişimiyle)

Süper-admin hub’da: trial sayıları, ödeme başarı/hata, return redirect hataları, top-up fail, cohort, lead talepleri, B2B metrikleri — **kurucu kontrolü için yeterli**.

**Minimum cockpit eksikse:** sadece **tek sayfa** özet kartları (mevcut API’leri kullanarak) — yeni backend gerekmez; UI kısaltması.

---

## PHASE 2 — FIRST WEEK (yalnızca denetim notu)

- Onboarding **e-posta dizisi:** kodda otomatik drip **arama yapılmadı** — muhtemelen **yok** veya manuel; Resend + workflow önerilir.
- **Neon PITR / backup:** operasyon dokümanı + Neon konsol.
- **Analytics:** ürün içi event’ler var mı — ayrı audit; GA/Plausible env.
- **Rate limiting:** login, register, contact, billing — `app.ts` kısımları mevcut; yük testi.
- **Webhook retries:** pazaryeri worker’lar — queue davranışı ayrı playbook.
- **Churn:** trial bitiş + abonelik durumu — subscription route’ları; e-posta ile kapanış **ayrı iş**.

---

*Bu dosya `dokümantasyon/` altında yaşar; teknik derinlik için `docs/TEKNIK_DOKUMANTASYON.md` ve production checklist’e bakın.*
