import { Router, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { seedDemoDataInTx, type DemoSector } from "../lib/demo-data.js";

const router = Router();

/** Kiracı–oturum hizası: `enforceTenantSessionAlignment` (app.ts) global uygulanır. */

/**
 * GET /api/onboarding/status
 * Mevcut tenant için onboarding ve demo seed durumunu döner.
 */
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId!;
    const [c] = await db
      .select({
        sector: companiesTable.sector,
        onboardingCompletedAt: companiesTable.onboardingCompletedAt,
        demoSeededAt: companiesTable.demoSeededAt,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, cid));

    res.json({
      sector: c?.sector ?? null,
      onboardingCompleted: !!c?.onboardingCompletedAt,
      demoSeeded: !!c?.demoSeededAt,
    });
  } catch (e) {
    console.error("onboarding/status error", e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

/**
 * POST /api/onboarding/complete  (admin)
 * Wizard'ın son adımı — sektör + onboarding flag'ini set eder.
 */
router.post(
  "/complete",
  requireAuth,
  requireRole(["admin"]),
  async (req: Request, res: Response) => {
    try {
      const cid = req.companyId!;
      const { sector } = req.body as { sector?: DemoSector | "other" };
      if (sector && !["industrial", "retail", "other"].includes(sector)) {
        return void res.status(400).json(Errors.badRequest("Geçersiz sektör"));
      }
      await db
        .update(companiesTable)
        .set({
          sector: sector ?? "other",
          onboardingCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companiesTable.id, cid));

      await audit({
        req,
        action: "COMPANY_UPDATE",
        entity: "companies",
        entityId: cid,
        details: { onboarding: "completed", sector: sector ?? "other" },
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("onboarding/complete error", e);
      res.status(500).json({ message: "Sunucu hatası" });
    }
  },
);

/**
 * POST /api/onboarding/seed-demo  (admin)
 * body: { sector: "industrial" | "retail" }
 *
 * Atomik flow (architect bulgu #2,#3):
 *   db.transaction:
 *     1. UPDATE companies SET demo_seeded_at=now(), sector=?, onboarding_completed_at=?
 *        WHERE id=? AND demo_seeded_at IS NULL  RETURNING id
 *     2. 0 satır döndüyse → 409 (yarış kazanılmadı veya ikinci çağrı)
 *     3. Aksi halde → seedDemoDataInTx ile aynı tx içinde seed
 *
 * Bu sayede:
 *   - İki paralel istek yarışırsa yalnız biri başarılı olur (CAS).
 *   - Seed başarısız olursa tüm transaction rollback → flag de geri alınır,
 *     yarısı yazılı veri kalmaz.
 *   - Unique constraint çakışmaları (aynı barkod/kod) deterministik 409
 *     yerine 500'e çıkmaz; çünkü ikinci istek zaten claim alamayacak.
 */
router.post(
  "/seed-demo",
  requireAuth,
  requireRole(["admin"]),
  async (req: Request, res: Response) => {
    const cid = req.companyId!;
    const uid = (req.session as any)?.user?.id ?? null;
    const { sector } = req.body as { sector?: DemoSector };

    if (!sector || !["industrial", "retail"].includes(sector)) {
      return void res
        .status(400)
        .json(Errors.badRequest("sector 'industrial' veya 'retail' olmalı"));
    }

    try {
      const summary = await db.transaction(async (tx) => {
        // (1) Atomik claim — flag NULL ise set et
        const claimed = await tx
          .update(companiesTable)
          .set({
            sector,
            demoSeededAt: new Date(),
            onboardingCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(eq(companiesTable.id, cid), isNull(companiesTable.demoSeededAt)),
          )
          .returning({ id: companiesTable.id });

        if (claimed.length === 0) {
          // İkinci istek veya zaten seed edilmiş — özel bir Error fırlat,
          // catch tarafında 409 cevabı döndüreceğiz.
          throw Object.assign(new Error("ALREADY_SEEDED"), { code: "ALREADY_SEEDED" });
        }

        // (2) Seed et
        return await seedDemoDataInTx(tx, { companyId: cid, sector, userId: uid });
      });

      await audit({
        req,
        action: "COMPANY_UPDATE",
        entity: "companies",
        entityId: cid,
        details: { onboarding: "demo_seeded", sector, summary },
      });

      res.json({ ok: true, summary });
    } catch (e: any) {
      if (e?.code === "ALREADY_SEEDED") {
        return void res
          .status(409)
          .json({ message: "Bu firma için demo veriler zaten yüklenmiş." });
      }
      console.error("onboarding/seed-demo error", e);
      res
        .status(500)
        .json({ message: "Demo veriler yüklenirken bir hata oluştu", detail: e?.message });
    }
  },
);

export default router;
