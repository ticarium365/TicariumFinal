import type { Router, RequestHandler } from "express";
import { requireRole } from "../../middlewares/auth.js";
import { buildMarketplaceProfitAutomationV1 } from "../../lib/marketplace-profit-automation.js";

/** Kâr sinyalleri — öneri salt okunur; fiyat/stok yazılmaz. */
export function registerMarketplaceProfitRoutes(router: Router, _opts: { requireWriter: RequestHandler }): void {
  router.get("/profit-automation", requireRole(["admin", "staff", "super_admin"]), async (req, res) => {
    try {
      const bundle = await buildMarketplaceProfitAutomationV1(req.companyId!);
      res.json(bundle);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "profit_automation_failed" });
    }
  });
}

