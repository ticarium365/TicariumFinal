import { Router, type Request, type Response } from "express";
import { db, ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

export const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;

// ─── GET /orders ───────────────────────────────────────────────────────────────
router.get("/orders/stats", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  try {
    const rows = await db.select({
      status: ordersTable.status,
      count: sql<number>`count(*)::int`,
    }).from(ordersTable).where(eq(ordersTable.companyId, cid))
      .groupBy(ordersTable.status);
    const total = rows.reduce((s, r) => s + r.count, 0);
    res.json({ total, byStatus: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.get("/orders", requireAuth, async (req: Request, res: Response) => {
  const cid = req.companyId;
  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;
  try {
    const conditions: any[] = [eq(ordersTable.companyId, cid)];
    if (status && ORDER_STATUSES.includes(status as any)) {
      conditions.push(eq(ordersTable.status, status));
    }
    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(limitNum).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(ordersTable).where(and(...conditions));
    res.json({ orders, pagination: { page: pageNum, limit: limitNum, total: count, pages: Math.ceil(count / limitNum) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── POST /orders ──────────────────────────────────────────────────────────────
router.post("/orders", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const { customerName, customerEmail, customerPhone, notes, items, source = "manual" } = req.body as {
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    notes?: string;
    source?: string;
    items: Array<{ productId: number; quantity: number; unitPrice: number }>;
  };
  if (!customerName || !Array.isArray(items) || items.length === 0) {
    return void res.status(400).json({ message: "customerName ve items zorunlu" });
  }
  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toFixed(2);

    const [order] = await db.insert(ordersTable).values({
      companyId: cid,
      orderNo: `ORD-${dateStr}-TEMP`,
      customerName,
      customerEmail,
      customerPhone,
      notes,
      totalAmount,
      source,
    }).returning();
    const orderNo = `ORD-${dateStr}-${String(order.id).padStart(4, "0")}`;
    await db.update(ordersTable).set({ orderNo }).where(eq(ordersTable.id, order.id));
    (order as any).orderNo = orderNo;

    for (const item of items) {
      const [product] = await db.select({ name: productsTable.name, barcode: productsTable.barcode })
        .from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.companyId, cid)));
      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: item.productId,
        productName: product?.name ?? "Bilinmeyen ürün",
        barcode: product?.barcode ?? null,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        totalPrice: String((item.quantity * item.unitPrice).toFixed(2)),
      });
    }
    res.status(201).json({ order });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── GET /orders/:id ──────────────────────────────────────────────────────────
router.get("/orders/:id", requireAuth, async (req: Request, res: Response) => {
  const cid = req.companyId;
  const id = Number(req.params.id);
  if (isNaN(id)) return void res.status(400).json({ message: "Geçersiz ID" });
  try {
    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, cid)));
    if (!order) return void res.status(404).json({ message: "Sipariş bulunamadı" });
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    res.json({ ...order, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── PATCH /orders/:id/status ─────────────────────────────────────────────────
router.patch("/orders/:id/status", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const id = Number(req.params.id);
  if (isNaN(id)) return void res.status(400).json({ message: "Geçersiz ID" });
  const { status } = req.body as { status: string };
  if (!ORDER_STATUSES.includes(status as any)) {
    return void res.status(400).json({ message: `Geçersiz durum` });
  }
  try {
    const [updated] = await db.update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, cid)))
      .returning();
    if (!updated) return void res.status(404).json({ message: "Sipariş bulunamadı" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// ─── DELETE /orders/:id ───────────────────────────────────────────────────────
router.delete("/orders/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const id = Number(req.params.id);
  if (isNaN(id)) return void res.status(400).json({ message: "Geçersiz ID" });
  try {
    const [existing] = await db.select({ id: ordersTable.id, status: ordersTable.status })
      .from(ordersTable).where(and(eq(ordersTable.id, id), eq(ordersTable.companyId, cid)));
    if (!existing) return void res.status(404).json({ message: "Sipariş bulunamadı" });
    if (!["pending", "cancelled"].includes(existing.status)) {
      return void res.status(409).json({ message: "Sadece bekleyen veya iptal edilmiş siparişler silinebilir" });
    }
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

export default router;
