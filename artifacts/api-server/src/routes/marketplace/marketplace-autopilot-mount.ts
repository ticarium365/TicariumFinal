import type { Router, RequestHandler } from "express";
import marketplaceAutopilotRouter from "../marketplace-autopilot.js";

export function registerMarketplaceAutopilotRoutes(router: Router, _opts: { requireWriter: RequestHandler }): void {
  router.use("/autopilot", marketplaceAutopilotRouter);
}

