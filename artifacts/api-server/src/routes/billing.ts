/**
 * Dalga 22 — Billing routes (Iyzico + mock).
 *
 * Entry point file kept stable. Implementation is split into registerX(router)
 * modules under `routes/billing/`.
 */
import { Router } from "express";
import { registerBillingIyzicoFlow } from "./billing/billing-iyzico-flow";
import { registerBillingReadonlyRoutes } from "./billing/billing-readonly";

const router = Router();

registerBillingIyzicoFlow(router);
registerBillingReadonlyRoutes(router);

export default router;
