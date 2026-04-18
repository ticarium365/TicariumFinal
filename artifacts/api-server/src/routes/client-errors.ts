import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";

const router: IRouter = Router();

const errorLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/client-errors", errorLimit, async (req: Request, res: Response) => {
  try {
    const {
      message = "(boş)",
      stack,
      url,
      userAgent,
      componentStack,
      severity = "error",
    } = req.body ?? {};
    const trimmedStack = typeof stack === "string" ? stack.slice(0, 4000) : undefined;
    const trimmedComp = typeof componentStack === "string" ? componentStack.slice(0, 2000) : undefined;
    const trimmedMsg = String(message).slice(0, 500);
    const trimmedUrl = url ? String(url).slice(0, 500) : undefined;
    const trimmedUa = userAgent ? String(userAgent).slice(0, 300) : undefined;

    logger.error({
      type: "client_error",
      severity,
      message: trimmedMsg,
      stack: trimmedStack,
      componentStack: trimmedComp,
      url: trimmedUrl,
      userAgent: trimmedUa,
      companyId: req.companyId ?? null,
      userId: (req.session as any)?.userId ?? null,
      ip: req.ip,
    }, "[client_error] " + trimmedMsg);

    if (req.companyId && (req.session as any)?.userId) {
      await audit(req, "CLIENT_ERROR", "ui", null, {
        message: trimmedMsg,
        url: trimmedUrl,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true });
  }
});

export default router;
