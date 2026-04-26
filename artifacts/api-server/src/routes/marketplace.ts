import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { registerMarketplaceCoreRoutes } from "./marketplace/marketplace-core.js";
import { registerMarketplaceWorkerRoutes } from "./marketplace/marketplace-workers.js";
import { registerMarketplaceObservabilityRoutes } from "./marketplace/marketplace-observability.js";
import { registerMarketplaceSelfHealRoutes } from "./marketplace/marketplace-self-heal.js";
import { registerMarketplaceProfitRoutes } from "./marketplace/marketplace-profit.js";
import { registerMarketplaceAutopilotRoutes } from "./marketplace/marketplace-autopilot-mount.js";
import { registerMarketplaceOrdersRoutes } from "./marketplace/marketplace-orders.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

// Entry point keeps auth + requireWriter; route implementations are split by domain.
registerMarketplaceCoreRoutes(router, { requireWriter });
registerMarketplaceWorkerRoutes(router, { requireWriter });
registerMarketplaceObservabilityRoutes(router, { requireWriter });
registerMarketplaceSelfHealRoutes(router, { requireWriter });
registerMarketplaceProfitRoutes(router, { requireWriter });
registerMarketplaceAutopilotRoutes(router, { requireWriter });
registerMarketplaceOrdersRoutes(router, { requireWriter });

export default router;
