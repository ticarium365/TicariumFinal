import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const OUT = path.resolve("outputs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { id: "01-login",       path: "/login",      title: "Giriş Ekranı",     waitFor: 'input[name="username"], input[type="text"]' },
  { id: "02-dashboard",   path: "/dashboard",  title: "Ana Pano (Dashboard)" },
  { id: "03-products",    path: "/products",   title: "Ürünler" },
  { id: "04-pos",         path: "/pos",        title: "Hızlı Satış (POS)" },
  { id: "05-customers",   path: "/customers",  title: "Müşteriler / Cari" },
  { id: "06-stock",       path: "/stock",      title: "Stok Yönetimi" },
  { id: "07-einvoice",    path: "/einvoice",   title: "E-Fatura / Faturalar" },
  { id: "08-finance",     path: "/finance",    title: "Giderler" },
  { id: "09-banking",     path: "/banking",    title: "Banka" },
  { id: "10-gercekkar",   path: "/gercek-kar", title: "Gerçek Kâr Paneli" },
  { id: "11-marketplace", path: "/marketplace",title: "Pazaryeri Yönetimi" },
  { id: "12-reports",     path: "/reports",    title: "Raporlar" },
];

const browser = await chromium.launch({
  executablePath: "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERR:", e.message));

async function dismissOverlays() {
  // try dismiss cookie banner / trial popup
  const tries = [
    'button:has-text("Kabul")',
    'button:has-text("Tamam")',
    'button:has-text("Kapat")',
    'button:has-text("Anladım")',
    '[aria-label="Close"]',
    '[data-testid="close"]',
  ];
  for (const sel of tries) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 300 })) {
        await el.click({ timeout: 1000 });
        await page.waitForTimeout(200);
      }
    } catch {}
  }
}

async function shoot(p) {
  const file = path.join(OUT, p.id + ".png");
  console.log("→", p.path);
  await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await dismissOverlays();
  if (p.waitFor) {
    await page.waitForSelector(p.waitFor, { timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, fullPage: false });
  console.log("   saved", file);
}

// Login first to capture login page, then authenticate
await shoot(PAGES[0]);

// Try API login (faster, more reliable)
console.log("Logging in via API...");
const loginRes = await ctx.request.post(BASE + "/api/auth/login", {
  data: { username: "admin", password: "admin123" },
  headers: { "Content-Type": "application/json" },
});
console.log("login status:", loginRes.status());
if (!loginRes.ok()) {
  console.log("  body:", (await loginRes.text()).slice(0, 300));
  // fallback: UI login
  await page.goto(BASE + "/login");
  await page.fill('input[name="username"], input[type="text"]', "admin").catch(() => {});
  await page.fill('input[type="password"]', "admin123").catch(() => {});
  await page.click('button:has-text("Giriş")').catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

// Now capture each protected page
for (const p of PAGES.slice(1)) {
  await shoot(p);
}

await browser.close();
console.log("\nDONE. Files in", OUT);
for (const f of fs.readdirSync(OUT).sort()) {
  const st = fs.statSync(path.join(OUT, f));
  console.log("  ", f, (st.size / 1024).toFixed(0) + " KB");
}
