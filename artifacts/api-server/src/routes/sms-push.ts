import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { sendSms } from "../services/sms/netgsm-provider.js";
import { registerPushToken, sendExpoPush } from "../services/push/expo-push.js";

const router: IRouter = Router();

router.post("/sms/send", requireAuth, async (req: Request, res: Response) => {
  const { toPhone, body } = req.body || {};
  if (!toPhone || !body) return res.status(400).json({ error: "toPhone ve body zorunlu" });
  if (body.length > 1000) return res.status(400).json({ error: "Mesaj çok uzun (max 1000 karakter)" });
  const result = await sendSms({ companyId: req.companyId, toPhone, body });
  res.json(result);
});

router.post("/push/register", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { token, deviceInfo } = req.body || {};
  if (!userId || !token) return res.status(400).json({ error: "token zorunlu" });
  try {
    const id = await registerPushToken({ userId, companyId: req.companyId, token, deviceInfo });
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "register_failed" });
  }
});

router.post("/push/send", requireAuth, async (req: Request, res: Response) => {
  const { userId, title, body, data } = req.body || {};
  if (!userId || !title || !body) return res.status(400).json({ error: "userId, title, body zorunlu" });
  const result = await sendExpoPush({ userId, title, body, data });
  res.json(result);
});

export default router;
