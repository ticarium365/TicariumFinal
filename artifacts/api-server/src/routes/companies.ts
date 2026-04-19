import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, companiesTable, usersTable, productsTable, salesTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { validateSubdomain, listReservedSubdomains } from "../lib/reserved-subdomains.js";

const router = Router();

// GET /api/companies/reserved-subdomains — onboarding UI'da rezerve listesini göster
router.get("/reserved-subdomains", requireAuth, requireSuperAdmin, (_req, res) => {
  res.json({ reserved: listReservedSubdomains() });
});

// GET /api/companies — Tüm şirketleri listele (super admin)
router.get("/", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const companies = await db.select().from(companiesTable).orderBy(companiesTable.createdAt);

    const enriched = await Promise.all(companies.map(async (c) => {
      const [pCount, uCount, sCount] = await Promise.all([
        db.select({ count: count() }).from(productsTable).where(eq(productsTable.companyId, c.id)),
        db.select({ count: count() }).from(usersTable).where(eq(usersTable.companyId, c.id)),
        db.select({ count: count() }).from(salesTable).where(eq(salesTable.companyId, c.id)),
      ]);
      return {
        ...c,
        productCount: pCount[0]?.count ?? 0,
        userCount: uCount[0]?.count ?? 0,
        saleCount: sCount[0]?.count ?? 0,
      };
    }));

    res.json(enriched);
  } catch (err) {
    req.log?.error({ err }, "List companies error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/companies — Yeni şirket oluştur (super admin)
router.post("/", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, subdomain, primaryColor, logoUrl, adminUsername, adminPassword, adminFullName } = req.body;

    if (!name || !subdomain || !adminUsername || !adminPassword || !adminFullName) {
      res.status(400).json({ error: "Bad Request", message: "name, subdomain, adminUsername, adminPassword ve adminFullName zorunlu" });
      return;
    }

    // Subdomain doğrulama: format + uzunluk + rezerve liste (admin/api/www/...)
    const sub = validateSubdomain(subdomain);
    if (!sub.ok) {
      res.status(400).json({ error: "Bad Request", code: sub.code, message: sub.message });
      return;
    }
    const cleanSubdomain = sub.value;

    // Şirket oluştur — explicit returning whitelist (response leak koruması)
    const [company] = await db.insert(companiesTable).values({
      name,
      subdomain: cleanSubdomain,
      primaryColor: primaryColor || "#2563eb",
      logoUrl: logoUrl || null,
      isActive: true,
    }).returning({
      id: companiesTable.id,
      name: companiesTable.name,
      subdomain: companiesTable.subdomain,
      primaryColor: companiesTable.primaryColor,
      logoUrl: companiesTable.logoUrl,
      isActive: companiesTable.isActive,
      createdAt: companiesTable.createdAt,
    });

    // Admin kullanıcı oluştur
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const [adminUser] = await db.insert(usersTable).values({
      companyId: company!.id,
      username: adminUsername,
      passwordHash,
      fullName: adminFullName,
      role: "admin",
      isActive: true,
    }).returning({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      role: usersTable.role,
    });

    res.status(201).json({ company, adminUser });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Bu subdomain zaten kullanılıyor" });
      return;
    }
    req.log?.error({ err }, "Create company error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/companies/:id — Şirket detayı (super admin)
router.get("/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
    if (!company) {
      res.status(404).json({ error: "Not Found", message: "Şirket bulunamadı" });
      return;
    }

    const users = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      role: usersTable.role,
      isActive: usersTable.isActive,
    }).from(usersTable).where(eq(usersTable.companyId, id));

    res.json({ ...company, users });
  } catch (err) {
    req.log?.error({ err }, "Get company error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/companies/:id — Şirket güncelle (super admin)
router.patch("/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const { name, primaryColor, logoUrl, isActive, planType, trialEndsAt, trialDays } = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (planType !== undefined) updateData.planType = planType;

    // Trial bitiş tarihini doğrudan tarihe göre veya gün sayısına göre ayarla
    if (trialEndsAt !== undefined) {
      updateData.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
    } else if (trialDays !== undefined && trialDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + Number(trialDays));
      updateData.trialEndsAt = d;
      updateData.planType = "trial";
    }

    const [company] = await db.update(companiesTable).set(updateData).where(eq(companiesTable.id, id)).returning();
    if (!company) {
      res.status(404).json({ error: "Not Found", message: "Şirket bulunamadı" });
      return;
    }
    res.json(company);
  } catch (err) {
    req.log?.error({ err }, "Update company error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
