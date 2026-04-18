import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { listRuntimeFlags, upsertRuntimeFlag, deleteRuntimeFlag, isRuntimeFlagEnabled } from "../services/feature-flags-runtime.js";

const router: IRouter = Router();

router.get("/runtime-flags", requireAuth, requireRole(["admin", "super_admin"]), async (_req, res) => {
  const flags = await listRuntimeFlags();
  res.json({ flags });
});

router.post("/runtime-flags", requireAuth, requireRole(["super_admin"]), async (req: Request, res: Response) => {
  const { key, companyId, enabled, rolloutPct, description, expiresAt } = req.body || {};
  if (!key) return res.status(400).json({ error: "key zorunlu" });
  await upsertRuntimeFlag({
    key,
    companyId: companyId ?? null,
    enabled: !!enabled,
    rolloutPct: rolloutPct ?? 100,
    description: description ?? null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
  res.json({ ok: true });
});

router.delete("/runtime-flags/:id", requireAuth, requireRole(["super_admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad Request" });
  await deleteRuntimeFlag(id);
  res.json({ ok: true });
});

router.get("/runtime-flags/check/:key", requireAuth, async (req: Request, res: Response) => {
  const cid = req.companyId;
  if (!cid) return res.status(401).json({ error: "Unauthorized" });
  const enabled = await isRuntimeFlagEnabled(req.params.key, cid);
  res.json({ key: req.params.key, enabled });
});

export default router;
