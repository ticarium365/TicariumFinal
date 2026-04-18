// Üretim & Reçete (BOM) modülü
// Reçete: bir mamul + N hammadde × miktar
// Üretim Emri: planned → in_progress → completed (component stoklarını düş, mamul stoğunu artır)
import { Router, type Request, type Response } from "express";
import {
  db, productionRecipesTable, recipeComponentsTable, productionOrdersTable,
  productsTable, stockMovementsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);

// ─── REÇETELER ───
router.get("/recipes", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const rows = await db.select({
    id: productionRecipesTable.id,
    productId: productionRecipesTable.productId,
    name: productionRecipesTable.name,
    outputQuantity: productionRecipesTable.outputQuantity,
    notes: productionRecipesTable.notes,
    isActive: productionRecipesTable.isActive,
    createdAt: productionRecipesTable.createdAt,
    productName: productsTable.name,
    productCode: productsTable.productCode,
  })
    .from(productionRecipesTable)
    .leftJoin(productsTable, eq(productsTable.id, productionRecipesTable.productId))
    .where(eq(productionRecipesTable.companyId, cid))
    .orderBy(desc(productionRecipesTable.createdAt));
  res.json(rows);
});

router.get("/recipes/:id", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  const [recipe] = await db.select().from(productionRecipesTable)
    .where(and(eq(productionRecipesTable.id, id), eq(productionRecipesTable.companyId, cid))).limit(1);
  if (!recipe) return res.status(404).json({ error: "not_found" });
  const components = await db.select({
    id: recipeComponentsTable.id,
    componentProductId: recipeComponentsTable.componentProductId,
    quantity: recipeComponentsTable.quantity,
    unit: recipeComponentsTable.unit,
    productName: productsTable.name,
    productCode: productsTable.productCode,
    stock: productsTable.stock,
    purchasePrice: productsTable.purchasePrice,
  })
    .from(recipeComponentsTable)
    .leftJoin(productsTable, eq(productsTable.id, recipeComponentsTable.componentProductId))
    .where(eq(recipeComponentsTable.recipeId, id));
  res.json({ ...recipe, components });
});

router.post("/recipes", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const { productId, name, outputQuantity, notes, components } = req.body || {};
  if (!productId || !name) return res.status(400).json({ error: "productId & name zorunlu" });

  // Mamul ürün gerçekten bu tenant'a ait mi?
  const [prod] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, Number(productId)), eq(productsTable.companyId, cid))).limit(1);
  if (!prod) return res.status(404).json({ error: "product_not_found" });

  // Tüm component ürünleri tenant'a ait mi?
  const compList = Array.isArray(components) ? components : [];
  for (const c of compList) {
    if (!c.componentProductId || !c.quantity || c.quantity <= 0) {
      return res.status(400).json({ error: "her bileşen için componentProductId ve pozitif quantity zorunlu" });
    }
    const [cp] = await db.select().from(productsTable).where(and(
      eq(productsTable.id, Number(c.componentProductId)), eq(productsTable.companyId, cid),
    )).limit(1);
    if (!cp) return res.status(400).json({ error: `bileşen ürün bulunamadı: ${c.componentProductId}` });
    if (Number(c.componentProductId) === Number(productId)) {
      return res.status(400).json({ error: "mamul ürün kendi bileşeni olamaz" });
    }
  }

  const result = await db.transaction(async (tx) => {
    const [recipe] = await tx.insert(productionRecipesTable).values({
      companyId: cid, productId: Number(productId), name: String(name),
      outputQuantity: Math.max(0.0001, Number(outputQuantity) || 1),
      notes: notes || null,
    }).returning();
    if (compList.length > 0) {
      await tx.insert(recipeComponentsTable).values(compList.map((c: any) => ({
        recipeId: recipe.id,
        componentProductId: Number(c.componentProductId),
        quantity: Number(c.quantity),
        unit: c.unit || null,
      })));
    }
    return recipe;
  });
  res.status(201).json(result);
});

router.delete("/recipes/:id", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  // Açık üretim emri varsa silme
  const [openOrder] = await db.select({ c: sql<number>`count(*)::int` }).from(productionOrdersTable)
    .where(and(
      eq(productionOrdersTable.recipeId, id),
      eq(productionOrdersTable.companyId, cid),
      sql`${productionOrdersTable.status} IN ('planned','in_progress')`,
    ));
  if ((openOrder?.c || 0) > 0) {
    return res.status(409).json({ error: "açık üretim emri var, önce onları kapat" });
  }
  const r = await db.delete(productionRecipesTable)
    .where(and(eq(productionRecipesTable.id, id), eq(productionRecipesTable.companyId, cid)))
    .returning();
  if (r.length === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

// ─── ÜRETİM EMİRLERİ ───
router.get("/orders", async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const rows = await db.select({
    id: productionOrdersTable.id,
    recipeId: productionOrdersTable.recipeId,
    productId: productionOrdersTable.productId,
    plannedQuantity: productionOrdersTable.plannedQuantity,
    producedQuantity: productionOrdersTable.producedQuantity,
    scrapQuantity: productionOrdersTable.scrapQuantity,
    status: productionOrdersTable.status,
    notes: productionOrdersTable.notes,
    createdAt: productionOrdersTable.createdAt,
    completedAt: productionOrdersTable.completedAt,
    recipeName: productionRecipesTable.name,
    productName: productsTable.name,
    productCode: productsTable.productCode,
  })
    .from(productionOrdersTable)
    .leftJoin(productionRecipesTable, eq(productionRecipesTable.id, productionOrdersTable.recipeId))
    .leftJoin(productsTable, eq(productsTable.id, productionOrdersTable.productId))
    .where(eq(productionOrdersTable.companyId, cid))
    .orderBy(desc(productionOrdersTable.createdAt))
    .limit(100);
  res.json(rows);
});

router.post("/orders", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const { recipeId, plannedQuantity, notes } = req.body || {};
  if (!recipeId || !plannedQuantity) return res.status(400).json({ error: "recipeId & plannedQuantity zorunlu" });
  const qty = Number(plannedQuantity);
  if (qty <= 0) return res.status(400).json({ error: "plannedQuantity > 0 olmalı" });

  const [recipe] = await db.select().from(productionRecipesTable)
    .where(and(eq(productionRecipesTable.id, Number(recipeId)), eq(productionRecipesTable.companyId, cid))).limit(1);
  if (!recipe) return res.status(404).json({ error: "recipe_not_found" });

  const [order] = await db.insert(productionOrdersTable).values({
    companyId: cid, recipeId: recipe.id, productId: recipe.productId,
    plannedQuantity: qty, status: "planned",
    notes: notes || null, createdBy: req.session.user!.id,
  }).returning();
  res.status(201).json(order);
});

// Üretim emrini tamamla — atomic stok hareketleri
router.post("/orders/:id/complete", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  const producedQty = Number(req.body?.producedQuantity) || 0;
  const scrapQty = Number(req.body?.scrapQuantity) || 0;
  if (producedQty <= 0) return res.status(400).json({ error: "producedQuantity > 0 olmalı" });

  try {
    const result = await db.transaction(async (tx) => {
      // Concurrency: önce siparişi kilitle (FOR UPDATE) ve durumu eş zamanlı garanti et
      const lockedRows = await tx.execute(sql`
        SELECT id, recipe_id, product_id, status FROM production_orders
        WHERE id = ${id} AND company_id = ${cid}
          AND status IN ('planned','in_progress')
        FOR UPDATE
      `);
      const lockedArr = (lockedRows as any).rows ?? lockedRows;
      const order = Array.isArray(lockedArr) ? lockedArr[0] : null;
      if (!order) {
        // Var ama kilitlenmemişse → ya yok ya da zaten kapalı
        const [existing] = await tx.select().from(productionOrdersTable)
          .where(and(eq(productionOrdersTable.id, id), eq(productionOrdersTable.companyId, cid))).limit(1);
        if (!existing) throw new Error("order_not_found");
        throw new Error(`order_already_${existing.status}`);
      }

      const recipeId = (order as any).recipe_id;
      const productId = (order as any).product_id;

      // Bileşenleri al
      const components = await tx.select({
        componentProductId: recipeComponentsTable.componentProductId,
        quantity: recipeComponentsTable.quantity,
        productName: productsTable.name,
        productCode: productsTable.productCode,
      })
        .from(recipeComponentsTable)
        .innerJoin(productsTable, and(
          eq(productsTable.id, recipeComponentsTable.componentProductId),
          eq(productsTable.companyId, cid),
        ))
        .where(eq(recipeComponentsTable.recipeId, recipeId));

      const [recipe] = await tx.select().from(productionRecipesTable)
        .where(and(eq(productionRecipesTable.id, recipeId), eq(productionRecipesTable.companyId, cid))).limit(1);
      if (!recipe) throw new Error("recipe_not_found");
      const batchMultiplier = (producedQty + scrapQty) / Math.max(0.0001, recipe.outputQuantity);

      // Bileşenleri ATOMIK stok-yeterli koşulu ile düş (race-safe)
      for (const c of components) {
        const need = c.quantity * batchMultiplier;
        const needInt = Math.ceil(need);
        const updated = await tx.update(productsTable)
          .set({ stock: sql`${productsTable.stock} - ${needInt}`, updatedAt: new Date() })
          .where(and(
            eq(productsTable.id, c.componentProductId),
            eq(productsTable.companyId, cid),
            sql`${productsTable.stock} >= ${needInt}`,
          ))
          .returning({ id: productsTable.id });
        if (updated.length === 0) {
          throw new Error(`insufficient_stock:${c.productName} (gerekli ${needInt})`);
        }
        await tx.insert(stockMovementsTable).values({
          companyId: cid, productId: c.componentProductId,
          productName: c.productName || "", productCode: c.productCode || "",
          type: "production_consume", quantity: -needInt,
          note: `Üretim emri #${id} tüketimi`, refId: id,
          createdBy: String(req.session.user!.id),
        });
      }

      // Mamul stoğunu artır + hareket kaydet
      const producedInt = Math.floor(producedQty);
      if (producedInt > 0) {
        const [mainProd] = await tx.select().from(productsTable)
          .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, cid))).limit(1);
        if (!mainProd) throw new Error("output_product_not_found");
        await tx.update(productsTable)
          .set({ stock: sql`${productsTable.stock} + ${producedInt}`, updatedAt: new Date() })
          .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, cid)));
        await tx.insert(stockMovementsTable).values({
          companyId: cid, productId,
          productName: mainProd.name || "", productCode: mainProd.productCode || "",
          type: "production_output", quantity: producedInt,
          note: `Üretim emri #${id} mamul`, refId: id,
          createdBy: String(req.session.user!.id),
        });
      }

      // Durum koşullu güncelleme (yine de status guard ile)
      const [updated] = await tx.update(productionOrdersTable).set({
        status: "completed",
        producedQuantity: producedQty,
        scrapQuantity: scrapQty,
        completedAt: new Date(),
      }).where(and(
        eq(productionOrdersTable.id, id),
        eq(productionOrdersTable.companyId, cid),
        sql`${productionOrdersTable.status} IN ('planned','in_progress')`,
      )).returning();
      if (!updated) throw new Error("order_already_completed");
      return updated;
    });
    res.json(result);
  } catch (e: any) {
    const msg = String(e?.message || "fail");
    if (msg.startsWith("insufficient_stock:")) return res.status(409).json({ error: msg });
    if (msg === "order_not_found") return res.status(404).json({ error: msg });
    if (msg.startsWith("order_already_")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

router.post("/orders/:id/cancel", requireWriter, async (req: Request, res: Response) => {
  const cid = req.companyId!;
  const id = Number(req.params.id);
  const [updated] = await db.update(productionOrdersTable).set({
    status: "cancelled", completedAt: new Date(),
  }).where(and(
    eq(productionOrdersTable.id, id),
    eq(productionOrdersTable.companyId, cid),
    sql`${productionOrdersTable.status} IN ('planned','in_progress')`,
  )).returning();
  if (!updated) return res.status(404).json({ error: "not_found_or_already_closed" });
  res.json(updated);
});

export default router;
