import { db, usersTable, companiesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger.js";

/**
 * Tek seferlik kurucu `super_admin` oluşturma — yalnızca `FOUNDER_BOOTSTRAP=1` ve
 * DB'de hiç `super_admin` yokken çalışır. Production'da şifre min 12 karakter.
 *
 * Sonrasında env'den `FOUNDER_BOOTSTRAP`, `FOUNDER_BOOTSTRAP_PASSWORD` ve tercihen
 * tüm `FOUNDER_BOOTSTRAP_*` anahtarlarını kaldırın.
 */
export async function runFounderBootstrapIfRequested(): Promise<void> {
  if (process.env.FOUNDER_BOOTSTRAP !== "1") return;

  const emailRaw = (process.env.FOUNDER_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  const password = process.env.FOUNDER_BOOTSTRAP_PASSWORD || "";
  const fullName = (process.env.FOUNDER_BOOTSTRAP_FULL_NAME || "Platform Kurucusu").trim().slice(0, 200);
  let username = (process.env.FOUNDER_BOOTSTRAP_USERNAME || "").trim().slice(0, 64);

  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    logger.error("founder_bootstrap_invalid_email");
    return;
  }

  const minLen = process.env.NODE_ENV === "production" ? 12 : 8;
  if (password.length < minLen) {
    logger.error({ minLen }, "founder_bootstrap_password_too_short");
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.role, "super_admin"));

  if (Number(count) > 0) {
    logger.warn("founder_bootstrap_skipped_super_admin_exists");
    return;
  }

  const [emailDup] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${emailRaw}`)
    .limit(1);
  if (emailDup) {
    logger.error({ email: emailRaw }, "founder_bootstrap_email_taken");
    return;
  }

  if (!username) {
    username = emailRaw.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "founder";
  }

  const [unameDup] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);
  if (unameDup) {
    logger.error({ username }, "founder_bootstrap_username_taken");
    return;
  }

  const [firstCompany] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .orderBy(companiesTable.id)
    .limit(1);

  if (!firstCompany) {
    logger.error("founder_bootstrap_no_company");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(usersTable).values({
    companyId: firstCompany.id,
    username,
    passwordHash,
    fullName: fullName.length > 0 ? fullName : "Platform Kurucusu",
    email: emailRaw,
    role: "super_admin",
    isActive: true,
  });

  logger.warn(
    { username, email: emailRaw },
    "founder_bootstrap_complete_remove_FOUNDER_BOOTSTRAP_from_env",
  );
}
