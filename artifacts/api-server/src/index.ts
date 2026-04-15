import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

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
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    if (count > 0) {
      logger.info({ count }, "Users already exist, skipping seed");
      return;
    }

    logger.info("No users found, seeding default accounts...");

    const defaultUsers = [
      { username: "admin",    password: "admin123",  fullName: "Yönetici",        role: "admin"  as const },
      { username: "talha",    password: "talha123",  fullName: "Talha",           role: "admin"  as const },
      { username: "nihat",    password: "nihat123",  fullName: "Nihat",           role: "admin"  as const },
      { username: "cenan",    password: "cenan123",  fullName: "Cenan",           role: "admin"  as const },
      { username: "personel", password: "staff123",  fullName: "Personel",        role: "staff"  as const },
      { username: "goruntule",password: "staff123",  fullName: "Görüntüleyici",   role: "viewer" as const },
    ];

    for (const u of defaultUsers) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await db.insert(usersTable).values({
        username: u.username,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
      });
      logger.info({ username: u.username, role: u.role }, "User seeded");
    }

    logger.info("Default users seeded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed default users");
  }
}

async function start() {
  await seedDefaultUsers();

  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start();
