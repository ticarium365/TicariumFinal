import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const BASE = process.env.SCREENSHOT_BASE || "http://localhost:80";
const OUT = process.env.SCREENSHOT_OUT || "screenshots/all";
const USERNAME = process.env.SCREENSHOT_USER || "talha";
const PASSWORD = process.env.SCREENSHOT_PASS || "Demo!Screenshots2026";

const ALL_PAGES = [
  ["/login", "login", { auth: false }],
  ["/sifremi-unuttum", "forgot-password", { auth: false }],
  ["/dashboard", "dashboard"],
  ["/products", "products"],
  ["/products/new", "products-new"],
  ["/sales", "sales"],
  ["/sales/history", "sales-history"],
  ["/pos", "pos"],
  ["/stock", "stock"],
  ["/stock-counts", "stock-counts"],
  ["/barcode", "barcode-scanner"],
  ["/barcodes", "barcodes"],
  ["/customers", "customers"],
  ["/suppliers", "suppliers"],
  ["/purchases", "purchases"],
  ["/reports", "reports"],
  ["/reports/daily-summary", "reports-daily-summary"],
  ["/finance", "finance"],
  ["/finance-dashboard", "finance-dashboard"],
  ["/finance-documents", "finance-documents"],
  ["/banking", "banking"],
  ["/muhasebeci", "muhasebeci"],
  ["/einvoice", "einvoice"],
  ["/documents", "documents"],
  ["/marketplace", "marketplace"],
  ["/eticarium-merkezi", "eticarium-merkezi"],
  ["/channels", "channels"],
  ["/magaza", "magaza"],
  ["/fiyat-motoru", "fiyat-motoru"],
  ["/kargo", "kargo"],
  ["/karlilik-kanal", "karlilik-kanal"],
  ["/profit", "profit"],
  ["/butce", "butce"],
  ["/reklam-butce", "reklam-butce"],
  ["/pazar", "pazar"],
  ["/uretim", "uretim"],
  ["/sadakat", "sadakat"],
  ["/doviz", "doviz"],
  ["/ice-aktarim", "ice-aktarim"],
  ["/branches", "branches"],
  ["/network", "network"],
  ["/network/my-profile", "network-my-profile"],
  ["/b2b/quotes", "b2b-quotes"],
  ["/b2b/orders", "b2b-orders"],
  ["/b2b/catalog", "b2b-catalog"],
  ["/b2b/vitrin", "b2b-vitrin"],
  ["/campaigns", "campaigns"],
  ["/personnel", "personnel"],
  ["/users", "users"],
  ["/bildirimler", "bildirimler"],
  ["/settings", "settings"],
  ["/settings/integrations", "settings-integrations"],
  ["/settings/subscription", "settings-subscription"],
  ["/settings/notifications", "settings-notifications"],
  ["/gercek-kar", "gercek-kar-dashboard"],
  ["/gercek-kar/oneriler", "gercek-kar-oneriler"],
  ["/super-admin/talepler", "super-admin-talepler"],
  ["/super-admin/audit-logs", "super-admin-audit-logs"],
  ["/aggregator", "aggregator-admin"],
  ["/karsilastir", "karsilastir", { auth: false }],
  ["/hakkimizda", "hakkimizda", { auth: false }],
  ["/amacimiz", "amacimiz", { auth: false }],
  ["/paketler", "paketler", { auth: false }],
  ["/iletisim", "iletisim", { auth: false }],
  ["/kvkk", "kvkk", { auth: false }],
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("#username", { timeout: 10000 });
  await page.type("#username", USERNAME, { delay: 10 });
  await page.type("#password", PASSWORD, { delay: 10 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
    page.click('[data-testid="btn-login"]'),
  ]);
  // give SPA a moment
  await new Promise((r) => setTimeout(r, 1500));
  const url = page.url();
  if (!url.includes("/dashboard")) {
    console.warn(`[warn] after login URL is ${url}`);
  } else {
    console.log(`[ok] logged in -> ${url}`);
  }
  // dismiss cookie banner if present
  try {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const b = btns.find((x) => /Sadece Zorunlu|Tümünü Kabul|Kabul/i.test(x.textContent || ""));
      if (b) b.click();
    });
  } catch {}
}

async function captureSet(label, viewport) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);

  // login on shared context (cookie shared across pages within same context)
  await login(page);

  let ok = 0;
  let fail = 0;
  for (const [route, name, opts] of ALL_PAGES) {
    const file = path.join(dir, `${name}.jpeg`);
    if (fs.existsSync(file) && fs.statSync(file).size > 5000) {
      console.log(`  [${label}] ${name} already exists, skip`);
      ok++;
      continue;
    }
    try {
      await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({
        path: file,
        type: "jpeg",
        quality: 85,
        fullPage: true,
      });
      ok++;
      console.log(`  [${label}] ${route} -> ${name}.jpeg`);
    } catch (e) {
      fail++;
      console.warn(`  [${label}] ${route} FAILED: ${e.message.slice(0, 80)}`);
      // try a fallback screenshot of whatever rendered
      try {
        await page.screenshot({ path: file, type: "jpeg", quality: 85, fullPage: true });
      } catch {}
    }
  }

  await ctx.close();
  await browser.close();
  console.log(`[${label}] done — ${ok} ok, ${fail} failed (${ALL_PAGES.length} total)`);
}

(async () => {
  if (!CHROME || !fs.existsSync(CHROME)) {
    console.error("Chromium binary not found");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  await captureSet("desktop", { width: 1440, height: 900, deviceScaleFactor: 1 });
  await captureSet("mobile", { width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  console.log("ALL DONE");
})();
