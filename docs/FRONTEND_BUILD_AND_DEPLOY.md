# Frontend build and deploy — source of truth

**Tek doğruluk kaynağı:** `artifacts/prosan` içindeki **TypeScript + Vite kaynakları** (`src/`, `vite.config.ts`, …).

**Yanlış kaynak:** `artifacts/prosan/dist/**` — **repoya commit edilmez.** Üretim ve staging’de her deploy öncesi **yeniden** `pnpm -C artifacts/prosan run build` çalıştırılır.

---

## Neden

- Commit’li `dist`, kaynakla **ayrışır**; “hangi bundle canlıda?” belirsizliği ve merge çatışması oluşur.
- `scripts/verify-no-committed-prosan-dist.mjs` + `pnpm run ci:gate` — index’te `artifacts/prosan/dist` altında izlenen dosya **olmamalı**.

---

## Üretim / staging deploy adımı (frontend)

1. Ortam: `VITE_API_BASE_URL=https://api.<ortam>` (sonunda `/` yok).  
2. Derleme:

```bash
pnpm -C artifacts/prosan run build
```

3. Yayınlanacak dizin: **`artifacts/prosan/dist/public/`** (static dosyalar: `index.html`, `assets/*`).

4. Bu çıktıyı **static host**’a yükleyin (S3, Cloudflare Pages, PaaS static, vb.).

**Yerel:** `pnpm -C artifacts/prosan run dev` — Vite proxy ile API’ye gider; `dist` üretmez veya eski kalabilir; prod için **her zaman** `build` kullanın.

---

## Replit / örnek artifact

`artifacts/prosan/.replit-artifact/artifact.toml` içinde `services.production.build` zaten `pnpm … run build` çağırır; `publicDir` build sonrası üretilen `dist/public`’e işaret eder — **kaynak repoda dist yok**; deploy job build çalıştırmalıdır.

---

## `.gitignore`

`artifacts/prosan/dist/` ignore edilir; geliştirici makinesinde build sonrası klasör yerel kalabilir, **commit edilmez**.

---

**İlgili:** `docs/DEPLOYMENT_RUNBOOK.md`, `docs/STAGING_DEPLOY_EXECUTION.md`, `docs/LAUNCH_REPO_AUDIT.md`
