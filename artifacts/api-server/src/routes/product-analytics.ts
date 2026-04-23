import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { db, productFunnelEventsTable } from "@workspace/db";

const router = Router();

const EVENT_RE = /^[a-z][a-z0-9_.]{0,79}$/i;

/** Bu anahtarlar DB'ye yazılır — founder / huni sorguları için. */
const PERSIST_TO_DB = new Set([
  "billing_checkout_started",
  "trial_cta_click",
  "pricing_view",
  "trial_layout_strip_view",
  "trial_dashboard_banner_view",
  "expired_cta_click",
  "billing_return_success",
  "billing_return_error",
  "billing_return_redirect_error",
  "billing_topup_checkout_started",
  "retention_hint_view",
  "retention_hint_cta",
  "subscription_cancel_rescue_view",
  "subscription_cancel_confirmed",
  "overdue_invoice_recovered",
  "grace_period_rescue_view",
  "grace_period_reactivate_success",
  "post_cancel_comeback_view",
  "post_cancel_rescue_offer_click",
  "overdue_invoice_recovered_after_reminder",
  "collection_reminder_action_created",
  "collection_reminder_action_updated",
  "plan_upgraded",
]);

/** İstemciden gelen properties: sadece düz alanlar, boyut sınırlı (PII kaçınımı). */
function sanitizeProps(raw: unknown): Record<string, string | number | boolean> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n++ >= 24) break;
    if (typeof k !== "string" || k.length > 48) continue;
    if (typeof v === "string" && v.length <= 240) out[k] = v.slice(0, 240);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Ürün / funnel ölçümü: yapılandırılmış log + seçili olaylar için kalıcı satır.
 */
router.post("/track", requireAuth, async (req: Request, res: Response) => {
  const event = typeof req.body?.event === "string" ? req.body.event.trim() : "";
  if (!event || !EVENT_RE.test(event)) {
    return res.status(400).json({ message: "Geçersiz event adı" });
  }
  const user = req.session!.user!;
  const props = sanitizeProps(req.body?.properties);
  const companyId = req.companyId ?? user.companyId;
  logger.info({
    productEvent: true,
    event,
    companyId,
    userId: user.id,
    role: user.role,
    properties: props,
  }, "product_event");

  res.status(204).end();
  if (companyId && PERSIST_TO_DB.has(event)) {
    const payload = JSON.stringify(props).slice(0, 4000);
    void (async () => {
      try {
        await db.insert(productFunnelEventsTable).values({
          companyId,
          userId: user.id,
          eventKey: event,
          props: payload,
        });
      } catch (err) {
        logger.warn({ err, event, companyId }, "product_funnel_event_persist_failed");
      }
    })();
  }
  return;
});

export default router;
