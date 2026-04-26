# WEEK 1 LAUNCH FOUNDATION REPORT

**Tarih:** 30 günlük launch modu — Hafta 1 (Foundation + staging canlı).  
**Kurallar:** `TECHNICAL_FREEZE_LIGHT.md`, `STRATEGIC_LAUNCH_CLASSIFICATION.md` — yalnız launch-kritik yürütme; yeni özellik yok.

**Aktif yürütme rehberi (staging, Cloudflare, Neon, hosting):** `docs/STAGING_DEPLOYMENT_PREPARATION.md`

---

## 1. Final recommended domain topology

| Ortam | Önerilen host | Rol |
|--------|----------------|-----|
| **Production (hedef)** | `https://app.<domain>` | Vite static (müşteri UI) |
| | `https://api.<domain>` | Node API (`PORT` zorunlu) |
| | `https://admin.<domain>` | İsteğe bağlı; şimdi **yok** — ileride ayrı panel veya `app` içi super-admin |
| **Staging (bu hafta)** | `https://app.staging.<domain>` | Staging UI — `CORS` + `SESSION_COOKIE_DOMAIN` şablonu buna göre (`.staging.<domain>`) |
| | `https://api.staging.<domain>` | Staging API |

**Pratik not:** Şu an kod ve `.env.staging.example` **staging** için `app.staging` / `api.staging` kalıbını kullanır. Production’da `app` / `api` apex veya alt alan; **aynı cookies/CORS mantığı** — `CORS_ALLOWED_ORIGINS` ve `SESSION_COOKIE_DOMAIN` gerçek hostlarla birebir eşleşmeli.

---

## 2. Cloudflare DNS checklist (staging)

*(Kopya — uygulama: Cloudflare paneli.)*

1. Zone: `<domain>` Cloudflare’e ekli; nameserver’lar güncel.
2. `app.staging` → **CNAME** → PaaS/static hedef (turuncu bulut **proxied**).
3. `api.staging` → **CNAME** → API sunucu hedefi (proxied).
4. SSL/TLS: **Full (strict)**.
5. **Cache:** `api.staging.<domain>/*` → **Bypass** (kural veya Page Rule eşdeğeri).
6. HTTPS: Always On, auto HTTPS rewrite açık.

Kaynak: `STAGING_PRODUCTION_EXECUTION_RUNBOOK.md` §1, `STAGING_DEPLOY_EXECUTION.md` §5.

---

## 3. Neon staging / prod ayrımı checklist

1. **İki ayrı** Neon project veya en azından **iki ayrı database/branch** — asla aynı `DATABASE_URL` staging + prod.
2. Staging connection string **yalnız** staging API / CI secret.
3. Prod connection string **yalnız** prod host.
4. `sslmode=require` (veya Neon önerisi).
5. Staging’de: `pnpm -C lib/db run migrate:sql` sonra `pnpm run ci:gate` (staging URL ile).

Kaynak: `STAGING_DEPLOY_EXECUTION.md` §4, `STAGING_PRODUCTION_EXECUTION_RUNBOOK.md` §2.

---

## 4. Staging — gerekli env matrisi (eksiksiz şablon)

**Kaynak dosya:** repo kökü `.env.staging.example` — aşağısı “doldurulması zorunlu / hafta 1’de netleşmeli” özeti.

| Değişken | Staging beklentisi | Hafta 1 |
|----------|---------------------|---------|
| `NODE_ENV` | `production` (stack testi için) | Zorunlu |
| `PORT` | `8080` veya host’un verdiği | Zorunlu — **API `index.ts` PORT yoksa process çöküyor** |
| `DATABASE_URL` | Neon staging | Zorunlu (Neon’dan) |
| `SESSION_SECRET` | ≥32 char, prod’dan farklı | Zorunlu |
| `TRUST_PROXY` / `SESSION_BEHIND_PROXY` | `1` (Cloudflare önünde) | Zorunlu |
| `SESSION_COOKIE_SAMESITE` | `none` (app/api farklı host) | Zorunlu |
| `SESSION_COOKIE_DOMAIN` | `.staging.<domain>` | Zorunlu — **gerçek domain ile** |
| `CORS_ALLOWED_ORIGINS` | Tam: `https://app.staging.<domain>` | Zorunlu |
| `VITE_API_BASE_URL` | **Build-time** — `https://api.staging.<domain>` | Zorunlu (frontend build) |
| `RELEASE_VERSION` | `staging-YYYY-MM-DD-001` | Zorunlu (izlenebilirlik) |
| `IYZICO_*` + `IYZICO_MODE` | `sandbox` + sandbox keys | **Ödeme dumanı için hafta 1 sonuna**; yoksa checkout kapalı kalır (kabul / sonra) |
| `SENTRY_DSN` | Staging proje (boş bırakılabilir) | İsteğe bağlı; `ci:gate` kırılmaz |
| `STORAGE_DRIVER` + `R2_*` | R2 doldur veya replit yolu | Dosya yükleme dumanı istenirse; yok runbook’ta not |
| SMTP / NetGSM | İsteğe bağlı | E-posta/SMS dumanı için |

**Kullanma:** `ci:deploy` **staging’de gerek yok** — o `verify-production-env` (SENTRY zorunlu vb.); staging için `pnpm run ci:gate` yeterli.

---

## 5. Codebase deploy varsayımları (doğrulandı)

| Varsayım | Durum |
|------------|--------|
| Node **20.10+** | `package.json` `engines` |
| **pnpm** workspace | Kök + `artifacts/*` |
| API: `node` → `dist/index.mjs` (esbuild bundle) | `artifacts/api-server` `build.mjs` |
| **`PORT` zorunlu** | `index.ts` throw |
| Vite **prod build:** `VITE_API_BASE_URL` tam API URL (tarayıcı doğrudan API’ye gider) | `vite.config` yorumu |
| Şema: `lib/db` migrate + `verify-production-schema.mjs` | `ci:gate` parçası |
| **Dockerfile yok** — PaaS’te `node dist/index.mjs` + env | Host sizin seçiminiz (Fly, Render, VPS, Replit, …) |

---

## 6. İlk staging deploy runbook (bu repoya göre)

1. Neon staging `DATABASE_URL` al.
2. Staging host env paneline §4 matrisini gir (Iyzico/SMTP sonra olabilir).
3. `pnpm -C lib/db run migrate:sql` (staging URL ile).
4. Repo: `pnpm run ci:gate` (yeşil).
5. API deploy: build çıktısı + `PORT` + env.
6. Frontend: `VITE_API_BASE_URL=https://api.staging... pnpm -C artifacts/prosan run build` → static’i `app.staging`’e yükle.
7. Cloudflare DNS + SSL.
8. `SMOKE_APP_URL` / `SMOKE_API_URL` / `SMOKE_ORIGIN` → `pnpm run smoke:staging`.

Ayrıntı: `STAGING_DEPLOY_EXECUTION.md`, `STAGING_PRODUCTION_EXECUTION_RUNBOOK.md` §3.1.

---

## 7. Preflight (bu ortamda çalıştırıldı / çalıştırılabilir)

| Kontrol | Sonuç |
|---------|--------|
| `pnpm run ci:gate` (`.env` ile `DATABASE_URL` varsa) | **OK** (tsc, api build, verify-production-schema OK) |
| `pnpm -C artifacts/prosan run build` | **OK** (Vite prod build; staging için `VITE_API_BASE_URL` env ile tekrar) |
| `pnpm run smoke:staging` | **Sunucu URL’i olmadan anlamsız** — deploy sonrası zorunlu |

**Blok not:** Şema script’i `DATABASE_URL` istiyor; olmadan `ci:gate` şema adımı fail olur.

---

## 8. Durum: GO / BLOCKED / NEED_INPUTS

| Durum | Açıklama |
|--------|-----------|
| **GO (repo)** | Kod derleniyor, gate şeması (DB bağlıyken) yeşil; runbook’lar mevcut. |
| **NEED_INPUTS (canlı staging)** | Gerçek `<domain>`, Cloudflare, Neon staging URL, hosting hedefi, build-time env. |
| **BLOCKED (harici olmadan)** | Public `https://app.staging.*` açılması **DNS + host** olmadan mümkün değil. |

Stratejik sınıf: yukarıdakilerin tamamı **MUST (launch yürütme)**; yeni ürün özelliği yok.

---

# Ready now

- Monorepo build path ve `ci:gate` tanımı
- Staging/prod ayrımı, DNS, env şablonları (`.env.staging.example`, `STAGING_DEPLOY_EXECUTION.md`, runbook)
- `smoke:staging` betiği
- `STRATEGIC` + `FREEZE` kuralları yazılı
- API için **PORT** ve CORS/çerez kurallarının dokümante olması

---

# Missing founder inputs (kesin liste)

1. **Kök alan adı** (`<domain>`) — Ticarium365’in satılacağı üretim markası.
2. **Domain registrar** erişimi veya en azından **Cloudflare** hesabına zone ekleme / NS güncelleme.
3. **Cloudflare** içinde: staging CNAME’lerin gideceği **hedef hostname** (PaaS’ten: örn. `xxx.fly.dev`, `onrender.com` URL’si, veya IP/CNAME).
4. **Hosting kararı (staging):**  
   - API: Node süreç nerede koşacak?  
   - UI: static dosyalar nerede? (tek PaaS’ta ikisi de olabilir; ayrı da.)
5. **Neon:** Staging proje/DB oluşturuldu mu — **connection string** (sadece güvenli kanaldan; repoya yok).
6. **(Hafta 1 bitişe doğru)** Iyzico **sandbox** API key/secret/merchant (ödeme dumanı için).
7. **(Paralel veya hemen sonra)** Sentry DSN (staging) — opsiyonel; prod için launch öncesi `PRODUCTION_READINESS` ile hizala.
8. **SMTP** (test mail) / **NetGSM** (SMS OTP) — en az biri, kayıt dumanı için; yoksa akışlarda sınırlama bilinir.

---

# Risks (kısa)

- **`SESSION_COOKIE_DOMAIN` yanlış** → login çapraz hostta kırılır.  
- **CORS** tam eşleşmezse smoke **FAIL**.  
- **Staging=prod DB** → **red line**; veri sızıntısı.  
- **Iyzico yok** → faturalandırma dumanı yok; closed-beta’da “nasıl test ederiz” net söyle.  
- **PORT unutulduğu** an API ayağa kalkmaz.

---

# Exact next actions (1-2-3-4)

1. **Kök domain + Cloudflare** — zone, staging için `app.staging` / `api.staging` CNAME hedeflerini PaaS’tan aldıktan **sonra** ekle.  
2. **Neon staging** + `DATABASE_URL` → staging secret → `migrate:sql` + `ci:gate`.  
3. **API deploy** (env + `PORT`) + **UI build** (`VITE_API_BASE_URL`) + static deploy.  
4. **`pnpm run smoke:staging`** — PASS olana kadar CORS/SSL düzelt.

---

# En hızlı yol: bu hafta public staging URL

1. PaaS’ta **tek** servis: API’yi ayağa kaldır (geçici URL ile): `https://<temp>/api/healthz` = 200.  
2. Aynı PaaS veya static hostta UI build’i yükleyin.  
3. **Cloudflare’de** CNAME: `app.staging` / `api.staging` → bu hedeflere bağlayın.  
4. `SESSION_*` + `CORS`’u **gerçek** `app.staging` / `api.staging` ile güncelleyin, **yeniden build + redeploy** (en sık hata: env değişti ama front yeniden build edilmedi).  
5. Smoke.

**Gün sayısını yutan şey** genelde: domain/NS, sonra env/build uyumu — kod değil.

---

*Bu rapor, `PRODUCTION_READINESS_CHECKLIST.md`, `FINAL_LAUNCH_EXECUTION_ROUNDS.md`, `STAGING_PRODUCTION_EXECUTION_RUNBOOK.md` ve `STAGING_DEPLOY_EXECUTION.md` ile uyumludur.*
