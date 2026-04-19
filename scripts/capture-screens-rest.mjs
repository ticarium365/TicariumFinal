import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = path.resolve("outputs/screenshots-all");

const REST = [
  ["39-doviz", "/doviz"],
  ["40-marketplace", "/marketplace"],
  ["41-channels", "/channels"],
  ["42-magaza", "/magaza"],
  ["43-b2b-vitrin", "/b2b/vitrin"],
  ["44-network", "/network"],
  ["45-aggregator", "/aggregator"],
  ["46-fiyat-motoru", "/fiyat-motoru"],
  ["47-karlilik-kanal", "/karlilik-kanal"],
  ["48-kargo", "/kargo"],
  ["49-reklam-butce", "/reklam-butce"],
  ["50-reports", "/reports"],
  ["51-daily-summary", "/reports/daily-summary"],
  ["52-oneriler", "/gercek-kar/oneriler"],
  ["60-personnel", "/personnel"],
  ["61-branches", "/branches"],
  ["62-uretim", "/uretim"],
  ["63-users", "/users"],
  ["64-settings", "/settings"],
  ["65-integrations", "/settings/integrations"],
  ["66-notifications", "/settings/notifications"],
  ["67-subscription", "/settings/subscription"],
  ["68-pricing", "/pricing"],
  ["69-finance-documents", "/finance-documents"],
  ["70-b2b-catalog", "/b2b/catalog"],
];

const HIDE_BANNER_CSS = `
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
  await page.addStyleTag({ content: HIDE_BANNER_CSS }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll("body > *, body > div > *").forEach((el) => {
      try {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (cs.position === "fixed" && rect.top <= 4 && rect.height < 80 && rect.width > 400) {
          const txt = (el.textContent || "").toLowerCase();
          if (txt.includes("temporary") || txt.includes("replit") || txt.includes("development")) {
            el.style.display = "none";
          }
        }
      } catch {}
    });
  });
  await page.evaluate(() => {
    document.querySelectorAll('aside button[aria-expanded="false"], nav button[aria-expanded="false"]').forEach((b) => { try { b.click(); } catch {} });
  });
  await page.waitForTimeout(250);
  await page.evaluate((p) => {
    const link = document.querySelector(`aside a[href="${p}"]`) || document.querySelector(`nav a[href="${p}"]`);
    if (link) {
      let el = link.parentElement;
      while (el && el !== document.body) {
        const cs = window.getComputedStyle(el);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
          const r1 = link.getBoundingClientRect(); const r2 = el.getBoundingClientRect();
          el.scrollTop += r1.top - r2.top - r2.height / 2 + r1.height / 2;
          break;
        }
        el = el.parentElement;
      }
      try {
        link.style.outline = "2px solid #1E40AF";
        link.style.borderRadius = "6px";
      } catch {}
    }
  }, activePath);
  await page.waitForTimeout(150);
}

const browser = await chromium.launch({
  executablePath: "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
const r = await page.request.post(BASE + "/api/auth/login", {
  data: { username: "admin", password: "admin123" },
  headers: { "Content-Type": "application/json" },
});
console.log("login:", r.status());

for (const [slug, p] of REST) {
  console.log("→", p);
  try {
    await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch { console.log("  (timeout)"); }
  await page.waitForTimeout(1500);
  await prepare(page, p);
  await page.screenshot({ path: path.join(OUT, slug + ".png"), fullPage: false });
  console.log("  ✓", slug);
}

await browser.close();
console.log("DONE");
