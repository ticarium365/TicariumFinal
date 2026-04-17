import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  departmentsTable,
  personnelTable,
  leaveRequestsTable,
} from "@workspace/db";
import { eq, and, asc, desc, ilike, or, count } from "drizzle-orm";
import { requireAdmin, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// ─── Zod şemaları ────────────────────────────────────────────────────────────
const DeptBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const PersonnelBody = z.object({
  departmentId: z.number().int().optional().nullable(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tcNo: z.string().length(11).optional().nullable(),
  position: z.string().min(1).max(100),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  startDate: z.string().min(1),
  salary: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

const LeaveBody = z.object({
  personnelId: z.number().int(),
  type: z.enum(["annual", "sick", "maternity", "unpaid", "other"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  days: z.number().int().min(1),
  reason: z.string().optional().nullable(),
});

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Yıllık İzin",
  sick: "Hastalık İzni",
  maternity: "Doğum İzni",
  unpaid: "Ücretsiz İzin",
  other: "Diğer",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMAN YÖNETİMİ
// ─────────────────────────────────────────────────────────────────────────────

// GET /departments
router.get("/departments", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const depts = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.companyId, companyId))
      .orderBy(asc(departmentsTable.name));
    res.json({ departments: depts });
  } catch (err) {
    req.log.error({ err }, "dept list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /departments
router.post("/departments", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const parsed = DeptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  try {
    const [dept] = await db.insert(departmentsTable).values({ companyId, ...parsed.data }).returning();
    res.status(201).json(dept);
  } catch (err) {
    req.log.error({ err }, "dept create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /departments/:id
router.put("/departments/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const parsed = DeptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  try {
    const [updated] = await db.update(departmentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(departmentsTable.id, id), eq(departmentsTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "dept update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /departments/:id
router.delete("/departments/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [deleted] = await db.delete(departmentsTable)
      .where(and(eq(departmentsTable.id, id), eq(departmentsTable.companyId, companyId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "dept delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PERSONEL YÖNETİMİ
// ─────────────────────────────────────────────────────────────────────────────

// GET /personnel — liste (arama + filtre)
router.get("/personnel", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const { q, departmentId, isActive } = req.query as Record<string, string>;
  try {
    const conditions = [eq(personnelTable.companyId, companyId)];
    if (isActive !== undefined) conditions.push(eq(personnelTable.isActive, isActive === "true"));
    if (departmentId) conditions.push(eq(personnelTable.departmentId, parseInt(departmentId, 10)));

    let rows = await db.select({
      id: personnelTable.id,
      companyId: personnelTable.companyId,
      departmentId: personnelTable.departmentId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      tcNo: personnelTable.tcNo,
      position: personnelTable.position,
      phone: personnelTable.phone,
      email: personnelTable.email,
      startDate: personnelTable.startDate,
      salary: personnelTable.salary,
      isActive: personnelTable.isActive,
      notes: personnelTable.notes,
      createdAt: personnelTable.createdAt,
      updatedAt: personnelTable.updatedAt,
      departmentName: departmentsTable.name,
    }).from(personnelTable)
      .leftJoin(departmentsTable, eq(personnelTable.departmentId, departmentsTable.id))
      .where(and(...conditions))
      .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

    if (q) {
      const lower = q.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.firstName.toLowerCase().includes(lower) ||
          p.lastName.toLowerCase().includes(lower) ||
          p.position.toLowerCase().includes(lower) ||
          (p.phone ?? "").includes(lower) ||
          (p.email ?? "").toLowerCase().includes(lower),
      );
    }

    res.json({
      personnel: rows.map((p) => ({ ...p, fullName: `${p.firstName} ${p.lastName}` })),
      total: rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "personnel list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /personnel/stats — özet istatistikler
router.get("/personnel/stats", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const all = await db.select().from(personnelTable).where(eq(personnelTable.companyId, companyId));
    const active = all.filter((p) => p.isActive).length;
    const inactive = all.length - active;
    const pendingLeaves = await db.select({ id: leaveRequestsTable.id })
      .from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.companyId, companyId), eq(leaveRequestsTable.status, "pending")));
    res.json({
      total: all.length,
      active,
      inactive,
      pendingLeaves: pendingLeaves.length,
    });
  } catch (err) {
    req.log.error({ err }, "personnel stats error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /personnel — yeni personel
router.post("/personnel", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const parsed = PersonnelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  try {
    const [person] = await db.insert(personnelTable).values({ companyId, ...parsed.data }).returning();
    res.status(201).json({ ...person, fullName: `${person.firstName} ${person.lastName}` });
  } catch (err) {
    req.log.error({ err }, "personnel create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /personnel/:id
router.get("/personnel/:id", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [person] = await db.select({
      id: personnelTable.id,
      companyId: personnelTable.companyId,
      departmentId: personnelTable.departmentId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      tcNo: personnelTable.tcNo,
      position: personnelTable.position,
      phone: personnelTable.phone,
      email: personnelTable.email,
      startDate: personnelTable.startDate,
      salary: personnelTable.salary,
      isActive: personnelTable.isActive,
      notes: personnelTable.notes,
      createdAt: personnelTable.createdAt,
      updatedAt: personnelTable.updatedAt,
      departmentName: departmentsTable.name,
    }).from(personnelTable)
      .leftJoin(departmentsTable, eq(personnelTable.departmentId, departmentsTable.id))
      .where(and(eq(personnelTable.id, id), eq(personnelTable.companyId, companyId)));
    if (!person) { res.status(404).json({ error: "Bulunamadı" }); return; }

    // İzin geçmişi
    const leaves = await db.select().from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.personnelId, id), eq(leaveRequestsTable.companyId, companyId)))
      .orderBy(desc(leaveRequestsTable.createdAt));

    res.json({
      ...person,
      fullName: `${person.firstName} ${person.lastName}`,
      leaves: leaves.map((l) => ({
        ...l,
        typeLabel: LEAVE_TYPE_LABELS[l.type] ?? l.type,
        statusLabel: STATUS_LABELS[l.status] ?? l.status,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "personnel get error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /personnel/:id
router.put("/personnel/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const parsed = PersonnelBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  try {
    const [updated] = await db.update(personnelTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(personnelTable.id, id), eq(personnelTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json({ ...updated, fullName: `${updated.firstName} ${updated.lastName}` });
  } catch (err) {
    req.log.error({ err }, "personnel update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /personnel/:id/toggle — aktif/pasif
router.patch("/personnel/:id/toggle", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [existing] = await db.select().from(personnelTable)
      .where(and(eq(personnelTable.id, id), eq(personnelTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Bulunamadı" }); return; }
    const [updated] = await db.update(personnelTable)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(personnelTable.id, id))
      .returning();
    res.json({ ok: true, isActive: updated!.isActive });
  } catch (err) {
    req.log.error({ err }, "personnel toggle error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /personnel/:id
router.delete("/personnel/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [deleted] = await db.delete(personnelTable)
      .where(and(eq(personnelTable.id, id), eq(personnelTable.companyId, companyId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "personnel delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// İZİN YÖNETİMİ
// ─────────────────────────────────────────────────────────────────────────────

// GET /leave-requests
router.get("/leave-requests", requireRole(["admin", "staff", "viewer"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const { status, personnelId } = req.query as Record<string, string>;
  try {
    const conditions = [eq(leaveRequestsTable.companyId, companyId)];
    if (status) conditions.push(eq(leaveRequestsTable.status, status));
    if (personnelId) conditions.push(eq(leaveRequestsTable.personnelId, parseInt(personnelId, 10)));

    const rows = await db.select({
      id: leaveRequestsTable.id,
      companyId: leaveRequestsTable.companyId,
      personnelId: leaveRequestsTable.personnelId,
      type: leaveRequestsTable.type,
      startDate: leaveRequestsTable.startDate,
      endDate: leaveRequestsTable.endDate,
      days: leaveRequestsTable.days,
      reason: leaveRequestsTable.reason,
      status: leaveRequestsTable.status,
      approvedBy: leaveRequestsTable.approvedBy,
      approvedAt: leaveRequestsTable.approvedAt,
      createdAt: leaveRequestsTable.createdAt,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      position: personnelTable.position,
    }).from(leaveRequestsTable)
      .innerJoin(personnelTable, eq(leaveRequestsTable.personnelId, personnelTable.id))
      .where(and(...conditions))
      .orderBy(desc(leaveRequestsTable.createdAt));

    res.json({
      leaveRequests: rows.map((r) => ({
        ...r,
        fullName: `${r.firstName} ${r.lastName}`,
        typeLabel: LEAVE_TYPE_LABELS[r.type] ?? r.type,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "leave list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /leave-requests
router.post("/leave-requests", requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const parsed = LeaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() }); return; }
  // Personel bu şirkete ait mi?
  try {
    const [person] = await db.select({ id: personnelTable.id }).from(personnelTable)
      .where(and(eq(personnelTable.id, parsed.data.personnelId), eq(personnelTable.companyId, companyId)));
    if (!person) { res.status(404).json({ error: "Personel bulunamadı" }); return; }

    const [req2] = await db.insert(leaveRequestsTable).values({ companyId, ...parsed.data }).returning();
    res.status(201).json({
      ...req2,
      typeLabel: LEAVE_TYPE_LABELS[req2!.type] ?? req2!.type,
      statusLabel: STATUS_LABELS[req2!.status] ?? req2!.status,
    });
  } catch (err) {
    req.log.error({ err }, "leave create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /leave-requests/:id/approve
router.patch("/leave-requests/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const userId = req.session?.user?.id;
  try {
    const [updated] = await db.update(leaveRequestsTable)
      .set({ status: "approved", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leaveRequestsTable.id, id), eq(leaveRequestsTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json({ ok: true, status: "approved" });
  } catch (err) {
    req.log.error({ err }, "leave approve error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /leave-requests/:id/reject
router.patch("/leave-requests/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const userId = req.session?.user?.id;
  try {
    const [updated] = await db.update(leaveRequestsTable)
      .set({ status: "rejected", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leaveRequestsTable.id, id), eq(leaveRequestsTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json({ ok: true, status: "rejected" });
  } catch (err) {
    req.log.error({ err }, "leave reject error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /leave-requests/:id
router.delete("/leave-requests/:id", requireAdmin, async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [deleted] = await db.delete(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.id, id), eq(leaveRequestsTable.companyId, companyId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "leave delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
