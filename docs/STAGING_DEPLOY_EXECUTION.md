# Staging deploy execution — Ticarium365

**Kapsam:** Technical Freeze Light — yalnızca gerçek staging’e açılma; özellik/refactor yok.  
**Şablon env:** [`.env.staging.example`](../.env.staging.example)  
**Otomatik smoke:** `pnpm run smoke:staging` → [`scripts/staging-smoke.mjs`](../scripts/staging-smoke.mjs)

---

## 1. Staging host topolojisi (öneri)

| Bileşen | Host (öneri) | Trafik | Not |
|---------|----------------|--------|-----|
| Web (Vite static) | `https://app.staging.YOURDOMAIN.com` | Cloudflare **proxied** (turuncu bulut) | Kullanıcı bu origin’i görür. |
| API (Node) | `https://api.staging.YOURDOMAIN.com` | Cloudflare **proxied** | Aynı Cloudflare account; API cache **kapalı** (aşağıda). |
| Veritabanı | Neon: ayrı proje veya ayrı DB | Doğrudan internetten yalnızca güvenli bağlantı | Production DB ile **asla** paylaşılmaz. |

`YOURDOMAIN` kök alan adınız; mümkünse `staging` alt alanı tek bir yerde toplanır (TLS ve çerez için tutarlı).

**Frontend ↔ API:** Tarayıcı `app.staging` üzerinden; `VITE_API_BASE_URL` build anında `https://api.staging...` olmalı (aşağıda mapping).

**Öneri:** Tek Cloudflare zone; `app` ve `api` staging için ayrı CNAME. Origin IP/host, kullandığınız PaaS’in verdiği hedefe gider (Fly, Replit, VPS, vb.).

---

## 2. Deploy sırası (order)

1. **Neon:** Staging veritabanı oluştur → connection string kopyala (aşağı Neon checklist).  
2. **Gizli yük:** Staging **API** host env paneline env’i gir (henüz DNS olmadan test etmek isterseniz sağlayıcının verdiği geçici URL ile de `healthz` denenebilir).  
3. **Cloudflare DNS:** `app.staging` ve `api.staging` CNAME’leri ekle; SSL **Full (strict)**.  
4. **Migration:** Aşağıdaki komutu **staging `DATABASE_URL` yüklü** shell’den çalıştır:  
   `pnpm -C lib/db run migrate:sql`  
5. **API deploy:** Aynı commit’ten `artifacts/api-server` build + start; `PORT` ve env hostta tanımlı.  
6. **Doğrulama (CI benzeri):** Yerelde veya CI’da: `pnpm run ci:gate` (staging `DATABASE_URL` ile). **Not:** `pnpm run ci:deploy` *production* gate’dir (`verify-production-env`); **staging first deploy** için zorunlu değil; `ci:gate` yeterli.  
7. **Frontend build + deploy:** `VITE_API_BASE_URL=https://api.staging...` ile `pnpm -C artifacts/prosan run build` → `artifacts/prosan/dist/public/` (repoya **commit yok**; bkz. `docs/FRONTEND_BUILD_AND_DEPLOY.md`) → static’i `app.staging` hostuna.  
8. **Smoke:** Bölüm 7.

**Hata ayıklama sırası:** `GET /api/healthz` (API) → `GET` `/` (app) → CORS (smoke) → login.

---

## 3. Env değişkeni eşlemesi (mapping)

| Amaç | Değişken(ler) | Staging beklentisi |
|------|----------------|-------------------|
| Public URL | (DNS) | `app.staging.*` / `api.staging.*` — env’de açık string olarak geçer |
| API tabanı (frontend build) | `VITE_API_BASE_URL` | `https://api.staging.YOURDOMAIN.com` (sonunda `/` yok) |
| DB | `DATABASE_URL` | Neon `postgresql://.../neondb?sslmode=require` (staging branch/DB) |
| Oturum | `SESSION_SECRET` | Uzun rastgele; prod’dan farklı |
| Proxy / çerez | `TRUST_PROXY=1`, `SESSION_BEHIND_PROXY=1` | Cloudflare önünde evet |
| Kiracı çerezi | `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_DOMAIN` | Genelde `none` + `.staging.YOURDOMAIN.com` (app ve api aynı üst alan) |
| CORS | `CORS_ALLOWED_ORIGINS` | **Tam eşleşme** `https://app.staging.YOURDOMAIN.com` (wildcard/localhost yok) |
| Iyzico | `IYZICO_*`, `IYZICO_MODE=sandbox` | Sandbox anahtarları |
| Sentry (opsiyonel) | `SENTRY_DSN` | Staging proje/DSN; yoksa API uyarı log’u, gate kırılmaz (`ci:gate` için) |
| R2 / depo | `STORAGE_DRIVER`, `R2_*` veya replit | Staging bucket veya ayrı prefix |
| Sürüm | `RELEASE_VERSION` | `staging-YYYY-MM-DD-001` gibi |

Tam liste ve boş bırakılanlar: [`.env.staging.example`](../.env.staging.example).

---

## 4. Neon — staging DB bağlantı checklist

| # | Adım | Tamam |
|---|------|--------|
| 1 | Yeni **staging** database veya ayrı Neon **project** (production’dan izole). | [ ] |
| 2 | Connection string’i **sadece** staging API / CI secret’ına koy. | [ ] |
| 3 | `sslmode=require` (veya Neon’ın önerdiği sıkı mod). | [ ] |
| 4 | `DATABASE_URL` ile `pnpm -C lib/db run migrate:sql` hatasız. | [ ] |
| 5 | Aynı URL ile `node scripts/verify-production-schema.mjs` ( `ci:gate` parçası) **OK** — `SKIP_SCHEMA_VERIFY=1` staging’de yalnız zorunlu hallerde, normale göre 0. | [ ] |

---

## 5. Cloudflare DNS checklist (staging)

| # | Adım | Tamam |
|---|------|--------|
| 1 | `app.staging` → frontend origin (CNAME). | [ ] |
| 2 | `api.staging` → backend origin (CNAME). | [ ] |
| 3 | Her ikisinde de **Proxy** açık; SSL **Full (strict)**. | [ ] |
| 4 | `api.staging.../*` için **Cache Rules: Bypass** (veya eşdeğer). | [ ] |
| 5 | Tarayıcıda `https` ile her iki host açılıyor; sertifika geçerli. | [ ] |

Ayrıntı: [STAGING_PRODUCTION_EXECUTION_RUNBOOK](STAGING_PRODUCTION_EXECUTION_RUNBOOK.md) bölüm 1.

---

## 6. İlk gerçek staging deploy — destek adımları (checklist)

Repo tarafı (yerel, staging DB URL yüklü):

```bash
# 1) Şema
pnpm -C lib/db run migrate:sql

# 2) Gate (tip + API build + şema doğrulama)
pnpm run ci:gate
```

**Host tarafı (örnek):** sağlayıcınızın “deploy API” + “upload static + env” adımlarını uygulayın; gizlileri repoya koymayın.

| # | Adım | Tamam |
|---|------|--------|
| 1 | Staging `DATABASE_URL` + session + CORS + Iyzico sandbox env API’de. | [ ] |
| 2 | API süreci dinliyor; `https://api.staging.../api/healthz` = **200** JSON. | [ ] |
| 3 | Frontend `VITE_API_BASE_URL` ile build; static `app.staging`’de. | [ ] |
| 4 | `https://app.staging.../` açılıyor. | [ ] |

---

## 7. Deploy sonrası smoke (zorunlu)

Aşağıdaki komut, repo kökünden çalışır; URL’leri kendi domain’inizle değiştirin.

**Bash (Git Bash / macOS / Linux):**

```bash
export SMOKE_APP_URL=https://app.staging.YOURDOMAIN.com
export SMOKE_API_URL=https://api.staging.YOURDOMAIN.com
export SMOKE_ORIGIN=https://app.staging.YOURDOMAIN.com
pnpm run smoke:staging
```

**Windows PowerShell:**

```powershell
$env:SMOKE_APP_URL="https://app.staging.YOURDOMAIN.com"
$env:SMOKE_API_URL="https://api.staging.YOURDOMAIN.com"
$env:SMOKE_ORIGIN="https://app.staging.YOURDOMAIN.com"
pnpm run smoke:staging
```

**Kontrol edilenler:** `healthz`, `readyz`, `/`, `/login`, `/api/auth/me` (401/403), CORS (Origin = app staging), korumalı abonelik ucu (401/403).  
Başarı: `All 7 smoke checks passed.` ve exit code **0**.

**Sık BLOCKED nedenleri:** CORS’da `CORS_ALLOWED_ORIGINS` tam olarak app origin ile eşleşmiyor; `SESSION_COOKIE_DOMAIN` app/api çiftini bozuyor; API yanlış hosta gidiyor; front eski `VITE_API_BASE_URL` ile build edildi.

---

## 8. GO / BLOCKED (durum)

| Durum | Koşul |
|--------|--------|
| **GO** | `https://app.staging...` ve `https://api.staging...` tarayıcıdan açılıyor; `GET /api/healthz` ve `GET /api/readyz` **200**; `pnpm run smoke:staging` **exit 0**; en az bir test kullanıcı ile manuel giriş (opsiyonel ama önerilir) sorunsuz. |
| **BLOCKED** | `healthz` / `readyz` 5xx veya DB kopuk; smoke **fail**; CORS/401 döngüsü; migration uygulanmamış; API prod DB URL’si; TLS/DNS hatalı. |

**Kayıt:** Staging URL’ler, deploy tarihi, `RELEASE_VERSION`, smoke çıktısı (kopya) — dahili not veya bilet.

---

**İlgili:** [TECHNICAL_FREEZE_LIGHT](TECHNICAL_FREEZE_LIGHT.md) · [FINAL_LAUNCH_EXECUTION_ROUNDS](FINAL_LAUNCH_EXECUTION_ROUNDS.md) (Round 3)
