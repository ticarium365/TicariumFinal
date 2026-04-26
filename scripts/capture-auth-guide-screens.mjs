import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.GUIDE_BASE_URL || "http://localhost:3000";
const username = process.env.GUIDE_USERNAME;
const password = process.env.GUIDE_PASSWORD;

if (!username || !password) {
  console.error("GUIDE_USERNAME and GUIDE_PASSWORD are required");
  process.exit(1);
}

const outDir = path.resolve("docs/user-guide-auth-assets");

const pages = [
  { slug: "01-dashboard", title: "Dashboard", path: "/dashboard" },
  { slug: "02-satinalma-merkezi", title: "Satınalma Merkezi", path: "/satinalma-merkezi" },
  { slug: "03-satinalma", title: "Satınalma", path: "/satinalma" },
  { slug: "04-satinalma-kesfet", title: "Satınalma Keşfet", path: "/satinalma/kesfet" },
  { slug: "05-satinalma-rfq-yeni", title: "Yeni RFQ", path: "/satinalma/rfqs/new" },
  { slug: "06-satinalma-rfq-listesi", title: "RFQ Listesi", path: "/satinalma/rfqs" },
  { slug: "07-satinalma-gelen-kutusu", title: "Satınalma Gelen Kutusu", path: "/satinalma/inbox" },
  { slug: "08-urunler", title: "Ürünler", path: "/products" },
  { slug: "09-yeni-urun", title: "Yeni Ürün", path: "/products/new" },
  { slug: "10-barkod-tarayici", title: "Barkod Tarayıcı", path: "/barcode" },
  { slug: "11-satis", title: "Satış", path: "/sales" },
  { slug: "12-satis-gecmisi", title: "Satış Geçmişi", path: "/sales/history" },
  { slug: "13-stok", title: "Stok", path: "/stock" },
  { slug: "14-raporlar", title: "Raporlar", path: "/reports" },
  { slug: "15-gunluk-ozet", title: "Günlük Özet", path: "/reports/daily-summary" },
  { slug: "16-musteriler", title: "Müşteriler", path: "/customers" },
  { slug: "17-tedarikciler", title: "Tedarikçiler", path: "/suppliers" },
  { slug: "18-alislar", title: "Alışlar", path: "/purchases" },
  { slug: "19-yeni-alis", title: "Yeni Alış", path: "/purchases/new" },
  { slug: "20-barkodlar", title: "Barkodlar", path: "/barcodes" },
  { slug: "21-stok-sayimlari", title: "Stok Sayımları", path: "/stock-counts" },
  { slug: "22-finans", title: "Finans", path: "/finance" },
  { slug: "23-subeler", title: "Şubeler", path: "/branches" },
  { slug: "24-entegrasyon-ayarlari", title: "Entegrasyon Ayarları", path: "/settings/integrations" },
  { slug: "25-abonelik", title: "Abonelik", path: "/settings/subscription" },
  { slug: "26-kontor-yukleme", title: "Kontör Yükleme", path: "/settings/credit-topup" },
  { slug: "27-belgeler", title: "Belgeler", path: "/documents" },
  { slug: "28-finans-belgeleri", title: "Finans Belgeleri", path: "/finance-documents" },
  { slug: "29-bankacilik", title: "Bankacılık", path: "/banking" },
  { slug: "30-e-fatura", title: "E-Fatura", path: "/einvoice" },
  { slug: "31-magazalar", title: "Mağazalar", path: "/magaza" },
  { slug: "32-fiyat-motoru", title: "Fiyat Motoru", path: "/fiyat-motoru" },
  { slug: "33-kargo", title: "Kargo", path: "/kargo" },
  { slug: "34-kanal-karliligi", title: "Kanal Karlılığı", path: "/karlilik-kanal" },
  { slug: "35-eticarium-merkezi", title: "E-Ticarium Merkezi", path: "/eticarium-merkezi" },
  { slug: "36-marketplace", title: "Marketplace", path: "/marketplace" },
  { slug: "37-profit", title: "Profit", path: "/profit" },
  { slug: "38-muhasebeci", title: "Muhasebeci", path: "/muhasebeci" },
  { slug: "39-butce", title: "Bütçe", path: "/butce" },
  { slug: "40-reklam-butce", title: "Reklam Bütçe", path: "/reklam-butce" },
  { slug: "41-aggregator", title: "Aggregator", path: "/aggregator" },
  { slug: "42-ice-aktarim", title: "İçe Aktarım", path: "/ice-aktarim" },
  { slug: "43-pos", title: "POS", path: "/pos" },
  { slug: "44-uretim", title: "Üretim", path: "/uretim" },
  { slug: "45-sadakat", title: "Sadakat", path: "/sadakat" },
  { slug: "46-doviz", title: "Döviz", path: "/doviz" },
  { slug: "47-finans-dashboard", title: "Finans Dashboard", path: "/finance-dashboard" },
  { slug: "48-bildirim-ayarlari", title: "Bildirim Ayarları", path: "/settings/notifications" },
  { slug: "49-menu-tercihleri", title: "Menü Tercihleri", path: "/settings/menu" },
  { slug: "50-bildirimler", title: "Bildirimler", path: "/bildirimler" },
  { slug: "51-personel", title: "Personel", path: "/personnel" },
  { slug: "52-kampanyalar", title: "Kampanyalar", path: "/campaigns" },
  { slug: "53-network", title: "Network", path: "/network" },
  { slug: "54-network-profilim", title: "Network Profilim", path: "/network/my-profile" },
  { slug: "55-b2b-teklifler", title: "B2B Teklifler", path: "/b2b/quotes" },
  { slug: "56-b2b-yeni-teklif", title: "B2B Yeni Teklif", path: "/b2b/quotes/new" },
  { slug: "57-b2b-siparisler", title: "B2B Siparişler", path: "/b2b/orders" },
  { slug: "58-b2b-katalog", title: "B2B Katalog", path: "/b2b/catalog" },
  { slug: "59-b2b-vitrin", title: "B2B Vitrin", path: "/b2b/vitrin" },
  { slug: "60-kanallar", title: "Kanallar", path: "/channels" },
  { slug: "61-toplu-kanal", title: "Toplu Kanal", path: "/channels/bulk" },
  { slug: "62-kullanicilar", title: "Kullanıcılar", path: "/users" },
  { slug: "63-ayarlar", title: "Ayarlar", path: "/settings" },
  { slug: "64-firma-profili", title: "Firma Profili", path: "/firma-profili" },
  { slug: "65-kurulum-skoru", title: "Kurulum Skoru", path: "/kurulum-skoru" },
  { slug: "66-admin-musteri-doluluk", title: "Admin Müşteri Doluluk", path: "/admin/musteri-doluluk" },
  { slug: "67-admin-firmalar", title: "Admin Firmalar", path: "/admin/companies" },
  { slug: "68-admin-odemeler", title: "Admin Ödemeler", path: "/admin/payments" },
  { slug: "69-admin-platform-ayarlari", title: "Admin Platform Ayarları", path: "/admin/platform-settings" },
  { slug: "70-admin-faturalama", title: "Admin Faturalama", path: "/admin/billing" },
  { slug: "71-admin-runtime-flags", title: "Admin Runtime Flags", path: "/admin/runtime-flags" },
  { slug: "72-admin-planlar", title: "Admin Planlar", path: "/admin/planlar" },
  { slug: "73-super-admin-talepler", title: "Super Admin Talepler", path: "/super-admin/talepler" },
  { slug: "74-super-admin-audit-logs", title: "Super Admin Audit Logs", path: "/super-admin/audit-logs" },
  { slug: "75-super-admin-yeni-firma", title: "Super Admin Yeni Firma", path: "/super-admin/yeni-firma" },
  { slug: "76-super-admin-sistem-saglik", title: "Super Admin Sistem Sağlık", path: "/super-admin/sistem-saglik" },
  { slug: "77-super-admin-pazaryeri-saglik", title: "Super Admin Pazaryeri Sağlık", path: "/super-admin/pazaryeri-saglik" },
  { slug: "78-super-admin", title: "Super Admin", path: "/super-admin" },
  { slug: "79-pricing", title: "Pricing", path: "/pricing" },
  { slug: "80-gercek-kar", title: "Gerçek Kâr", path: "/gercek-kar" },
  { slug: "81-gercek-kar-ayarlar", title: "Gerçek Kâr Ayarlar", path: "/gercek-kar/ayarlar" },
  { slug: "82-gercek-kar-oneriler", title: "Gerçek Kâr Öneriler", path: "/gercek-kar/oneriler" },
  { slug: "83-onboarding", title: "Onboarding", path: "/onboarding" },
];

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "networkidle", timeout: 30_000 });
await page.fill("#username", username);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL(/\/dashboard|\/onboarding|\/satinalma-merkezi/, { timeout: 30_000 }).catch(() => undefined),
  page.locator("form").evaluate((form) => form.requestSubmit()),
]);
await page.waitForTimeout(1500);

const results = [];
for (const item of pages) {
  const url = new URL(item.path, baseUrl).toString();
  const fileName = `${item.slug}.png`;
  const fullPath = path.join(outDir, fileName);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: fullPath, fullPage: true });
    results.push({ ...item, ok: true, fileName, finalUrl: page.url() });
    console.log(`OK ${item.path} -> ${fileName} (${page.url()})`);
  } catch (error) {
    results.push({ ...item, ok: false, fileName, error: error?.message || String(error), finalUrl: page.url() });
    console.log(`FAIL ${item.path}: ${error?.message || error}`);
  }
}

await fs.writeFile(
  path.join(outDir, "auth-screens.json"),
  JSON.stringify(results, null, 2),
  "utf8",
);

await browser.close();
