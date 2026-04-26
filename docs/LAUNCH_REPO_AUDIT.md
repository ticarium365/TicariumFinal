# Launch repo audit — stay vs clean repo

**Tarih:** stratejik; launch öncesi karar.  
**Soru:** Bu repodan mı launch, yoksa “temiz” yeni repo mu?

**Güncelleme (build artifact):** `artifacts/prosan/dist` artık **commit edilmez**; `ci:gate` bu politikayı zorunlu kılar. Kaynak: `docs/FRONTEND_BUILD_AND_DEPLOY.md`.

---

## 1) Repo complexity (dürüst)

| Faktör | Değerlendirme |
|--------|----------------|
| **Yapı** | pnpm monorepo: `lib/db` + `lib/api-*` + `artifacts/api-server` + `artifacts/prosan` + `scripts` — *ürün için mantıklı* paylaşılan şema ve tipler. |
| **Gürültü** | `artifacts/*` altında `mockup-sandbox`, `smsystems-mobile` gibi **launch dışı** paketler; `pnpm-workspace.yaml` içi uzun `overrides` (platform binipleri) yeni developer’a yorucu. |
| **Dokümantasyon** | `docs/` içinde çok sayıda stratejik/legacy dosya; **tekrarlayan** isimler var (`Ticarium365_Dokumantasyon` vs copy, `TEKNIK` yolları). Okuma yükü yüksek, *çalıştırmayı* doğrudan bozmaz. |
| **Özet** | Orta–yüksek bilişsel yük; **tek bir “minimal” repo illüzyonu yok** — ama bu, launch’i tek başına düşürmez. |

---

## 2) Dead / riskli dosyalar (özet)

| Konu | Risk |
|------|------|
| **`!artifacts/prosan/dist/**` .gitignore istisnası** | **Kaynak (TS) ile commit’li build (dist) çatışabilir** — “neyi deploy ediyoruz?” belirsizliği ve merge gürültüsü. *Ölü dosya değil; tersine iki kaynak.* |
| **Büyük zip / ekran görüntüleri** (`docs/*screenshots*.zip` vb.) | Repoyu şişirir, clone süresi; *launch runtime’ı etkilemez*; isterseniz LFS veya ayrı artifact. |
| **Kopya / eski .md** | Dead code değil; **dikkat dağıtır**. |
| **Launch dışı paketler** | Dead değil; **CI’da yanlışlıkla `pnpm run build` root** tetiklenirse süre + flakiness. |

---

## 3) Build risk

| | |
|--|--|
| **Dar prod kapı** | `ci:gate` = `lib/db` tsc + `api-server` build + `verify-production-schema` — *dar ve doğru*; bu yeşilse çekirdek risk düşük. |
| **Geniş build** | Kök `pnpm run build` = `typecheck` + tüm workspace build — daha geniş, launch deploy’u **zorunlu kılmayın**; `ci:gate` yeter. |
| **Ortam** | Windows’ta `preinstall` sh + `&&` türü sınırlar; ekip tamamen Windows CI kullanıyorsa pipeline’ı net test edin. |
| **Özet** | Build riski **kontrol altında**, yeni repo açmaktan çok **hangi script’i deploy olarak kutsadığınız** belirleyici. |

---

## 4) Deployment clarity

| | |
|--|--|
| **Net olan** | API: `artifacts/api-server` esbuild → `dist/index.mjs`; `PORT` zorunlu; runbook’lar. |
| **Net olmayan (çevre)** | PaaS seçimi, env paneli, DNS — **repodan bağımsız**. |
| **Dockerfile yok** | “Tek tık image” yok; **bilinçli tercih** veya sonradan; launch’i engellemez. |

Monorepo burada faydalı: tek commit = API + (yeniden build edilen) UI aynı tag.

---

## 5) Monorepo practicality

| Artı | Eksi |
|------|------|
| Şema + API + client tek yerde; migration senkronu | Clone/build süreleri, `pnpm install` ağırlığı |
| `ci:gate` şemayı doğrular | Yeni ekip “nereden başlayayım” |

**KOBİ/ founder launch** için monorepo **pratik**; ayrı repolara bölme = paketleme, sürüm, CI çoğalması (maliyet: haftalar).

---

## 6) Migration cost — “clean launch repo”

| Maliyet | Açıklama |
|---------|-----------|
| **Yüksek** | Tüm import yolları, `workspace:*`, `lib/db` erişimi, script’ler, geçmiş tag’ler, CI, sırlar yönetimi yeniden. |
| **Regression penceresi** | “Stable” kopyalarken dosya/ortam atlaması (tipik). |
| **Zaman** | Launch penceresinde 1–3+ hafta founder/mühendis dikkatini yer. **Stratejik sınıf: launch sonrası veya ayrı proje; launch blocker değil.** |

---

# Karar

## A) Mevcut repodan launch — **evet, varsayılan doğru cevap**

*Tek şart:* Release pipeline’ı `ci:gate` (ve prod için `ci:deploy` where applicable) ile **kilitli**; deploy yolu dokümante.

## B) Temiz launch repo — **şimdi hayır (önerilmez)**

Sadece şu **üçü** bir aradaysa tekrar düşünürsünüz: (1) geçmişte zorunlu sızdırılmış sır, (2) hukuki ayrı kod tabanı, (3) yatırımcı “due diligence” ile **planlı** ayrıştırma. *“Daha temiz hissettir” tek başına yeterli değil.*

## C) En güvenli seçenek (launch öncesi)

1. **Bu repoda kalın.** Yeni repo açmayın.  
2. **Deploy tek doğruluk:** `ci:gate` yeşil + tag; prod’da `ci:deploy` (env script).  
3. **İsteğe bağlı sertleşme (yeni repo yok):**  
   - `artifacts/prosan/dist`’i **CI’da üret, commit’i kaldır** veya “yalnızca X branch” kuralı (strategic: küçük PR, büyük kazanç).  
   - CI’da yalnız `api-server` + (gerekiyorsa) `prosan` build; `mockup-sandbox` / `smsystems-mobile` **deploy pipeline’ına dahil etme**.  
4. **Dokümantasyon:** `docs/LAUNCH_SCOPE.md` (tek paragraf: hangi paketler prod) — *isteğe bağlı*.

---

**Son cümle:** Temiz his için repo taşımak, launch haftasında **regresyondan daha pahalı**. Mevcut repo **karmaşık ama uygulanabilir**; risk **süreç ve commit dist** tarafında, **klasör derinliği** tarafında değil.
