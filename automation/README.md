# Ticarium365 — Claude Otomasyon

Claude API ile kod inceleme ve Cursor prompt üretme araçları.

## Kurulum

1. `.env` dosyana ekle:
```
ANTHROPIC_API_KEY=sk-ant-...buraya_key_yaz...
```

2. `automation/` klasörünü monorepo'ya taşı:
```bash
# TicariumFinal/ kök dizininde:
cp -r automation/ TicariumFinal/automation/
```

3. Bağımlılıkları yükle:
```bash
cd automation
pnpm install --ignore-workspace
```
*(Windows: monorepo kökündeki `preinstall` bazen `sh` ister; `automation` içinde `--ignore-workspace` kullan.)*

## Kullanım

### Windows PowerShell 5
`&&` **kullanma** (hata verir). Şunlardan biri:

```powershell
# Repo kökünden (ticarium365/) tek satır — önerilen
pnpm -C automation run prompt:k1
```

```powershell
cd automation; npx tsx cursor-prompts.ts K1
```

Diğer kodlar için: `pnpm -C automation run prompt -- K2` veya `prompt` scriptine argüman: `pnpm -C automation exec tsx cursor-prompts.ts K2`

### Tek dosya inceleme
```bash
npx tsx automation/code-review.ts artifacts/api-server/src/routes/sales.ts
```

### Cursor prompt üret (bilinen sorunlar)
```bash
npx tsx automation/cursor-prompts.ts K1   # Satış transaction sorunu
npx tsx automation/cursor-prompts.ts K2   # N+1 sorunu
npx tsx automation/cursor-prompts.ts K3   # Duplicate endpoint
npx tsx automation/cursor-prompts.ts O1   # Ham 500 hataları
npx tsx automation/cursor-prompts.ts O2   # Zod karmaşası
```

## Yapı

```
automation/
  claude-client.ts     → API wrapper (tüm modüller bunu kullanır)
  code-review.ts       → Dosya bazında kod inceleme
  cursor-prompts.ts    → Hazır Cursor prompt üretici
  skills/              → İleride eklenecek (copywriting, SEO, vb.)
```

## Sonraki Adımlar

- [ ] `skills/copywriting.ts` — Pazarlama içerikleri
- [ ] `skills/seo.ts` — SEO analizi  
- [ ] `skills/competitor.ts` — Rakip analizi
- [ ] Git hook entegrasyonu (commit öncesi otomatik review)
