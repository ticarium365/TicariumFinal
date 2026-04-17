import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, productsTable } from "@workspace/db";
import { seedSubscriptionPlans } from "./routes/subscriptions.js";
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

async function seedDefaultUsers() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const defaultUsers = [
    { username: "admin",     password: "admin123",  fullName: "Yönetici",       role: "admin"  as const },
    { username: "talha",     password: "talha123",  fullName: "Talha",          role: "admin"  as const },
    { username: "nihat",     password: "nihat123",  fullName: "Nihat",          role: "admin"  as const },
    { username: "cenan",     password: "cenan123",  fullName: "Cenan",          role: "admin"  as const },
    { username: "personel",  password: "staff123",  fullName: "Personel",       role: "staff"  as const },
    { username: "goruntule", password: "staff123",  fullName: "Görüntüleyici",  role: "viewer" as const },
  ];

  if (count === 0) {
    logger.info("No users found, seeding all default accounts...");
    for (const u of defaultUsers) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await db.insert(usersTable).values({
        username: u.username, passwordHash, fullName: u.fullName, role: u.role,
      });
      logger.info({ username: u.username, role: u.role }, "User seeded");
    }
  } else {
    // Upsert: eksik kullanıcıları ekle (yeni kullanıcılar eklendikçe seed genişleyebilir)
    const { eq: eql } = await import("drizzle-orm");
    // İlk şirketi bul (prosan = co1)
    const { companiesTable: co } = await import("@workspace/db");
    const [firstCompany] = await db.select({ id: co.id }).from(co).orderBy(co.id).limit(1);
    const fallbackCompanyId = firstCompany?.id ?? 1;

    for (const u of defaultUsers) {
      const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eql(usersTable.username, u.username));
      if (existing.length === 0) {
        const passwordHash = await bcrypt.hash(u.password, 10);
        await db.insert(usersTable).values({
          username: u.username, passwordHash, fullName: u.fullName, role: u.role,
          companyId: fallbackCompanyId,
        });
        logger.info({ username: u.username, role: u.role }, "Missing user seeded");
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

async function runSeeds() {
  try {
    await seedDefaultUsers();
  } catch (err) {
    logger.error({ err }, "Failed to seed users");
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
}

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  // Run seeds after server is up so health check passes immediately
  runSeeds().catch((err) => logger.error({ err }, "Seed error"));
});
