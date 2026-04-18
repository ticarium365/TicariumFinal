import { Router, type Request, type Response, type IRouter } from "express";
import { db, contactRequestsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(160),
});

// POST /api/contact — anonim, "Sizi arayalım" formu
router.post("/", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz form bilgileri", errors: parsed.error.flatten() });
  }
  const { fullName, companyName, phone, email } = parsed.data;
  const [row] = await db.insert(contactRequestsTable).values({
    fullName,
    companyName: companyName || null,
    phone,
    email,
    status: "new",
  }).returning({ id: contactRequestsTable.id });
  res.json({ ok: true, id: row?.id });
});

// GET /api/contact/admin — super admin: tüm talepler
router.get("/admin", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  const rows = await db.select().from(contactRequestsTable).orderBy(desc(contactRequestsTable.createdAt));
  res.json(rows);
});

// PATCH /api/contact/admin/:id — durum güncelle
router.patch("/admin/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });
  const status = String(req.body?.status || "");
  if (!["new", "contacted", "archived"].includes(status)) {
    return res.status(400).json({ message: "Bad status" });
  }
  const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.notes = notes;
  if (status === "contacted") patch.contactedAt = new Date();
  await db.update(contactRequestsTable).set(patch).where(eq(contactRequestsTable.id, id));
  res.json({ ok: true });
});

export default router;
