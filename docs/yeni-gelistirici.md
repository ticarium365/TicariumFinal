# Yeni geliştirici — 1 sayfalık içe giriş

Bu sayfa, Ticarium365 monoreposunda ilk iş gününde ihtiyaç duyulan minimum bağlamı verir. Ayrıntı için [TEKNIK_DOKUMANTASYON.md](../docs/TEKNIK_DOKUMANTASYON.md) kullanın.

## Ne inşa ediyoruz?

**Ticarium365:** çok kiracılı (multi-tenant) iş yazılımı — stok, satış, finans, pazaryeri, abonelik, B2B ve süper-admin modülleri tek web uygulaması ve ortak API üzerinde.

## Repo yapısı (nerede ne var?)

| Bölüm | Yol | Rol |
|--------|-----|-----|
| Web UI | `artifacts/prosan/` | React 19, Vite 7, Wouter, TanStack Query, Tailwind |
| REST API | `artifacts/api-server/` | Express 5, session auth, Drizzle, özellik (feature) kapıları |
| Veri şeması | `lib/db/` | PostgreSQL, Drizzle şeması, SQL migration’lar |
| OpenAPI türevi istemci | `lib/api-client-react/` | React hook’lar (ör. `useGetMe`) |
| Doğrulama tipleri | `lib/api-zod/` | Paylaşılan Zod şemaları |
| Otomasyon scriptleri | `scripts/` | CI, şema doğrulama, smoke test vb. |

> **Not:** Paket adı `@workspace/prosan` tarihsel; ürün adı kullanıcıya **Ticarium365** olarak geçer.

## Önkoşullar

- **Node.js** 20.10+, **pnpm** (köke bakın: `package.json` `engines` ve `packageManager`)
- **PostgreSQL** ve kök `.env` içinde en azından `DATABASE_URL`, `SESSION_SECRET`  
- Tam liste: [TEKNIK §3](../docs/TEKNIK_DOKUMANTASYON.md#3-lokal-geliştirme)

## İlk çalıştırma (tipik)

```bash
# API (varsayılan ~8080, kök .env ile)
pnpm -C artifacts/api-server run dev

# Başka terminalde — frontend (varsayılan ~3000, Vite proxy /api)
pnpm -C artifacts/prosan run dev
```

`VITE_API_BASE_URL` lokalde API adresine işaret etmeli. Proxy ayrıntısı: `artifacts/prosan/vite.config.ts`.

## Güvenlik ve kiracı modeli (kısa)

1. İstek **tenant** olarak çözülür (`tenant` middleware — subdomain / host).
2. Cookie oturumu ile **tenant-boundary** şirket uyumu kontrol edilir.
3. Korumalı iş API’leri **`requireAuth`** ve çoğu modülde **`requireFeature`** ile paket yetkisine bağlanır.
4. Frontend tarafında **`AuthProvider`** + **`ProtectedRoute`**: `/me` doğrulanmadan kabuk sayfaları açılmaz; ayrıntı [TEKNIK dokümanı §6.3](../docs/TEKNIK_DOKUMANTASYON.md) (*Frontend oturum doğrulama* başlığı).

## Sık dokunulan dosyalar

- Rotalar (web): `artifacts/prosan/src/App.tsx`
- Oturum UI: `artifacts/prosan/src/components/auth-context.tsx`
- API giriş ve middleware sırası: `artifacts/api-server/src/app.ts`
- API route mount: `artifacts/api-server/src/routes/index.ts`
- Feature kodları: `lib/db/feature-codes` (projede import yolu `@workspace/db/feature-codes`)

## Kalite kapısı

```bash
pnpm run typecheck
pnpm run ci:gate
```

`ci:gate`, DB TypeScript derlemesi, API build, production şema doğrulaması ve **commit’lenmiş prosan dist olmaması** kontrolünü içerir.

## Sonraki okumalar

- [API yüzeyi özeti](./api-yuzeyi.md) — hangi önek nerede?
- [Frontend build / deploy](../docs/FRONTEND_BUILD_AND_DEPLOY.md)
- [Production checklist](../docs/PRODUCTION_READINESS_CHECKLIST.md)
