# Ticarium365 — SaaS dönüşüm yol haritası

Bu belge, ürünün **satılabilir, güvenilir ve ölçeklenebilir** SaaS olması için öncelikleri sabitler. Teknik temel (depolama taşınabilirliği, oturum/CORS, menü ve fiyat metinleri) korunur.

## Ölçüm (şu an)

- `POST /api/product-analytics/track` — oturum açmış kullanıcı; olay adı + sınırlı `properties`; **yapılandırılmış log** (DB yok). Log araması ile funnel başlatılabilir.
- Örnek olaylar: `signup_completed`, `onboarding_completed`, `onboarding_step_done`, `onboarding_step_skipped`, `onboarding_step_error`, `billing_checkout_started`, `billing_return_success`, `billing_return_error`, `pricing_view`, `pricing_plan_focus`, `pricing_cycle_toggle`, `pricing_help_nav`, `pricing_compare_nav`, `trial_dashboard_banner_view`, `trial_cta_click`, `expired_cta_click`.
- Ana panel widget sayaçları: `GET /api/dashboard/action-counts` (banka eşleşmemiş + pazaryeri dönüşüm bekleyen; ağır listeleri çekmez).
- Süper admin hub: `GET /api/subscriptions/admin/billing/metrics` + `GET /api/contact/admin/summary` (hafif sayaçlar; tam talep listesi `/api/contact/admin`).
- Satış gün özeti: `GET /api/sales/day-summary?date=YYYY-MM-DD` (+ isteğe `saleType`) — günün tamamı için ciro / kâr / top ürün / saat dağılımı; satış geçmişi widget’ları 200 satır tavanına bağlı kalmaz.

## Performans (şu an)

- Ağır sayfalar `React.lazy` + tek `Suspense` (`App.tsx`); giriş / kayıt / ana sayfa / 404 senkron. Üretimde ana JS paketi belirgin şekilde küçülür; route başına ek chunk’lar yüklenir.

## 30 gün — en yüksek getiri

1. **Onboarding tamamlanma oranı**: adım bazlı `trackProductEvent`, düşük adımda metin/UX düzeltmesi.
2. **Deneme → ödeme**: `pricing` / `paketler` / e-posta metinleri tek kaynak; deneme bitişinde tek CTA.
3. **Entegrasyon dürüstlüğü**: her sağlayıcı kartında durum rozeti (Canlı / Beta / Planlı); ayarlar ve merkez sayfası uyumu.
4. **Performans**: büyük sayfalarda `React.lazy` + route-level code split (Vite `manualChunks` ile birlikte).
5. **Gözlem**: prod loglarda `product_event` sorgusu; haftalık kurucu özeti şablonu.

## 90 gün — ticari hazırlık ve ilk büyüme

1. **Ödeme ve faturalama**: Iyzico (veya seçilen PSP) prod akışı, fatura PDF, KDV metni.
2. **Destek**: ticket veya paylaşılan gelen kutusu; kritik hatalar için Sentry + request id.
3. **Paket limitleri**: kullanım %80 uyarıları (UI + e-posta); yükseltme önerisi tek dilde.
4. **Çok kiracı**: subdomain + custom domain runbook; staging ortamı.
5. **Analitik v2** (isteğe bağlı): olayları tabloya yazma veya üçüncü parti (PostHog) — PII politikasıyla.

## 1 yıl — olgun SaaS

1. **SLA ve güven**: yedekleme/geri yükleme testi, RPO/RTO tanımı, güvenlik gözden geçirmesi.
2. **API sürümleme**: `/api/v1` dış müşteri sözleşmesi; kırıcı değişiklik süreci.
3. **Mobil**: Expo uygulaması ile özellik paritesi (okuma ağırlıklı → yazma).
4. **Pazar**: partner kanalı, white-label seçenekleri (varsa iş modeli).
5. **Veri**: şirket dışa aktarma self-servis; KVKK silme talebi otomasyonu.

## Riskler (açık)

- Kiracı çözümlemesi prod’da subdomain zorunluluğu — tek host deployment’ta yapılandırma hatası müşteri kaybına yol açar.
- Deneme süresi dolmuş hesapta ürün olayları 402 alır; churn analizi için muafiyet veya istemci kuyruğu düşünülebilir.

## Sonraki dalga (uygulama)

- Route bazlı lazy loading ve kritik listelerde sayfalama.
- Ağır grafikler (`recharts`) ve kütüphaneler (`xlsx`, `jsbarcode`) route içinde bile mümkün olduğunda **lazy chunk** ile yükleme.
- `amacimiz` / `karsilastir` metinlerinin paketler ile çelişmemesi.
- Süper admin: `/super-admin` komuta merkezi; paket/isPublic düzenleme ekranında denetim günlüğü.
