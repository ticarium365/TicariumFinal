# Ticarium365 Naming Audit

Amaç: `Prosan/prosan/PROSAN` adının ürün kimliği olarak sızmasını engellemek ve gerçek ürün adını **Ticarium365** olarak sabitlemek.

## Özet

Ürün adı: **Ticarium365**

`Prosan` artık ürün adı değildir. Repo içinde hâlâ bazı teknik/workspace/demodata yerlerinde geçer:

- `artifacts/prosan`
- `@workspace/prosan`
- test tenant subdomain’i: `prosan`
- demo seed şirketi: `Prosan Endüstri`

Bu değerler bu turda bilinçli olarak yapısal davranış kırmamak için korunmuştur.

## 1. Safe Internal Technical Path

Şimdilik kalabilir:

- `artifacts/prosan`
- `@workspace/prosan`
- `.gitignore`: `artifacts/prosan/dist/` ignore (build çıktısı repoda tutulmaz) — bkz. `docs/FRONTEND_BUILD_AND_DEPLOY.md`
- `pnpm-lock.yaml` importer yolu
- `.replit-artifact/artifact.toml`
- internal import/path dokümantasyonlarında `artifacts/prosan`

Gerekçe:

- Workspace adı, pnpm lock, Replit artifact config, package filter, build scripts ve çok sayıda import/doküman referansı ile bağlıdır.
- Klasör/package rename düşük riskli değildir; ayrı branch ve tam CI ile yapılmalıdır.

## 2. Product-Facing Text

Düzeltildi:

- Public catalog ekranındaki `PROSAN ENDÜSTRİ` label’ları Ticarium365 demo katalog diline çevrildi.
- Public catalog iletişim e-postası `destek@ticarium365.com` olarak düzeltildi.
- Ürün export dosya adı `prosan-urunler-*` yerine `ticarium365-urunler-*` yapıldı.
- Yeni firma formundaki subdomain placeholder `prosan` yerine `ornek-firma` yapıldı.
- OpenAPI description `PROSAN ENDÜSTRİ ... API` yerine Ticarium365 API açıklamasına çevrildi; client/zod generated output yeniden üretildi.

## 3. Docs / Runbooks

Düzeltildi:

- `docs/TEKNIK_DOKUMANTASYON.md` içinde `artifacts/prosan` artık “legacy workspace adı” olarak açıklandı.
- `docs/FOUNDER_INTELLIGENCE_AND_BACKLOG_SYSTEMS.md` içinde frontend path’in legacy olduğu not edildi.
- `docs/playbooks/BILLING_METRICS.md` içinde “Prosan super-admin hub” ifadesi “Ticarium365 super-admin hub” yapıldı.

Kalan tarihsel dokümanlar:

- `docs/STRATEGIC-ANALYSIS-2026-04.md`
- `docs/ROADMAP-2026-04.md`
- `docs/EXTERNAL-REVIEW-RESPONSE-2026-04.md`
- eski kopya dokümanlar
- `replit.md`

Bu dosyalardaki `PROSAN` kullanımları çoğunlukla tarihsel tenant, eski sprint notu veya case-study/demo bağlamındadır. Bu turda davranışa etkisi yoktur; ürün-facing doküman değildir.

## 4. Package / Workspace Naming

Mevcut:

```text
artifacts/prosan
@workspace/prosan
```

Önerilen rename planı:

1. Yeni branch aç.
2. `artifacts/prosan` → `artifacts/web` veya `artifacts/ticarium365-web` olarak taşı.
3. `package.json` name:
   - `@workspace/prosan` → `@workspace/ticarium365-web`
4. `pnpm-lock.yaml` yeniden üret.
5. Replit artifact config, docs, scripts ve package filters güncelle.
6. `pnpm install --ignore-scripts` veya uygun workspace install çalıştır.
7. `pnpm -C artifacts/<new-name> run typecheck`
8. `pnpm run ci:gate`
9. Screenshot/docs script path’lerini güncelle.

Bu plan ayrı yapılmalıdır; mevcut conversion/launch branch’inde önerilmez.

## 5. Test / Demo Company Data

Kalabilir:

- `prosan` tenant subdomain’i
- `Prosan Endüstri` demo seed şirketi
- integration testlerde `prosan` tenant helper’ları
- `scripts/src/seed.ts` içindeki demo kullanıcı/şirket verileri

Şart:

- Bunlar ürün adı olarak değil, legacy demo/test tenant olarak kabul edilmelidir.
- Public UI, marketing copy, export dosya adı, API açıklaması ve yeni dokümanlarda ürün adı olarak kullanılmamalıdır.

## Sonuç

Ürün kimliği düzeyindeki sızıntılar temizlendi. Yapısal workspace adı ve test/demo tenant adları davranış kırmamak için korunmuştur.

