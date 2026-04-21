# Replit → GitHub → Cursor Geçiş Rehberi

Bu doküman, projeyi Replit'ten GitHub'a aktarıp Cursor'da geliştirmeye devam etmek için izlenecek adımları içerir.

## 1. GitHub'a Aktarım (Replit içinden)

1. Sol panelde **Tools → Git** (veya Version Control) ekranını aç.
2. "Connect to GitHub" → hesabını yetkilendir.
3. "Create repository on GitHub" → private repo seç → push.

> **Önemli:** Bu adımdan ÖNCE bu repoda secret içeren bir dosya OLMADIĞINI doğruladık. Tüm secret'lar Replit'in "Secrets" panelinde tutuluyor — `git push` ile gitmezler. `.gitignore` dosyamız da `.env*` pattern'ini içeriyor.

## 2. Cursor'da Kurulum

```bash
git clone git@github.com:<KULLANICI>/<REPO>.git
cd <REPO>
pnpm install
cp .env.example .env
# .env dosyasını editör ile aç ve aşağıdaki "Secret Aktarımı" bölümüne göre doldur
```

## 3. Secret Aktarımı (Replit Secrets → Cursor `.env`)

Replit'te **Tools → Secrets** ekranını aç. Aşağıdaki anahtarların **değerlerini** sırayla "Show value" ile alıp `.env` dosyasına yapıştır:

| Replit Secret | .env Anahtarı | Notlar |
|---|---|---|
| `DATABASE_URL` | `DATABASE_URL` | Aşağıdaki "Veritabanı" bölümüne bak — Replit DB'sini lokalden de okuyabilirsin |
| `SESSION_SECRET` | `SESSION_SECRET` | Yeni de üretebilirsin: `openssl rand -hex 32` |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Sadece Replit'te çalışır |
| `PRIVATE_OBJECT_DIR` | `PRIVATE_OBJECT_DIR` | Sadece Replit'te çalışır |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `PUBLIC_OBJECT_SEARCH_PATHS` | Sadece Replit'te çalışır |

## 4. Veritabanı Stratejisi

Üç seçenek:

### Seçenek A — Replit DB'yi salt okunur dev DB olarak kullan (en hızlı)
Mevcut `DATABASE_URL`'i `.env`'e yapıştır → Cursor'dan direkt bağlanır. Replit kapalıyken DB de kapanır; sadece Replit aktifken kullanılabilir.

### Seçenek B — Neon'a taşı (önerilen, prod-ready)
1. https://neon.tech → ücretsiz hesap, yeni proje.
2. Replit shell'de:
   ```bash
   pg_dump "$DATABASE_URL" --no-owner --no-acl > backup.sql
   ```
3. Neon connection string'ini al, `pg_restore` veya `psql < backup.sql` ile import et.
4. `.env`'deki `DATABASE_URL`'i Neon URL'i ile değiştir.

### Seçenek C — Lokal Postgres + temiz seed
1. `brew install postgresql` (macOS) veya Docker.
2. Boş DB oluştur.
3. `pnpm --filter @workspace/db run db:push --force` → şema kurar.
4. Otomatik seed (default kullanıcı/plan) `NODE_ENV=development` + `SEED_DEFAULT_USERS=1` ile çalışır.

## 5. Lokal Çalıştırma

```bash
# API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (Vite)
pnpm --filter @workspace/prosan run dev

# Mobile (Expo, web preview)
pnpm --filter @workspace/smsystems-mobile run dev
```

## 6. Cursor'da Bilinmesi Gerekenler

### Replit'e özel — Cursor'da çalışmaz, sorun değil:
- `.replit`, `replit.nix` (NixOS config)
- `artifacts/*/artifact.toml` (Replit artifact registry)
- `.local/` klasörü (skill'ler, agent state — gitignored)
- Path-based routing (`/`, `/mobile`) — Replit preview pane içindi; production'da subdomain'lere ayır

### Object Storage
`@replit/object-storage` paketi sadece Replit'te çalışır. Cursor/lokal/prod ortamda dosya upload özellikleri test edilecekse, `artifacts/api-server/src/lib/objectStorage.ts` içindeki implementasyonu S3-uyumlu bir adapter ile değiştir (Cloudflare R2 veya AWS S3 önerilir).

## 7. Deployment Hedefleri (Replit Deployments yerine)

| Bileşen | Önerilen Hedef |
|---|---|
| API server (Express, long-running) | Railway · Fly.io · Render |
| Prosan web (Vite static + API proxy) | Vercel · Netlify · Cloudflare Pages |
| Mobile (Expo) | EAS Build (Expo Application Services) |
| PostgreSQL | Neon · Supabase · Railway |
| Object Storage | Cloudflare R2 · AWS S3 |

## 8. Hızlı Kontrol Listesi

- [ ] `.gitignore` `.env*` pattern'i içeriyor (✓ tamam)
- [ ] `.env.example` mevcut, tüm değişkenler dokümante (✓ tamam)
- [ ] Replit Secrets'taki 5 değer Cursor `.env`'ine kopyalandı
- [ ] DB stratejisi seçildi (A/B/C)
- [ ] `pnpm install` lokal makinede çalışıyor
- [ ] `pnpm --filter @workspace/api-server run dev` ayağa kalkıyor
- [ ] Login akışı (örn. `talha/talha123` veya `superadmin/superadmin123`) çalışıyor
- [ ] (İsteğe bağlı) Object Storage adapter S3'e geçirildi
- [ ] (İsteğe bağlı) Deployment hedefi seçildi ve CI/CD kuruldu
