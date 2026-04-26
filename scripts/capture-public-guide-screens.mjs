import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.GUIDE_BASE_URL || "http://localhost:3000";
const outDir = path.resolve("docs/user-guide-assets");

const pages = [
  { slug: "01-anasayfa", title: "Ana Sayfa", path: "/" },
  { slug: "02-giris", title: "Giriş", path: "/login" },
  { slug: "03-kayit", title: "Kayıt", path: "/kayit" },
  { slug: "04-isletme-kaydi", title: "İşletme Kaydı", path: "/kayit/isletme" },
  { slug: "05-satinalmaci-kaydi", title: "Satınalmacı Kaydı", path: "/kayit/satinalmaci" },
  { slug: "06-sifremi-unuttum", title: "Şifremi Unuttum", path: "/sifremi-unuttum" },
  { slug: "07-karsilastir", title: "Karşılaştır", path: "/karsilastir" },
  { slug: "08-hakkimizda", title: "Hakkımızda", path: "/hakkimizda" },
  { slug: "09-amacimiz", title: "Amacımız", path: "/amacimiz" },
  { slug: "10-paketler", title: "Paketler", path: "/paketler" },
  { slug: "11-iletisim", title: "İletişim", path: "/iletisim" },
  { slug: "12-kvkk", title: "KVKK", path: "/kvkk" },
  { slug: "13-odeme-sonuc", title: "Ödeme Sonuç", path: "/odeme/sonuc" },
  { slug: "14-pazar", title: "Pazar", path: "/pazar" },
  { slug: "15-catalog", title: "Katalog", path: "/catalog" },
];

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const results = [];
for (const item of pages) {
  const url = new URL(item.path, baseUrl).toString();
  const fileName = `${item.slug}.png`;
  const fullPath = path.join(outDir, fileName);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.screenshot({ path: fullPath, fullPage: true });
    results.push({ ...item, ok: true, fileName, finalUrl: page.url() });
    console.log(`OK ${item.path} -> ${fileName}`);
  } catch (error) {
    results.push({ ...item, ok: false, fileName, error: error?.message || String(error) });
    console.log(`FAIL ${item.path}: ${error?.message || error}`);
  }
}

await fs.writeFile(
  path.join(outDir, "public-screens.json"),
  JSON.stringify(results, null, 2),
  "utf8",
);

await browser.close();
