import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = path.resolve("outputs/screenshots-all");
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  // [slug, path, group, label]
  ["00-login", "/login", "Genel", "Giriş Ekranı"],
  ["01-dashboard", "/dashboard", "Ana", "Ana Panel"],
  ["02-eticarium-merkezi", "/eticarium-merkezi", "Ana", "e-Ticarium Merkezi"],

  // Satış
  ["10-sales", "/sales", "Satış", "Satış Ekranı"],
  ["11-pos", "/pos", "Satış", "Hızlı Satış (POS)"],
  ["12-sales-history", "/sales/history", "Satış", "Satış Geçmişi"],
  ["13-customers", "/customers", "Satış", "Müşteriler"],
  ["14-b2b-quotes", "/b2b/quotes", "Satış", "Teklifler"],
  ["15-b2b-orders", "/b2b/orders", "Satış", "Siparişler"],
  ["16-sadakat", "/sadakat", "Satış", "Sadakat & Puan"],
  ["17-campaigns", "/campaigns", "Satış", "Kampanyalar"],

  // Ürün & Stok
  ["20-products", "/products", "Ürün & Stok", "Ürünler"],
  ["21-stock", "/stock", "Ürün & Stok", "Stok Girişi"],
  ["22-stock-counts", "/stock-counts", "Ürün & Stok", "Stok Sayım"],
  ["23-barcode", "/barcode", "Ürün & Stok", "Barkod Tarama"],
  ["24-barcodes", "/barcodes", "Ürün & Stok", "Etiket Merkezi"],
  ["25-purchases", "/purchases", "Ürün & Stok", "Alış Faturaları"],
  ["26-suppliers", "/suppliers", "Ürün & Stok", "Tedarikçiler"],
  ["27-ice-aktarim", "/ice-aktarim", "Ürün & Stok", "Veri İçe Aktarımı"],

  // Finans
  ["30-finance", "/finance", "Finans", "Kasa / Finans"],
  ["31-banking", "/banking", "Finans", "Bankacılık"],
  ["32-finance-dashboard", "/finance-dashboard", "Finans", "Finans Paneli"],
  ["33-profit", "/profit", "Finans", "Net Kâr"],
  ["34-gercek-kar", "/gercek-kar", "Finans", "Gerçek Kâr"],
  ["35-butce", "/butce", "Finans", "Bütçe"],
  ["36-muhasebeci", "/muhasebeci", "Finans", "Mali Müşavir"],
  ["37-einvoice", "/einvoice", "Finans", "e-Fatura"],
  ["38-documents", "/documents", "Finans", "Evrak"],
  ["39-doviz", "/doviz", "Finans", "Çoklu Para"],

  // Online Satış
  ["40-marketplace", "/marketplace", "Online Satış", "Pazaryeri"],
  ["41-channels", "/channels", "Online Satış", "Satış Kanalları"],
  ["42-magaza", "/magaza", "Online Satış", "Hazır Mağaza"],
  ["43-b2b-vitrin", "/b2b/vitrin", "Online Satış", "B2B Vitrin"],
  ["44-network", "/network", "Online Satış", "B2B Ağı"],
  ["45-aggregator", "/aggregator", "Online Satış", "Ticarium Pazar"],
  ["46-fiyat-motoru", "/fiyat-motoru", "Online Satış", "Fiyat Motoru"],
  ["47-karlilik-kanal", "/karlilik-kanal", "Online Satış", "Kanal Karlılığı"],
  ["48-kargo", "/kargo", "Online Satış", "Kargo"],
  ["49-reklam-butce", "/reklam-butce", "Online Satış", "Reklam Bütçesi"],

  // Raporlar
  ["50-reports", "/reports", "Raporlar", "Genel Raporlar"],
  ["51-daily-summary", "/reports/daily-summary", "Raporlar", "Günlük Kapanış"],
  ["52-oneriler", "/gercek-kar/oneriler", "Raporlar", "Akıllı Öneriler"],

  // Yönetim
  ["60-personnel", "/personnel", "Yönetim", "Personel"],
  ["61-branches", "/branches", "Yönetim", "Şubeler"],
  ["62-uretim", "/uretim", "Yönetim", "Üretim & Reçete"],
  ["63-users", "/users", "Yönetim", "Kullanıcılar"],
  ["64-settings", "/settings", "Yönetim", "Genel Ayarlar"],
  ["65-integrations", "/settings/integrations", "Yönetim", "Entegrasyonlar"],
  ["66-notifications", "/settings/notifications", "Yönetim", "Bildirim Ayarları"],
  ["67-subscription", "/settings/subscription", "Yönetim", "Abonelik"],
  ["68-pricing", "/pricing", "Yönetim", "Paketler & Fiyatlar"],
  ["69-finance-documents", "/finance-documents", "Yönetim", "Belge Merkezi"],
  ["70-b2b-catalog", "/b2b/catalog", "Yönetim", "B2B Katalogum"],
];

const HIDE_BANNER_CSS = `
  /* Replit dev / preview banner gizle */
  [data-replit-metadata-banner],
  div[id^="replit-dev-banner"],
  div[class*="replit-dev-banner"],
  iframe[src*="replit"][style*="top: 0"],
  body > div[style*="position: fixed"][style*="top: 0"][style*="z-index"]:not([data-app]):not([id^="root"]),
  div[role="banner"][style*="position: fixed"][style*="top"] {
    display: none !important;
  }
`;

async function prepare(page, activePath) {
  // 1) Hide Replit dev banner
  await page.addStyleTag({ content: HIDE_BANNER_CSS }).catch(() => {});

  // 2) Hide any top-fixed banner whose text contains "temporary" / "Replit"
  await page.evaluate(() => {
    document.querySelectorAll("body > *, body > div > *").forEach((el) => {
      try {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (
          cs.position === "fixed" &&
          rect.top <= 4 &&
          rect.height < 80 &&
          rect.width > 400
        ) {
          const txt = (el.textContent || "").toLowerCase();
          if (
            txt.includes("temporary") ||
            txt.includes("replit") ||
            txt.includes("development")
          ) {
            el.style.display = "none";
          }
        }
      } catch {}
    });
  });

  // 3) Expand all sidebar groups so the active item is always visible
  await page.evaluate(() => {
    const sidebars = document.querySelectorAll("aside, nav");
    sidebars.forEach((side) => {
      side
        .querySelectorAll('button[aria-expanded="false"]')
        .forEach((btn) => {
          try {
            btn.click();
          } catch {}
        });
    });
  });

  // 4) Wait a moment, then scroll the active link into view inside its scroll
  //    container.
  await page.waitForTimeout(250);

  await page.evaluate((p) => {
    const link =
      document.querySelector(`aside a[href="${p}"]`) ||
      document.querySelector(`nav a[href="${p}"]`);
    if (link) {
      // Find scrollable ancestor
      let el = link.parentElement;
      while (el && el !== document.body) {
        const cs = window.getComputedStyle(el);
        if (
          (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight
        ) {
          const linkRect = link.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          el.scrollTop +=
            linkRect.top -
            elRect.top -
            elRect.height / 2 +
            linkRect.height / 2;
          break;
        }
        el = el.parentElement;
      }
      // Visual emphasis to make active state obvious in screenshots
      try {
        link.style.outline = "2px solid #1E40AF";
        link.style.outlineOffset = "0px";
        link.style.borderRadius = "6px";
      } catch {}
    }
  }, activePath);

  await page.waitForTimeout(150);
}

async function main() {
  const browser = await chromium.launch({
    executablePath:
      "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // 1) Login screen first (no auth needed)
  console.log("→ /login");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await prepare(page, "/login");
  await page.screenshot({
    path: path.join(OUT, "00-login.png"),
    fullPage: false,
  });

  // 2) Login via API to obtain cookie
  console.log("Logging in via API...");
  const resp = await page.request.post(BASE + "/api/auth/login", {
    data: { username: "admin", password: "admin123" },
    headers: { "Content-Type": "application/json" },
  });
  console.log("login status:", resp.status());

  // 3) Capture every page
  for (const [slug, p, group, label] of PAGES.slice(1)) {
    const url = BASE + p;
    console.log(`→ ${p}  [${group} → ${label}]`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch {
      console.log("   (load timeout, continuing)");
    }
    // give react / queries a moment to render
    await page.waitForTimeout(1800);
    await prepare(page, p);
    await page.screenshot({
      path: path.join(OUT, slug + ".png"),
      fullPage: false,
    });
    console.log("   saved", slug + ".png");
  }

  await browser.close();
  console.log("\nDONE.");
  const files = fs.readdirSync(OUT).sort();
  files.forEach((f) => {
    const sz = fs.statSync(path.join(OUT, f)).size;
    console.log(" ", f, (sz / 1024).toFixed(0) + " KB");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
