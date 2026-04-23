import app from "./app";
import { logProductionAuthHints } from "./lib/env-validation.js";
import { logger } from "./lib/logger";

logProductionAuthHints();
import { db, usersTable, productsTable } from "@workspace/db";
import { seedSubscriptionPlans } from "./routes/subscriptions.js";
import { startMarketplaceWorker } from "./services/marketplace/worker.js";
import { startMarketplaceSelfHealScheduler } from "./services/marketplace/self-heal.js";
import { startProfitCron } from "./services/profitEngine.js";
import { startOutboxWorker } from "./services/queue/outbox-worker.js";
import { fetchAndStoreTcmbRates } from "./services/currency/tcmb-fetcher.js";
import { cleanupExpiredIdempotencyKeys } from "./middlewares/idempotency.js";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import seedProductsRaw from "./seed-products.json";

interface SeedProduct {
  productCode: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  stock: number;
  minStock: number;
  purchasePrice: number;
  salePrice: number;
  profitPercent: number;
}

const seedProducts = seedProductsRaw as SeedProduct[];

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedDefaultCompanyIfMissing() {
  // Production bootstrap: companies tablosu boşsa varsayılan "Prosan" işletmesi oluştur.
  // Bu, çoklu işletme sisteminin tek-deployment senaryosunda da çalışmasını garanti eder
  // (custom domain bağlanana kadar default tenant olarak hizmet verir).
  const { companiesTable: co } = await import("@workspace/db");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(co);
  if (count > 0) return;
  logger.info("No companies found, seeding default 'Prosan' company...");
  const now = new Date();
  await db.insert(co).values({
    name: "Prosan Endüstri",
    subdomain: "prosan",
    primaryColor: "#2563eb",
    isActive: true,
    planType: "active",
    accountType: "seller",
    sector: "industrial",
    // Default tenant'ta wizard'ı atla — Ticarium365 ana paneline doğrudan girilebilsin
    onboardingCompletedAt: now,
  });
  logger.info("Default company seeded");
}

async function backfillOnboardingForDefaultCompany() {
  // Production fix: tüm şirketler için onboarding'i tamamlanmış işaretle
  // (auto-seed senaryosu — wizard'a takılı kalmasın). Hem companies.onboardingCompletedAt
  // hem de company_settings.onboardingCompleted güncellenir, çünkü /me ikincisini okur.
  const { eq: eqOp } = await import("drizzle-orm");
  const { companiesTable: co, companySettingsTable: cs } = await import("@workspace/db");
  const companies = await db.select({ id: co.id, name: co.name, onboardingCompletedAt: co.onboardingCompletedAt }).from(co);
  for (const c of companies) {
    if (!c.onboardingCompletedAt) {
      await db.update(co).set({ onboardingCompletedAt: new Date() }).where(eqOp(co.id, c.id));
    }
    const [existing] = await db.select().from(cs).where(eqOp(cs.companyId, c.id));
    if (!existing) {
      await db.insert(cs).values({ companyId: c.id, companyName: c.name, onboardingCompleted: true });
    } else if (!existing.onboardingCompleted) {
      await db.update(cs).set({ onboardingCompleted: true, updatedAt: new Date() }).where(eqOp(cs.id, existing.id));
    }
  }
  logger.info({ count: companies.length }, "Onboarding backfill complete");
}

async function backfillUserCompanyIds() {
  // Production fix: companyId=NULL kullanıcıları varsayılan ilk şirkete bağla.
  // Bu, eski seed'lerde NULL companyId ile yaratılmış kullanıcıları kurtarır
  // (talha gibi). Idempotent — bağlı kullanıcıları etkilemez.
  const { eq: eqOp, isNull } = await import("drizzle-orm");
  const { companiesTable: co } = await import("@workspace/db");
  const [firstCompany] = await db.select({ id: co.id }).from(co).orderBy(co.id).limit(1);
  if (!firstCompany) return;
  const result = await db
    .update(usersTable)
    .set({ companyId: firstCompany.id })
    .where(isNull(usersTable.companyId))
    .returning({ id: usersTable.id, username: usersTable.username });
  if (result.length > 0) {
    logger.info({ count: result.length, companyId: firstCompany.id, usernames: result.map(r => r.username) }, "Backfilled NULL companyId users");
  }
}

async function seedDefaultUsers() {
  // PRODUCTION HARDENING: deterministik default credential'lar (admin/admin123, vs.)
  // production'da otomatik seed edilmez. SEED_DEFAULT_USERS=1 explicit set edilirse
  // tek seferlik bootstrap için açılır (yine de ilk admin'i el ile rotate etmek tavsiye edilir).
  const isProd = process.env.NODE_ENV === "production";
  const explicitlyEnabled = process.env.SEED_DEFAULT_USERS === "1";
  if (isProd && !explicitlyEnabled) {
    logger.info("Production mode: default user seeding disabled (set SEED_DEFAULT_USERS=1 for one-time bootstrap)");
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const defaultUsers = [
    { username: "admin",       password: "admin123",       fullName: "Yönetici",       role: "admin"      as const },
    { username: "talha",       password: "talha123",       fullName: "Talha",          role: "admin"      as const },
    { username: "nihat",       password: "nihat123",       fullName: "Nihat",          role: "admin"      as const },
    { username: "nihat_admin", password: "nihat123",       fullName: "NİHAT Admin",    role: "admin"      as const },
    { username: "cenan",       password: "cenan123",       fullName: "Cenan",          role: "admin"      as const },
    { username: "superadmin",  password: "superadmin123",  fullName: "Süper Admin",    role: "super_admin" as const },
    { username: "personel",    password: "staff123",       fullName: "Personel",       role: "staff"      as const },
    { username: "goruntule",   password: "staff123",       fullName: "Görüntüleyici",  role: "viewer"     as const },
  ];

  // İlk şirketi bul (prosan = co1) — hem ilk seed hem upsert dalı için ortak
  const { eq: eql } = await import("drizzle-orm");
  const { companiesTable: co } = await import("@workspace/db");
  const [firstCompany] = await db.select({ id: co.id }).from(co).orderBy(co.id).limit(1);
  const fallbackCompanyId = firstCompany?.id ?? 1;

  if (count === 0) {
    logger.info("No users found, seeding all default accounts...");
    for (const u of defaultUsers) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await db.insert(usersTable).values({
        username: u.username, passwordHash, fullName: u.fullName, role: u.role,
        companyId: fallbackCompanyId,
      });
      logger.info({ username: u.username, role: u.role }, "User seeded");
    }
  } else {
    // Upsert: eksik kullanıcıları ekle (yeni kullanıcılar eklendikçe seed genişleyebilir)
    const isProd = process.env.NODE_ENV === "production";
    for (const u of defaultUsers) {
      const [existing] = await db.select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
        .from(usersTable).where(eql(usersTable.username, u.username));
      if (!existing) {
        const passwordHash = await bcrypt.hash(u.password, 10);
        await db.insert(usersTable).values({
          username: u.username, passwordHash, fullName: u.fullName, role: u.role,
          companyId: fallbackCompanyId,
        });
        logger.info({ username: u.username, role: u.role }, "Missing user seeded");
      } else if (!isProd) {
        // Dev/test: default user'ın parolası beklenenle eşleşmiyorsa hash'i tazele
        const matches = await bcrypt.compare(u.password, existing.passwordHash);
        if (!matches) {
          const passwordHash = await bcrypt.hash(u.password, 10);
          await db.update(usersTable).set({ passwordHash }).where(eql(usersTable.id, existing.id));
          logger.info({ username: u.username }, "Default user password rehashed (dev)");
        }
      }
    }
  }

  logger.info("Default users seed complete");
}

async function seedDefaultProducts() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productsTable);

  if (count > 0) {
    logger.info({ count }, "Products already exist, skipping product seed");
    return;
  }

  logger.info(`No products found, seeding ${seedProducts.length} products...`);

  const CHUNK = 50;
  for (let i = 0; i < seedProducts.length; i += CHUNK) {
    const batch = seedProducts.slice(i, i + CHUNK);
    await db.insert(productsTable).values(
      batch.map((p) => ({
        productCode:   p.productCode   ?? undefined,
        barcode:       p.barcode       ?? undefined,
        name:          p.name,
        brand:         p.brand         ?? undefined,
        category:      p.category      ?? undefined,
        description:   p.description   ?? undefined,
        stock:         p.stock,
        minStock:      p.minStock,
        purchasePrice: p.purchasePrice,
        salePrice:     p.salePrice,
        profitPercent: p.profitPercent,
      }))
    );
    logger.info(`Inserted products ${i + 1}–${Math.min(i + CHUNK, seedProducts.length)}`);
  }

  logger.info("Products seeded successfully");
}

async function backfillSubscriptionsForCompanies() {
  // ─── Dalga 18: Subscription'sız şirketlere otomatik 30 günlük Kurumsal trial ata ──
  // Onboarding sırasında subscription oluşturulur, ama eski/seed company'lerde yok olabilir.
  const { eq: eqOp, inArray, and: andOp } = await import("drizzle-orm");
  const { companiesTable: co, companySubscriptionsTable: cs, subscriptionPlansTable: sp } = await import("@workspace/db");

  const companies = await db.select({ id: co.id, name: co.name, accountType: co.accountType }).from(co);
  if (companies.length === 0) return;

  // Mevcut aktif/trial subscriptionları olan companyId'leri bul
  const existing = await db
    .select({ companyId: cs.companyId })
    .from(cs)
    .where(inArray(cs.status, ["active", "trial", "grace_period"]));
  const haveSub = new Set(existing.map(r => r.companyId));

  const missing = companies.filter(c => !haveSub.has(c.id));
  if (missing.length === 0) return;

  // Trial planı bul (purchasing → satınalmacı, diğerleri → kurumsal trial)
  const [trialPlan] = await db.select().from(sp).where(eqOp(sp.slug, "pkg_trial_enterprise"));
  const [procPlan]  = await db.select().from(sp).where(eqOp(sp.slug, "pkg_procurement"));
  if (!trialPlan) {
    logger.warn("Trial enterprise plan not found — cannot backfill subscriptions");
    return;
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let inserted = 0;
  for (const c of missing) {
    const isPurchasing = c.accountType === "purchasing";
    const planId = isPurchasing && procPlan ? procPlan.id : trialPlan.id;
    // Per-company advisory lock + recheck inside transaction → idempotent under concurrent
    // onboarding flow (architect FAIL #4 fix). Same key seed as Sprint H billing CAS path.
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          // eslint-disable-next-line drizzle/enforce-update-with-where
          sql`SELECT pg_advisory_xact_lock(${0x53455450}::bigint, ${c.id}::int)`,
        );
        const stillMissing = await tx
          .select({ id: cs.id })
          .from(cs)
          .where(andOp(
            eqOp(cs.companyId, c.id),
            inArray(cs.status, ["active", "trial", "grace_period"]),
          ))
          .limit(1);
        if (stillMissing.length > 0) return; // başka bir process eklemiş, idempotent atla
        await tx.insert(cs).values({
          companyId: c.id,
          planId,
          status: "trial",
          billingCycle: "monthly",
          startedAt: now,
          trialEndsAt,
          notes: "Auto-backfill: 30-day enterprise trial",
        } as any);
        inserted++;
      });
    } catch (err) {
      logger.warn({ err, companyId: c.id }, "subscription_backfill_skipped");
    }
  }
  logger.info({ inserted, considered: missing.length }, "Backfilled missing subscriptions with 30-day trial");
}

async function runSeeds() {
  try {
    await seedDefaultCompanyIfMissing();
  } catch (err) {
    logger.error({ err }, "Failed to seed default company");
  }

  try {
    await seedDefaultUsers();
  } catch (err) {
    logger.error({ err }, "Failed to seed users");
  }

  try {
    await backfillUserCompanyIds();
  } catch (err) {
    logger.error({ err }, "Failed to backfill user companyIds");
  }

  try {
    await backfillOnboardingForDefaultCompany();
  } catch (err) {
    logger.error({ err }, "Failed to backfill onboarding completion");
  }

  try {
    await seedDefaultProducts();
  } catch (err) {
    logger.error({ err }, "Failed to seed products");
  }

  try {
    await seedSubscriptionPlans();
  } catch (err) {
    logger.error({ err }, "Failed to seed subscription plans");
  }

  try {
    await backfillSubscriptionsForCompanies();
  } catch (err) {
    logger.error({ err }, "Failed to backfill subscriptions for companies");
  }
}

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  // Run seeds after server is up so health check passes immediately
  runSeeds().catch((err) => logger.error({ err }, "Seed error"));
  // Start marketplace sync worker (in-process)
  try { startMarketplaceWorker(); } catch (e) { logger.error({ err: e }, "Marketplace worker failed to start"); }
  try { startMarketplaceSelfHealScheduler(); } catch (e) { logger.error({ err: e }, "Marketplace self-heal scheduler failed to start"); }
  // Sprint 72 — daily profit snapshots
  try { startProfitCron(); } catch (e) { logger.error({ err: e }, "Profit cron failed to start"); }
  // Dahili scheduler (db-backup, audit-archive) — opt-in via ENABLE_SCHEDULER=true
  import("./lib/scheduler.js").then(m => m.startScheduler()).catch(e => logger.error({ err: e }, "Scheduler failed to start"));
  // Sprint 80 — Generic outbox worker (domain_events dispatch)
  try { startOutboxWorker(5000); } catch (e) { logger.error({ err: e }, "Outbox worker failed to start"); }
  // Sprint 80 — TCMB EVDS kur senkronu (her 4 saatte + boot'ta)
  setTimeout(() => { fetchAndStoreTcmbRates().catch(e => logger.warn({ err: e }, "TCMB initial fetch failed")); }, 30_000);
  setInterval(() => { fetchAndStoreTcmbRates().catch(() => {}); }, 4 * 60 * 60 * 1000);
  // Sprint 80 — Idempotency key TTL temizliği (saatte bir)
  setInterval(() => { cleanupExpiredIdempotencyKeys().catch(() => {}); }, 60 * 60 * 1000);
  // Dalga 20 — Trial otomasyonu (saatlik tarama: 7g/3g/1g uyarı + 0g'de status transition)
  import("./services/trialWatcher.js").then(m => m.startTrialWatcher()).catch(e => logger.error({ err: e }, "Trial watcher failed to start"));
});
