# Staging deployment preparation — launch execution (current repo)

**Durum:** Repo kararı kapatıldı (mevcut monorepo, `dist` commit yok, üretim kaynaktan build). **Yapı yok, özellik yok** — yalnız **canlı staging** yürütmesi.

**Yapı taşları:** bu repo + **Cloudflare (DNS/SSL/proxy)** + **Neon (staging DB)** + **seçtiğiniz hosting** (API + static).  
**Tek doğruluk (frontend):** `docs/FRONTEND_BUILD_AND_DEPLOY.md`.

---

## 0) Ön koşul (repo)

- `pnpm run ci:gate` yeşil (gizli yok, `.env` ile `DATABASE_URL` önerilir).
- Deploy edeceğiniz **commit/branch** etiketli (izlenebilirlik).

---

## 1) Doldurulacak alan (founder — bir kez)

| Alan | Sizin değeriniz | Not |
|------|------------------|-----|
| Kök alan (apex) | `____________` | Örn. `ticarium365.com` |
| Staging app URL (hedef) | `https://app.staging.<domain>` | |
| Staging API URL (hedef) | `https://api.staging.<domain>` | |
| **Hosting — API** (ürün adı) | `____________` | Fly / Render / Railway / VPS / … |
| **API’ye giden CNAME hedefi** (hostname) | `____________` | Cloudflare CNAME = bu değer |
| **Hosting — static (UI)** | `____________` | Aynı PaaS static veya Pages / S3+CF |
| **Static CNAME hedefi** | `____________` | `app.staging` buraya |
| Neon staging proje/DB adı | `____________` | Production ile **farklı** instance |

---

## 2) Neon (staging) — sıra

1. Yeni proje veya ayrı database; **yalnız** staging.
2. Connection string’i kopyala → güvenli not (repoya yok).
3. Yerel makinede, geçici ortam:  
   `DATABASE_URL=<staging> pnpm -C lib/db run migrate:sql`  
4. Aynı URL ile: `pnpm run ci:gate` (doğrulama).

*Detay:* `STAGING_DEPLOY_EXECUTION.md` §4, `WEEK1_LAUNCH_FOUNDATION_REPORT.md` §3.

---

## 3) Cloudflare — DNS + SSL (staging)

1. Zone aktif; NS yayılımı tamam mı kontrol.
2. Kayıt:
   - `app.staging` → CNAME → **§1’deki static hedef** (proxy **açık**).
   - `api.staging` → CNAME → **§1’deki API hedefi** (proxy **açık**).
3. SSL/TLS: **Full (strict)**.
4. Kural: `api.staging.<domain>/*` → **Cache: Bypass** (veya eşdeğer).

*Detay:* `STAGING_PRODUCTION_EXECUTION_RUNBOOK.md` §1, `STAGING_DEPLOY_EXECUTION.md` §5.

---

## 4) API (staging) — env

`.env.staging.example` kopyasını doldurun; **panelde** girin (kök dosyaya gizli commit yok).

**Kritik eşleşmeler (hata = login/smoke kırık):**

- `CORS_ALLOWED_ORIGINS` = `https://app.staging.<domain>` (tam string).
- `SESSION_COOKIE_DOMAIN` = `.staging.<domain>`.
- `TRUST_PROXY=1`, `SESSION_BEHIND_PROXY=1` (Cloudflare önünde).
- `PORT` = host’un dinlediği (çoğu `8080`).

*Detay:* `WEEK1_LAUNCH_FOUNDATION_REPORT.md` §4, `STAGING_DEPLOY_EXECUTION.md` §3.

---

## 5) API deploy (hosting)

- Bu repodan: `pnpm -C artifacts/api-server run build` → `artifacts/api-server/dist/index.mjs` (veya host’unize göre `start`).
- `PORT` + tüm env **çalışma ortamında** set.
- **Canlı test:** `curl -fsS https://api.staging.../api/healthz` → 200 JSON.

---

## 6) UI build + yayın (kaynak)

```bash
set VITE_API_BASE_URL=https://api.staging.YOURDOMAIN.com
pnpm -C artifacts/prosan run build
```

- Yayın: **`artifacts/prosan/dist/public/**` → static host (§1).

*Detay:* `FRONTEND_BUILD_AND_DEPLOY.md`.

---

## 7) Duman (zorunlu)

PowerShell (örnek):

```powershell
$env:SMOKE_APP_URL="https://app.staging.YOURDOMAIN.com"
$env:SMOKE_API_URL="https://api.staging.YOURDOMAIN.com"
$env:SMOKE_ORIGIN="https://app.staging.YOURDOMAIN.com"
pnpm run smoke:staging
```

Tüm maddeler **PASS** → staging URL **GO**.

---

## 8) GO / NEED_INPUTS (bu aşamada)

| | |
|--|--|
| **GO** | `healthz` 200, smoke **exit 0**, tarayıcıda `app.staging` açılıyor, login dumanı (test kullanıcı) mantıklı. |
| **NEED_INPUTS** | Eksik domain, eksik CNAME hedefi, staging Neon URL, hosting hesabı, Iyzico sandbox (checkout dumanı istenirse). |

**Sonraki round** (zaten yazılı): `FINAL_LAUNCH_EXECUTION_ROUNDS.md` — Iyzico sandbox, Sentry, vb.

---

**İlgili (tek seferde okuma seti):** `STAGING_DEPLOY_EXECUTION.md` · `WEEK1_LAUNCH_FOUNDATION_REPORT.md` · `PRODUCTION_READINESS_CHECKLIST.md` (§8, ci:gate) · `FRONTEND_BUILD_AND_DEPLOY.md`
