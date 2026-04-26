import type { Router, RequestHandler } from "express";
import { requireRole } from "../../middlewares/auth.js";
import { buildMarketplaceWorkerObservabilityV1 } from "../../lib/marketplace-worker-observability.js";

/** Sync worker gözlemi — kuyruk, gecikme, kümeler, hesap başına dürüst durum (yeşil uydurma yok). */
export function registerMarketplaceObservabilityRoutes(router: Router, _opts: { requireWriter: RequestHandler }): void {
  router.get("/worker-observability", requireRole(["admin", "super_admin"]), async (req, res) => {
    try {
      const bundle = await buildMarketplaceWorkerObservabilityV1(req.companyId!);
      res.json(bundle);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "worker_observability_failed" });
    }
  });
}

