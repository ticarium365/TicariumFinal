import type { Router, RequestHandler } from "express";
import { requireRole } from "../../middlewares/auth.js";
import { buildMarketplaceSelfHealingBundleV1 } from "../../services/marketplace/self-heal.js";

/** Otomatik kurtarma audit + hesap önerileri (yıkıcı işlem yok). */
export function registerMarketplaceSelfHealRoutes(router: Router, _opts: { requireWriter: RequestHandler }): void {
  router.get("/self-healing", requireRole(["admin", "super_admin"]), async (req, res) => {
    try {
      const bundle = await buildMarketplaceSelfHealingBundleV1(req.companyId!);
      res.json(bundle);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "self_healing_bundle_failed" });
    }
  });
}

