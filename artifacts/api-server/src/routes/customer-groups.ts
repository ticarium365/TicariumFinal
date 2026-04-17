import { Router, type Request, type Response } from "express";
import { db, customerGroupsTable, customerGroupMembersTable, customersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// ─── GET /customer-groups ─────────────────────────────────────────────────────
router.get("/customer-groups", requireAuth, async (req: Request, res: Response) => {
  const cid = req.companyId;
  try {
    const groups = await db.select({
      id: customerGroupsTable.id,
      name: customerGroupsTable.name,
      description: customerGroupsTable.description,
      discountPct: customerGroupsTable.discountPct,
      isActive: customerGroupsTable.isActive,
      memberCount: sql<number>`(select count(*)::int from customer_group_members where group_id = ${customerGroupsTable.id})`,
      createdAt: customerGroupsTable.createdAt,
    }).from(customerGroupsTable)
      .where(eq(customerGroupsTable.companyId, cid))
      .orderBy(customerGroupsTable.name);
    res.json({ groups });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── POST /customer-groups ────────────────────────────────────────────────────
router.post("/customer-groups", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const { name, description, discountPct = 0 } = req.body as {
    name: string;
    description?: string;
    discountPct?: number;
  };
  if (!name) return void res.status(400).json({ message: "name zorunlu" });
  if (discountPct < 0 || discountPct > 100) {
    return void res.status(400).json({ message: "discountPct 0-100 arasında olmalı" });
  }
  try {
    const [group] = await db.insert(customerGroupsTable)
      .values({ companyId: cid, name, description, discountPct })
      .returning();
    res.status(201).json({ group });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── GET /customer-groups/:id ─────────────────────────────────────────────────
router.get("/customer-groups/:id", requireAuth, async (req: Request, res: Response) => {
  const cid = req.companyId;
  const id = Number(req.params.id);
  if (isNaN(id)) return void res.status(400).json({ message: "Geçersiz ID" });
  try {
    const [group] = await db.select().from(customerGroupsTable)
      .where(and(eq(customerGroupsTable.id, id), eq(customerGroupsTable.companyId, cid)));
    if (!group) return void res.status(404).json({ message: "Grup bulunamadı" });
    const members = await db.select({
      id: customerGroupMembersTable.id,
      customerId: customerGroupMembersTable.customerId,
      customerName: customersTable.name,
      addedAt: customerGroupMembersTable.addedAt,
    }).from(customerGroupMembersTable)
      .leftJoin(customersTable, eq(customerGroupMembersTable.customerId, customersTable.id))
      .where(eq(customerGroupMembersTable.groupId, id));
    res.json({ ...group, members });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── PUT /customer-groups/:id ─────────────────────────────────────────────────
router.put("/customer-groups/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const id = Number(req.params.id);
  if (isNaN(id)) return void res.status(400).json({ message: "Geçersiz ID" });
  const { name, description, discountPct, isActive } = req.body as {
    name?: string;
    description?: string;
    discountPct?: number;
    isActive?: boolean;
  };
  if (discountPct !== undefined && (discountPct < 0 || discountPct > 100)) {
    return void res.status(400).json({ message: "discountPct 0-100 arasında olmalı" });
  }
  try {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (discountPct !== undefined) data.discountPct = discountPct;
    if (isActive !== undefined) data.isActive = isActive;
    const [updated] = await db.update(customerGroupsTable)
      .set(data as any)
      .where(and(eq(customerGroupsTable.id, id), eq(customerGroupsTable.companyId, cid)))
      .returning();
    if (!updated) return void res.status(404).json({ message: "Grup bulunamadı" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── DELETE /customer-groups/:id ─────────────────────────────────────────────
router.delete("/customer-groups/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const id = Number(req.params.id);
  if (isNaN(id)) return void res.status(400).json({ message: "Geçersiz ID" });
  try {
    const [deleted] = await db.delete(customerGroupsTable)
      .where(and(eq(customerGroupsTable.id, id), eq(customerGroupsTable.companyId, cid)))
      .returning();
    if (!deleted) return void res.status(404).json({ message: "Grup bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── POST /customer-groups/:id/members ───────────────────────────────────────
router.post("/customer-groups/:id/members", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const groupId = Number(req.params.id);
  if (isNaN(groupId)) return void res.status(400).json({ message: "Geçersiz ID" });
  const { customerId } = req.body as { customerId: number };
  if (!customerId) return void res.status(400).json({ message: "customerId zorunlu" });
  try {
    const [group] = await db.select({ id: customerGroupsTable.id })
      .from(customerGroupsTable)
      .where(and(eq(customerGroupsTable.id, groupId), eq(customerGroupsTable.companyId, cid)));
    if (!group) return void res.status(404).json({ message: "Grup bulunamadı" });
    const [member] = await db.insert(customerGroupMembersTable)
      .values({ groupId, customerId, companyId: cid })
      .onConflictDoNothing()
      .returning();
    res.status(201).json({ member: member ?? { groupId, customerId } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── DELETE /customer-groups/:id/members/:customerId ─────────────────────────
router.delete("/customer-groups/:id/members/:customerId", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const groupId = Number(req.params.id);
  const customerId = Number(req.params.customerId);
  if (isNaN(groupId) || isNaN(customerId)) return void res.status(400).json({ message: "Geçersiz ID" });
  try {
    const [deleted] = await db.delete(customerGroupMembersTable)
      .where(and(
        eq(customerGroupMembersTable.groupId, groupId),
        eq(customerGroupMembersTable.customerId, customerId),
        eq(customerGroupMembersTable.companyId, cid),
      )).returning();
    if (!deleted) return void res.status(404).json({ message: "Üye bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

export default router;
