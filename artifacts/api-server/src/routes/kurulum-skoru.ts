import { Router, type Request, type Response } from "express";
import { db, usersTable, companiesTable, companySettingsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { computeChecklist } from "../lib/setup-checklist.js";

const router = Router();

// GET /api/kurulum-skoru — bu tenant'ın checklist'i
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId ?? req.session!.user!.companyId;
    const uid = req.session!.user!.id;
    const result = await computeChecklist(cid);
    const u = await db
      .select({ dismissedAt: usersTable.setupChecklistDismissedAt })
      .from(usersTable)
      .where(eq(usersTable.id, uid))
      .limit(1);
    res.json({
      ...result,
      dismissedAt: u[0]?.dismissedAt ?? null,
    });
  } catch (err) {
    console.error("kurulum-skoru error", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null },
    });
  }
});

// POST /api/kurulum-skoru/dismiss — ilk giriş popover'ı bir daha gösterilmesin
router.post("/dismiss", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.session!.user!.id;
    await db
      .update(usersTable)
      .set({ setupChecklistDismissedAt: new Date() })
      .where(eq(usersTable.id, uid));
    res.json({ ok: true });
  } catch (err) {
    console.error("kurulum-skoru dismiss error", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null },
    });
  }
});

// Süper admin için ayrı router — /api/admin/musteri-doluluk altına mount edilir
export const adminMusteriDolulukRouter = Router();

adminMusteriDolulukRouter.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  async (_req: Request, res: Response) => {
    try {
      const companies = await db
        .select({
          id: companiesTable.id,
          name: companiesTable.name,
          subdomain: companiesTable.subdomain,
        })
        .from(companiesTable)
        .where(eq(companiesTable.isActive, true));

      const rows = await Promise.all(
        companies.map(async (c) => {
          try {
            const r = await computeChecklist(c.id);
            const settings = await db
              .select({
                sector: companySettingsTable.sector,
                companyName: companySettingsTable.companyName,
              })
              .from(companySettingsTable)
              .where(eq(companySettingsTable.companyId, c.id))
              .limit(1);
            return {
              companyId: c.id,
              companyName: settings[0]?.companyName ?? c.name,
              subdomain: c.subdomain,
              sector: settings[0]?.sector ?? null,
              scorePercent: r.scorePercent,
              itemsDone: r.itemsDone,
              itemsTotal: r.itemsTotal,
              categories: r.categories.map((cat) => ({
                id: cat.id,
                label: cat.label,
                scorePercent: cat.scorePercent,
              })),
              missing: r.categories
                .flatMap((cat) => cat.items)
                .filter((i) => !i.done && i.weight >= 2)
                .map((i) => i.label),
            };
          } catch {
            return {
              companyId: c.id,
              companyName: c.name,
              subdomain: c.subdomain,
              sector: null,
              scorePercent: 0,
              itemsDone: 0,
              itemsTotal: 0,
              categories: [],
              missing: ["(skor hesaplanamadı)"],
            };
          }
        }),
      );

      // Düşük skordan yüksek skora sırala (önce ilgilenilmesi gerekenler)
      rows.sort((a, b) => a.scorePercent - b.scorePercent);

      res.json({
        totalTenants: rows.length,
        avgScore:
          rows.length > 0
            ? Math.round(rows.reduce((a, r) => a + r.scorePercent, 0) / rows.length)
            : 0,
        rows,
      });
    } catch (err) {
      console.error("musteri-doluluk error", err);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null },
      });
    }
  },
);

export default router;
