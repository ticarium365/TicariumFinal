import { Router, Request, Response } from "express";
import { db, companySettingsTable, auditLogsTable, productsTable, salesTable, stockMovementsTable } from "@workspace/db";
import { eq, count as dbCount } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import multer from "multer";

const router = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname);
    cb(ok ? null : new Error("Yalnızca resim dosyaları kabul edilir") as any, ok);
  },
});

async function getOrCreateSettings(cid: number, companyName: string) {
  let [s] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, cid));
  if (!s) {
    [s] = await db.insert(companySettingsTable).values({ companyId: cid, companyName }).returning();
  }
  return s;
}

// GET /api/settings
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings(req.companyId, req.company.name);
    res.json(s);
  } catch (err) {
    req.log?.error({ err }, "Get settings error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// PUT /api/settings
router.put("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const {
      companyName, iban, bankName, accountHolder, phone, email, address,
      website, taxNumber, primaryColor, currency, taxRate,
    } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const fields: Record<string, unknown> = {
      companyName, iban, bankName, accountHolder, phone, email, address,
      website, taxNumber, primaryColor, currency, taxRate,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updateData[k] = v;
    }

    let [s] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, cid));
    if (!s) {
      [s] = await db.insert(companySettingsTable).values({
        companyId: cid,
        companyName: companyName ?? req.company.name,
        ...updateData,
      }).returning();
    } else {
      [s] = await db.update(companySettingsTable)
        .set(updateData)
        .where(eq(companySettingsTable.id, s.id))
        .returning();
    }

    res.json(s);
  } catch (err) {
    req.log?.error({ err }, "Update settings error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// GET /api/settings/onboarding-status
router.get("/onboarding-status", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings(req.companyId, req.company.name);
    const [productCount] = await db
      .select({ count: dbCount() })
      .from(productsTable)
      .where(eq(productsTable.companyId, req.companyId));

    res.json({
      completed: s.onboardingCompleted ?? false,
      hasProducts: (productCount?.count ?? 0) > 0,
      hasLogo: !!s.logoUrl,
      hasColor: !!(s.primaryColor && s.primaryColor !== "#2563eb"),
      companyName: s.companyName,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      currency: s.currency,
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding status error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// POST /api/settings/onboarding-complete
router.post("/onboarding-complete", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    let [s] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, cid));
    if (!s) {
      [s] = await db.insert(companySettingsTable).values({ companyId: cid, companyName: req.company.name, onboardingCompleted: true }).returning();
    } else {
      [s] = await db.update(companySettingsTable)
        .set({ onboardingCompleted: true, updatedAt: new Date() })
        .where(eq(companySettingsTable.id, s.id))
        .returning();
    }

    await db.insert(auditLogsTable).values({
      companyId: cid,
      userId: req.session.userId,
      username: req.session.username,
      action: "ONBOARDING_COMPLETE",
      entity: "company_settings",
      entityId: s.id,
      details: null,
      ipAddress: req.ip ?? null,
    }).catch(() => {});

    res.json({ completed: true });
  } catch (err) {
    req.log?.error({ err }, "Onboarding complete error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// POST /api/settings/logo — logo yükle (base64 olarak sakla)
router.post("/logo", requireAuth, requireAdmin, logoUpload.single("logo"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Logo dosyası yüklenmedi", details: null } });
      return;
    }

    const mime = req.file.mimetype || "image/jpeg";
    const logoUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    const cid = req.companyId;

    let [s] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, cid));
    if (!s) {
      [s] = await db.insert(companySettingsTable).values({ companyId: cid, companyName: req.company.name, logoUrl }).returning();
    } else {
      [s] = await db.update(companySettingsTable)
        .set({ logoUrl, updatedAt: new Date() })
        .where(eq(companySettingsTable.id, s.id))
        .returning();
    }

    res.json({ logoUrl: s.logoUrl });
  } catch (err) {
    req.log?.error({ err }, "Logo upload error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// DELETE /api/settings/logo — logoyu kaldır
router.delete("/logo", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    await db.update(companySettingsTable)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(companySettingsTable.companyId, cid));
    res.json({ logoUrl: null });
  } catch (err) {
    req.log?.error({ err }, "Delete logo error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// POST /api/settings/reset-demo — demo verisi sıfırla (sadece dev/demo)
router.post("/reset-demo", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bu işlem production ortamında devre dışıdır", details: null } });
      return;
    }

    const cid = req.companyId;

    // Sıralı silme: bağımlı tablolar önce
    await db.delete(salesTable).where(eq(salesTable.companyId, cid));
    await db.delete(stockMovementsTable).where(eq(stockMovementsTable.companyId, cid));
    await db.delete(productsTable).where(eq(productsTable.companyId, cid));

    await db.insert(auditLogsTable).values({
      companyId: cid,
      userId: req.session.userId,
      username: req.session.username,
      action: "DEMO_RESET",
      entity: "company",
      entityId: cid,
      details: JSON.stringify({ clearedBy: req.session.username }),
      ipAddress: req.ip ?? null,
    }).catch(() => {});

    res.json({ message: "Demo verisi temizlendi", companyId: cid });
  } catch (err) {
    req.log?.error({ err }, "Demo reset error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

export default router;
