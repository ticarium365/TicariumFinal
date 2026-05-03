import { Router, type Request, type Response, type IRouter } from "express";
import { db, contactRequestsTable, companiesTable } from "@workspace/db";
import { desc, eq, count, gte } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

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
  logger.info(
    { event: "contact_request_stored", id: row?.id, source: "public_form" },
    "lead_persisted_super_admin_can_review",
  );
  return res.json({ ok: true, id: row?.id });
});

// GET /api/contact/admin/summary — hub için hafif sayaçlar (tüm talep listesini çekmez)
router.get("/admin/summary", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  const [openRow] = await db
    .select({ c: count() })
    .from(contactRequestsTable)
    .where(eq(contactRequestsTable.status, "new"));
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [signupRow] = await db
    .select({ c: count() })
    .from(companiesTable)
    .where(gte(companiesTable.createdAt, weekAgo));
  return res.json({
    openContactRequests: Number(openRow?.c ?? 0),
    newCompaniesLast7Days: Number(signupRow?.c ?? 0),
  });
});

// GET /api/contact/admin — super admin: tüm talepler
router.get("/admin", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  const rows = await db.select().from(contactRequestsTable).orderBy(desc(contactRequestsTable.createdAt));
  return res.json(rows);
});

// PATCH /api/contact/admin/:id — durum güncelle
router.patch("/admin/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });
  const body = updateSchema.parse(req.body);
  const patch: Record<string, unknown> = { status: body.status };
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status === "contacted") patch.contactedAt = new Date();
  await db.update(contactRequestsTable).set(patch).where(eq(contactRequestsTable.id, id));
  return res.json({ ok: true });
});

export default router;
