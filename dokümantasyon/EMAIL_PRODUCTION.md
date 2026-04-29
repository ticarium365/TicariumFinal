# Üretim e-posta hazırlığı (Ticarium365)

## Touchpoint özeti

| Akış | E-posta gönderimi? | Posta yoksa davranış |
|------|---------------------|------------------------|
| **Kayıt — e-posta doğrulama** | `auth` → `sendMail` (doğrulama kodu) | Kod gönderilmez; kayıt + oturum yine oluşur (best-effort). |
| **Kayıt — SMS doğrulama** | Hayır (`sendSms`) | SMS dokümantasyonu: NetGSM vb. |
| **Şifre sıfırlama** | Hayır | **Yalnızca SMS** (`/forgot-password`); e-posta yolu yok. |
| **İletişim / “Sizi arayalım”** (`POST /api/contact`) | Hayır | Talep **`contact_requests`** tablosuna yazılır; süper admin `/api/contact/admin` + hub. Log: `lead_persisted_super_admin_can_review`. |
| **B2B / buyer lead** | Hayır | `contact_requests` veya ilgili tablo; uygulama içi. |
| **Ödeme (Iyzico)** | Checkout’ta alıcı `email` alanı | Iyzico / ödeme sağlayıcı “makbuz” e-postası (hesap ayarına bağlı); uygulama `sendMail` ile fatura e-postası göndermiyor. |
| **Admin / uyarılar** | Hayır (şu an) | `notifications` tablosu — uygulama içi bildirim; e-posta dispatch yok. |

**Sonuç:** Gerçek “transactional” `sendMail` kullanımı pratikte **e-posta kanallı doğrulama kodu** (ve ileride eklenirse diğer çağrılar) için.

---

## Önerilen sağlayıcı (ucuz + stabil)

**Birincil öneri: [Resend](https://resend.com)**  

- Küçük hacimde düşük maliyet, basit HTTP API (ek ağır SDK yok).  
- Domain doğrulama + SPF/DKIM ile teslim oranı.  

**Alternatifler:**  

- **Postmark** — transactional güçlü, fiyat biraz üst segment.  
- **SMTP (Zoho / Google Workspace)** — mevcut kurumsal posta kutusu relay; `SMTP_*` ile çalışır.  
- Saf SMTP, Resend’in “SMTP relay” seçeneği ile de mümkün; kodda doğrudan **REST** önceliklidir.

---

## Ortam değişkenleri

### Resend (öncelikli — `RESEND_API_KEY` set ise SMTP atlanır)

| Değişken | Zorunlu | Açıklama |
|-----------|---------|----------|
| `RESEND_API_KEY` | Resend kullanımında | `re_...` API anahtarı |
| `RESEND_FROM` veya `MAIL_FROM` | Evet (gerçek gönderim için) | Domain’de doğrulanmış gönderen adres |
| `MAIL_FROM` | İsteğe bağlı | `RESEND_FROM` boşsa From için yedek |

### SMTP (fallback)

| Değişken | Açıklama |
|----------|-----------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Klasik SMTP |
| `SMTP_FROM` veya `MAIL_FROM` | Gönderen |

### Sağlık kontrolü

`GET /api/healthz/deep` → `checks.smtp` alanı (geriye uyumluluk adıyla): **giden posta** (Resend yapılandırması veya SMTP doğrulama).

---

## Kod yüzeyi

- Tüm gönderimler: `artifacts/api-server/src/lib/email.ts` — `sendMail` / `isMailEnabled` / `getMailProviderKind`.
- Sağlayıcı sırası: **Resend** (`fetch`) → yoksa **Nodemailer SMTP**.
- Yapılandırma yoksa: **throw yok**; `sendMail` → `{ sent: false, reason: ... }`.

---

## EMAIL_READY / PARTIAL

- **credentials + domain doğrulama yapılmış Resend veya çalışan SMTP** → **EMAIL_READY** (doğrulama e-postaları için).
- **ENV eksik** veya **Resend’de from doğrulanmamış** → **PARTIAL** (formlar/DB çalışır; posta gitmez).
- **Şifre sıfırlama** e-posta ile değil → tam “işletme e-posta olmadan kurtarma” için **SMS/NetGSM** veya ayrı özellik gerekir — bu doküman kapsamı dışı değerlendirme: operasyonel **PARTIAL**.
